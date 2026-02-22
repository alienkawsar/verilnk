import { prisma } from '../db/client';
import {
  BillingGateway,
  Invoice,
  InvoiceStatus,
  PaymentAttempt,
  PaymentAttemptStatus,
  PlanStatus,
  PlanType,
  SubscriptionStatus,
  TrialStatus,
} from '@prisma/client';
import axios from 'axios';
import crypto from 'crypto';
import Stripe from 'stripe';
import * as organizationService from './organization.service';
import {
  computeInvoiceIntegrity,
  validateInvoiceIntegrity,
} from './billing-security.service';
import {
  getConfiguredPaymentProvider,
  getSslcommerzSandboxMode,
  PaymentProvider,
} from '../config/payment.config';
import {
  BillingTerm,
  billingTermToDurationDays,
  resolveBillingTerm,
  resolvePlanChargeAmountCents,
} from './billing-pricing.service';

const PAYMENT_MODE = (process.env.PAYMENT_MODE || 'mock').toLowerCase();
const DEFAULT_APP_URL = 'http://localhost:3000';

const buildMockId = (prefix: string) =>
  `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

let stripeClient: Stripe | null = null;

const stableStringify = (payload: Record<string, unknown>) => {
  const sorted = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = payload[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
};

const computeHash = (payload: Record<string, unknown>) => {
  return crypto
    .createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex');
};

const buildInvoiceNumber = () => {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  return `INV-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

const ensureBillingAccount = async (
  organizationId: string,
  details?: { billingEmail?: string; billingName?: string },
) => {
  const existing = await prisma.billingAccount.findUnique({
    where: { organizationId },
  });
  if (existing) {
    if (
      (details?.billingEmail &&
        existing.billingEmail !== details.billingEmail) ||
      (details?.billingName && existing.billingName !== details.billingName)
    ) {
      return prisma.billingAccount.update({
        where: { id: existing.id },
        data: {
          billingEmail: details?.billingEmail ?? existing.billingEmail,
          billingName: details?.billingName ?? existing.billingName,
        },
      });
    }
    return existing;
  }

  return prisma.billingAccount.create({
    data: {
      organizationId,
      gateway: BillingGateway.NONE,
      billingEmail: details?.billingEmail,
      billingName: details?.billingName,
    },
  });
};

export const createMockCheckout = async (params: {
  organizationId: string;
  planType: PlanType;
  amountCents: number;
  currency?: string;
  durationDays?: number;
  billingTerm?: BillingTerm;
  billingEmail?: string;
  billingName?: string;
  idempotencyKey?: string;
  simulate?: 'success' | 'failure';
}) => {
  if (PAYMENT_MODE !== 'mock') {
    throw new Error('Mock checkout is disabled');
  }

  const billingTerm = resolveBillingTerm(
    params.billingTerm || null,
    params.durationDays,
  );
  const durationDays =
    typeof params.durationDays === 'number' &&
    Number.isFinite(params.durationDays) &&
    params.durationDays > 0
      ? Math.floor(params.durationDays)
      : billingTermToDurationDays(billingTerm);
  const amountCents = resolvePlanChargeAmountCents({
    planType: params.planType,
    billingTerm,
    requestedAmountCents: params.amountCents,
  });
  const currency = params.currency || 'USD';

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
  });
  if (!org) {
    throw new Error('Organization not found');
  }

  const billingAccount = await ensureBillingAccount(params.organizationId, {
    billingEmail: params.billingEmail ?? org.email,
    billingName: params.billingName ?? org.name,
  });

  const payloadHash = computeHash({
    organizationId: params.organizationId,
    planType: params.planType,
    amountCents,
    currency,
    billingTerm,
    durationDays,
  });

  if (params.idempotencyKey) {
    const existingAttempt = await prisma.paymentAttempt.findFirst({
      where: {
        billingAccountId: billingAccount.id,
        idempotencyKey: params.idempotencyKey,
      },
      include: { invoice: true },
    });

    if (existingAttempt) {
      if (
        existingAttempt.requestHash &&
        existingAttempt.requestHash !== payloadHash
      ) {
        throw new Error('Idempotency key reuse with different payload');
      }

      return {
        paymentAttempt: existingAttempt,
        invoice: existingAttempt.invoice,
        callbackUrl: '/api/billing/mock/callback',
      };
    }
  }

  const invoiceMetadata = {
    planType: params.planType,
    billingTerm,
    durationDays,
    organizationId: params.organizationId,
  };

  const invoiceIntegrityHash = computeInvoiceIntegrity({
    planType: params.planType,
    amountCents,
    currency,
    organizationId: params.organizationId,
  });

  const invoice = await prisma.invoice.create({
    data: {
      billingAccountId: billingAccount.id,
      status: InvoiceStatus.OPEN,
      amountCents,
      currency,
      invoiceNumber: buildInvoiceNumber(),
      metadata: invoiceMetadata as any,
      integrityHash: invoiceIntegrityHash,
    },
  });

  const paymentAttempt = await prisma.paymentAttempt.create({
    data: {
      billingAccountId: billingAccount.id,
      invoiceId: invoice.id,
      status: PaymentAttemptStatus.PENDING,
      amountCents,
      currency,
      gateway: BillingGateway.MOCK,
      gatewayPaymentId: buildMockId('mock_pay'),
      idempotencyKey: params.idempotencyKey,
      requestHash: payloadHash,
    },
  });

  if (params.simulate) {
    return processMockCallback({
      paymentAttemptId: paymentAttempt.id,
      result: params.simulate,
    });
  }

  return {
    paymentAttempt,
    invoice,
    callbackUrl: '/api/billing/mock/callback',
  };
};

export const provisionOrganizationPlanFromCheckout = async (params: {
  organizationId: string;
  planType: PlanType;
  billingTerm?: BillingTerm;
  amountCents?: number;
  currency?: string;
  durationDays?: number;
  billingEmail?: string;
  billingName?: string;
  idempotencyKey?: string;
}) => {
  // Discovery note (backend/src/services/billing.service.ts):
  // Public /billing/mock/checkout is the canonical invoice+subscription flow.
  // Super Admin org creation reuses this path to avoid divergent billing logic.
  const billingTerm = resolveBillingTerm(
    params.billingTerm || null,
    params.durationDays,
  );
  const durationDays =
    typeof params.durationDays === 'number' &&
    Number.isFinite(params.durationDays) &&
    params.durationDays > 0
      ? Math.floor(params.durationDays)
      : billingTermToDurationDays(billingTerm);
  const amountCents = resolvePlanChargeAmountCents({
    planType: params.planType,
    billingTerm,
    requestedAmountCents: params.amountCents,
  });

  const checkoutResult = await createMockCheckout({
    organizationId: params.organizationId,
    planType: params.planType,
    amountCents,
    currency: params.currency || 'USD',
    durationDays,
    billingTerm,
    billingEmail: params.billingEmail,
    billingName: params.billingName,
    idempotencyKey: params.idempotencyKey,
    simulate: 'success',
  });

  return {
    ...checkoutResult,
    billingTerm,
    durationDays,
    amountCents,
  };
};

export const processMockCallback = async (params: {
  paymentAttemptId: string;
  result: 'success' | 'failure';
}) => {
  if (PAYMENT_MODE !== 'mock') {
    throw new Error('Mock callback is disabled');
  }

  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: params.paymentAttemptId },
    include: {
      invoice: true,
      billingAccount: true,
    },
  });

  if (!attempt) {
    throw new Error('Payment attempt not found');
  }

  if (attempt.status !== PaymentAttemptStatus.PENDING) {
    return {
      paymentAttempt: attempt,
      invoice: attempt.invoice,
      idempotent: true,
      replayed: true,
    };
  }

  if (!attempt.invoice) {
    throw new Error('Invoice not found');
  }

  if (
    attempt.amountCents !== attempt.invoice.amountCents ||
    attempt.currency !== attempt.invoice.currency
  ) {
    throw new Error('Amount validation failed');
  }

  const integrityCheck = validateInvoiceIntegrity({
    organizationId: (attempt.invoice.metadata as any)?.organizationId,
    planType: (attempt.invoice.metadata as any)?.planType,
    amountCents: attempt.invoice.amountCents,
    currency: attempt.invoice.currency,
    integrityHash: attempt.invoice.integrityHash,
  });

  if (!integrityCheck.valid) {
    await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentAttemptStatus.FAILED,
          processedAt: new Date(),
          errorMessage: 'Invoice integrity validation failed',
        },
      }),
      prisma.invoice.update({
        where: { id: attempt.invoice.id },
        data: {
          status: InvoiceStatus.VOID,
        },
      }),
    ]);
    throw new Error('Invoice integrity validation failed');
  }

  const now = new Date();

  if (params.result === 'failure') {
    const [paymentAttempt, invoice] = await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentAttemptStatus.FAILED,
          processedAt: now,
          errorMessage: 'Mock payment failed',
        },
      }),
      prisma.invoice.update({
        where: { id: attempt.invoice.id },
        data: {
          status: InvoiceStatus.VOID,
        },
      }),
    ]);

    return { paymentAttempt, invoice };
  }

  const metadata = (attempt.invoice.metadata || {}) as {
    planType?: PlanType;
    billingTerm?: BillingTerm;
    durationDays?: number | null;
  };
  const planType = metadata.planType;
  if (!planType) {
    throw new Error('Plan type missing from invoice metadata');
  }
  const durationDays =
    typeof metadata.durationDays === 'number' &&
    Number.isFinite(metadata.durationDays)
      ? Math.max(1, Math.floor(metadata.durationDays))
      : 30;
  const billingTerm = resolveBillingTerm(
    metadata.billingTerm || null,
    durationDays,
  );

  const subscriptionPeriodEnd = new Date(now);
  subscriptionPeriodEnd.setDate(subscriptionPeriodEnd.getDate() + durationDays);

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      billingAccountId: attempt.billingAccountId,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  const activeTrial = await prisma.trialSession.findFirst({
    where: {
      billingAccountId: attempt.billingAccountId,
      status: TrialStatus.ACTIVE,
    },
  });

  const [paymentAttempt, invoice, subscription] = await prisma.$transaction([
    prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentAttemptStatus.SUCCESS,
        processedAt: now,
        gatewayPaymentId: attempt.gatewayPaymentId || buildMockId('mock_txn'),
      },
    }),
    prisma.invoice.update({
      where: { id: attempt.invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: now,
      },
    }),
    prisma.subscription.create({
      data: {
        billingAccountId: attempt.billingAccountId,
        planType,
        status: SubscriptionStatus.ACTIVE,
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: subscriptionPeriodEnd,
        metadata: {
          billingTerm,
          durationDays,
        } as any,
      },
    }),
  ]);

  if (activeSubscription) {
    await prisma.subscription.update({
      where: { id: activeSubscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: now,
      },
    });
  }

  if (activeTrial) {
    await prisma.trialSession.update({
      where: { id: activeTrial.id },
      data: {
        status: TrialStatus.CONVERTED,
        convertedAt: now,
      },
    });
  }

  await prisma.billingAccount.update({
    where: { id: attempt.billingAccountId },
    data: {
      gateway: BillingGateway.MOCK,
    },
  });

  await organizationService.updateOrganizationPlan(
    attempt.billingAccount.organizationId,
    {
      planType,
      planStatus: PlanStatus.ACTIVE,
      durationDays,
    },
  );

  return {
    paymentAttempt,
    invoice,
    subscription,
  };
};

type CheckoutStartParams = {
  organizationId: string;
  planType: PlanType;
  billingTerm: BillingTerm;
  idempotencyKey?: string;
};

type StripeWebhookParams = {
  rawBody: string | Buffer;
  signature?: string;
};

type SSLCommerzCallbackKind = 'success' | 'fail' | 'cancel';

type SSLCommerzCallbackParams = {
  kind: SSLCommerzCallbackKind;
  payload: Record<string, unknown>;
};

const PROVIDER_GATEWAY_MAP: Record<PaymentProvider, BillingGateway> = {
  stripe: BillingGateway.STRIPE,
  sslcommerz: BillingGateway.SSLCOMMERZ,
};

const SELF_SERVE_CHECKOUT_PLANS = new Set<PlanType>([
  PlanType.BASIC,
  PlanType.PRO,
  PlanType.BUSINESS,
]);

const resolveAppUrl = () => {
  const appUrl = (
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    DEFAULT_APP_URL
  ).trim();
  return appUrl.replace(/\/+$/g, '');
};

const resolveSSLCommerzBaseUrl = () => {
  return getSslcommerzSandboxMode()
    ? 'https://sandbox.sslcommerz.com'
    : 'https://securepay.sslcommerz.com';
};

const normalizeCurrency = (currency?: string | null) => {
  return (currency || 'USD').trim().toUpperCase();
};

const coerceString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string')
    return value[0].trim();
  return '';
};

const parseAmountToCents = (value: unknown): number | null => {
  const numeric = Number(coerceString(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
};

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
};

const buildUpgradeReturnUrl = (
  status: 'success' | 'failed' | 'canceled',
  attemptId?: string,
) => {
  const params = new URLSearchParams();
  params.set('status', status);
  if (attemptId) {
    params.set('attempt', attemptId);
  }
  return `${resolveAppUrl()}/org/upgrade?${params.toString()}`;
};

const assertCheckoutPlan = (planType: PlanType) => {
  if (!SELF_SERVE_CHECKOUT_PLANS.has(planType)) {
    throw new Error('Selected plan is not available for self-serve checkout');
  }
};

const resolveCheckoutDurationDays = (billingTerm: BillingTerm) => {
  return billingTermToDurationDays(billingTerm);
};

const getInvoiceMetadata = (invoice: Invoice) => {
  if (!invoice.metadata || typeof invoice.metadata !== 'object') {
    return {} as Record<string, unknown>;
  }
  return invoice.metadata as Record<string, unknown>;
};

const upsertInvoiceMetadata = async (
  invoice: Invoice,
  patch: Record<string, unknown>,
) => {
  const merged = {
    ...getInvoiceMetadata(invoice),
    ...patch,
  };
  return prisma.invoice.update({
    where: { id: invoice.id },
    data: { metadata: merged as any },
  });
};

const resolveDurationFromInvoiceMetadata = (
  metadata: Record<string, unknown>,
): number => {
  if (
    typeof metadata.durationDays === 'number' &&
    Number.isFinite(metadata.durationDays)
  ) {
    return Math.max(1, Math.floor(metadata.durationDays));
  }
  const billingTerm = metadata.billingTerm === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  return resolveCheckoutDurationDays(billingTerm);
};

const createPendingAttempt = async (params: {
  organizationId: string;
  planType: PlanType;
  billingTerm: BillingTerm;
  provider: PaymentProvider;
  amountCents: number;
  currency: string;
  idempotencyKey?: string;
}) => {
  const organization = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      address: true,
      phone: true,
    },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  const billingAccount = await ensureBillingAccount(params.organizationId, {
    billingEmail: organization.email,
    billingName: organization.name,
  });

  const durationDays = resolveCheckoutDurationDays(params.billingTerm);
  const requestHash = computeHash({
    organizationId: params.organizationId,
    planType: params.planType,
    billingTerm: params.billingTerm,
    provider: params.provider,
    amountCents: params.amountCents,
    currency: params.currency,
    durationDays,
  });

  if (params.idempotencyKey) {
    const existingAttempt = await prisma.paymentAttempt.findFirst({
      where: {
        billingAccountId: billingAccount.id,
        idempotencyKey: params.idempotencyKey,
      },
      include: { invoice: true },
    });

    if (existingAttempt) {
      if (
        existingAttempt.requestHash &&
        existingAttempt.requestHash !== requestHash
      ) {
        throw new Error('Idempotency key reuse with different payload');
      }
      if (!existingAttempt.invoice) {
        throw new Error('Invoice not found for idempotent checkout request');
      }

      const existingMetadata = getInvoiceMetadata(existingAttempt.invoice);
      const redirectUrl =
        typeof existingMetadata.checkoutRedirectUrl === 'string'
          ? existingMetadata.checkoutRedirectUrl
          : null;

      return {
        organization,
        billingAccount,
        paymentAttempt: existingAttempt,
        invoice: existingAttempt.invoice,
        idempotent: true,
        redirectUrl,
      };
    }
  }

  const invoiceMetadata: Record<string, unknown> = {
    planType: params.planType,
    billingTerm: params.billingTerm,
    durationDays,
    organizationId: params.organizationId,
    provider: params.provider,
  };

  const integrityHash = computeInvoiceIntegrity({
    planType: params.planType,
    amountCents: params.amountCents,
    currency: params.currency,
    organizationId: params.organizationId,
  });

  const invoice = await prisma.invoice.create({
    data: {
      billingAccountId: billingAccount.id,
      status: InvoiceStatus.OPEN,
      amountCents: params.amountCents,
      currency: params.currency,
      invoiceNumber: buildInvoiceNumber(),
      metadata: invoiceMetadata as any,
      integrityHash,
    },
  });

  const paymentAttempt = await prisma.paymentAttempt.create({
    data: {
      billingAccountId: billingAccount.id,
      invoiceId: invoice.id,
      status: PaymentAttemptStatus.PENDING,
      amountCents: params.amountCents,
      currency: params.currency,
      gateway: PROVIDER_GATEWAY_MAP[params.provider],
      idempotencyKey: params.idempotencyKey,
      requestHash,
    },
  });

  return {
    organization,
    billingAccount,
    paymentAttempt,
    invoice,
    idempotent: false as const,
    redirectUrl: null,
  };
};

const markAttemptFailed = async (params: {
  paymentAttemptId: string;
  gateway: BillingGateway;
  status?: PaymentAttemptStatus;
  gatewayPaymentId?: string | null;
  reason: string;
}) => {
  const status =
    params.status === PaymentAttemptStatus.CANCELED
      ? PaymentAttemptStatus.CANCELED
      : PaymentAttemptStatus.FAILED;

  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: params.paymentAttemptId },
    include: { invoice: true },
  });

  if (!attempt) {
    throw new Error('Payment attempt not found');
  }

  if (attempt.status === PaymentAttemptStatus.SUCCESS) {
    return {
      paymentAttempt: attempt,
      invoice: attempt.invoice,
      idempotent: true,
    };
  }

  if (attempt.status !== PaymentAttemptStatus.PENDING) {
    return {
      paymentAttempt: attempt,
      invoice: attempt.invoice,
      idempotent: true,
    };
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const paymentAttempt = await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status,
        processedAt: now,
        gateway: params.gateway,
        gatewayPaymentId: params.gatewayPaymentId || attempt.gatewayPaymentId,
        errorMessage: params.reason,
      },
    });

    let invoice = attempt.invoice;
    if (attempt.invoice) {
      invoice = await tx.invoice.update({
        where: { id: attempt.invoice.id },
        data: {
          status: InvoiceStatus.VOID,
        },
      });
    }

    return { paymentAttempt, invoice };
  });

  return { ...result, idempotent: false };
};

const activateSuccessfulPayment = async (params: {
  paymentAttemptId: string;
  gateway: BillingGateway;
  gatewayPaymentId?: string | null;
  expectedAmountCents?: number | null;
  expectedCurrency?: string | null;
}) => {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: params.paymentAttemptId },
    include: {
      invoice: true,
      billingAccount: true,
    },
  });

  if (!attempt) {
    throw new Error('Payment attempt not found');
  }

  if (attempt.status === PaymentAttemptStatus.SUCCESS) {
    return {
      paymentAttempt: attempt,
      invoice: attempt.invoice,
      idempotent: true,
      replayed: true,
    };
  }

  if (attempt.status !== PaymentAttemptStatus.PENDING) {
    return {
      paymentAttempt: attempt,
      invoice: attempt.invoice,
      idempotent: true,
    };
  }

  if (!attempt.invoice) {
    throw new Error('Invoice not found');
  }

  if (
    attempt.amountCents !== attempt.invoice.amountCents ||
    attempt.currency !== attempt.invoice.currency
  ) {
    throw new Error('Amount validation failed');
  }

  if (
    typeof params.expectedAmountCents === 'number' &&
    Number.isFinite(params.expectedAmountCents) &&
    params.expectedAmountCents > 0 &&
    params.expectedAmountCents !== attempt.amountCents
  ) {
    throw new Error('Provider amount mismatch');
  }

  const expectedCurrency = normalizeCurrency(
    params.expectedCurrency || undefined,
  );
  if (
    expectedCurrency &&
    expectedCurrency !== normalizeCurrency(attempt.currency)
  ) {
    throw new Error('Provider currency mismatch');
  }

  const invoiceMetadata = getInvoiceMetadata(attempt.invoice);
  const integrityCheck = validateInvoiceIntegrity({
    organizationId:
      typeof invoiceMetadata.organizationId === 'string'
        ? invoiceMetadata.organizationId
        : undefined,
    planType:
      typeof invoiceMetadata.planType === 'string'
        ? invoiceMetadata.planType
        : undefined,
    amountCents: attempt.invoice.amountCents,
    currency: attempt.invoice.currency,
    integrityHash: attempt.invoice.integrityHash,
  });

  if (!integrityCheck.valid) {
    await markAttemptFailed({
      paymentAttemptId: attempt.id,
      gateway: params.gateway,
      reason: 'Invoice integrity validation failed',
    });
    throw new Error('Invoice integrity validation failed');
  }

  const rawPlanType =
    typeof invoiceMetadata.planType === 'string'
      ? invoiceMetadata.planType
      : '';
  if (!Object.values(PlanType).includes(rawPlanType as PlanType)) {
    throw new Error('Plan type missing from invoice metadata');
  }
  const planType = rawPlanType as PlanType;

  const durationDays = resolveDurationFromInvoiceMetadata(invoiceMetadata);
  const billingTerm =
    invoiceMetadata.billingTerm === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';

  const now = new Date();
  const subscriptionPeriodEnd = new Date(now);
  subscriptionPeriodEnd.setDate(subscriptionPeriodEnd.getDate() + durationDays);

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      billingAccountId: attempt.billingAccountId,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  const activeTrial = await prisma.trialSession.findFirst({
    where: {
      billingAccountId: attempt.billingAccountId,
      status: TrialStatus.ACTIVE,
    },
  });

  const [paymentAttempt, invoice, subscription] = await prisma.$transaction([
    prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentAttemptStatus.SUCCESS,
        processedAt: now,
        gateway: params.gateway,
        gatewayPaymentId: params.gatewayPaymentId || attempt.gatewayPaymentId,
        errorMessage: null,
      },
    }),
    prisma.invoice.update({
      where: { id: attempt.invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: now,
      },
    }),
    prisma.subscription.create({
      data: {
        billingAccountId: attempt.billingAccountId,
        planType,
        status: SubscriptionStatus.ACTIVE,
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: subscriptionPeriodEnd,
        metadata: {
          billingTerm,
          durationDays,
        } as any,
      },
    }),
  ]);

  if (activeSubscription) {
    await prisma.subscription.update({
      where: { id: activeSubscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: now,
      },
    });
  }

  if (activeTrial) {
    await prisma.trialSession.update({
      where: { id: activeTrial.id },
      data: {
        status: TrialStatus.CONVERTED,
        convertedAt: now,
      },
    });
  }

  await prisma.billingAccount.update({
    where: { id: attempt.billingAccountId },
    data: {
      gateway: params.gateway,
    },
  });

  await organizationService.updateOrganizationPlan(
    attempt.billingAccount.organizationId,
    {
      planType,
      planStatus: PlanStatus.ACTIVE,
      durationDays,
    },
  );

  return {
    paymentAttempt,
    invoice,
    subscription,
    idempotent: false,
  };
};

const createStripeCheckout = async (params: {
  organization: {
    id: string;
    name: string;
    email: string;
    address: string;
    phone: string;
  };
  paymentAttempt: PaymentAttempt;
  invoice: Invoice;
  planType: PlanType;
  billingTerm: BillingTerm;
  amountCents: number;
  currency: string;
}) => {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const successUrl = buildUpgradeReturnUrl('success', params.paymentAttempt.id);
  const cancelUrl = buildUpgradeReturnUrl('canceled', params.paymentAttempt.id);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: params.organization.id,
    customer_email: params.organization.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: normalizeCurrency(params.currency).toLowerCase(),
          unit_amount: params.amountCents,
          product_data: {
            name: `VeriLnk ${params.planType} ${params.billingTerm === 'ANNUAL' ? 'Annual' : 'Monthly'} Plan`,
          },
        },
      },
    ],
    metadata: {
      paymentAttemptId: params.paymentAttempt.id,
      invoiceId: params.invoice.id,
      organizationId: params.organization.id,
      planType: params.planType,
      billingTerm: params.billingTerm,
    },
  });

  if (!session.url) {
    throw new Error('Stripe checkout URL was not returned');
  }

  await prisma.paymentAttempt.update({
    where: { id: params.paymentAttempt.id },
    data: {
      gateway: BillingGateway.STRIPE,
      gatewayPaymentId: session.id,
    },
  });

  const updatedInvoice = await upsertInvoiceMetadata(params.invoice, {
    checkoutRedirectUrl: session.url,
    checkoutSessionId: session.id,
  });

  await prisma.invoice.update({
    where: { id: params.invoice.id },
    data: {
      externalId: session.id,
    },
  });

  return {
    redirectUrl: session.url,
    externalId: session.id,
    invoice: updatedInvoice,
  };
};

const resolveSSLCommerzCallbackUrls = () => {
  const appUrl = resolveAppUrl();
  return {
    successUrl:
      process.env.SSLCOMMERZ_SUCCESS_URL ||
      `${appUrl}/api/billing/sslcommerz/success`,
    failUrl:
      process.env.SSLCOMMERZ_FAIL_URL ||
      `${appUrl}/api/billing/sslcommerz/fail`,
    cancelUrl:
      process.env.SSLCOMMERZ_CANCEL_URL ||
      `${appUrl}/api/billing/sslcommerz/cancel`,
  };
};

const createSSLCommerzCheckout = async (params: {
  organization: {
    id: string;
    name: string;
    email: string;
    address: string;
    phone: string;
  };
  paymentAttempt: PaymentAttempt;
  invoice: Invoice;
  planType: PlanType;
  billingTerm: BillingTerm;
  amountCents: number;
  currency: string;
}) => {
  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;

  if (!storeId || !storePassword) {
    throw new Error('SSLCommerz is not configured');
  }

  const callbackUrls = resolveSSLCommerzCallbackUrls();
  const initUrl = `${resolveSSLCommerzBaseUrl()}/gwprocess/v4/api.php`;
  const amount = (params.amountCents / 100).toFixed(2);
  const transactionId = params.paymentAttempt.id;

  const form = new URLSearchParams();
  form.set('store_id', storeId);
  form.set('store_passwd', storePassword);
  form.set('total_amount', amount);
  form.set('currency', normalizeCurrency(params.currency));
  form.set('tran_id', transactionId);
  form.set('success_url', callbackUrls.successUrl);
  form.set('fail_url', callbackUrls.failUrl);
  form.set('cancel_url', callbackUrls.cancelUrl);
  form.set('ipn_url', callbackUrls.successUrl);
  form.set('shipping_method', 'NO');
  form.set('product_name', `VeriLnk ${params.planType} Plan`);
  form.set('product_category', 'Subscription');
  form.set('product_profile', 'general');
  form.set('cus_name', params.organization.name || 'Organization');
  form.set('cus_email', params.organization.email || 'billing@verilnk.com');
  form.set('cus_add1', params.organization.address || 'N/A');
  form.set('cus_city', 'N/A');
  form.set('cus_country', 'N/A');
  form.set('cus_phone', params.organization.phone || 'N/A');
  form.set('num_of_item', '1');

  const response = await axios.post(initUrl, form.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15000,
  });

  const payload =
    response.data && typeof response.data === 'object'
      ? (response.data as Record<string, unknown>)
      : {};

  const redirectUrl = coerceString(payload.GatewayPageURL);
  if (!redirectUrl) {
    throw new Error('SSLCommerz checkout URL was not returned');
  }

  await prisma.paymentAttempt.update({
    where: { id: params.paymentAttempt.id },
    data: {
      gateway: BillingGateway.SSLCOMMERZ,
      gatewayPaymentId: transactionId,
    },
  });

  const updatedInvoice = await upsertInvoiceMetadata(params.invoice, {
    checkoutRedirectUrl: redirectUrl,
    checkoutSessionId: coerceString(payload.sessionkey) || null,
  });

  return {
    redirectUrl,
    externalId: transactionId,
    invoice: updatedInvoice,
  };
};

const verifySSLCommerzPayment = async (valId: string) => {
  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  if (!storeId || !storePassword) {
    throw new Error('SSLCommerz is not configured');
  }

  const validationUrl = `${resolveSSLCommerzBaseUrl()}/validator/api/validationserverAPI.php`;
  const response = await axios.get(validationUrl, {
    params: {
      val_id: valId,
      store_id: storeId,
      store_passwd: storePassword,
      format: 'json',
    },
    timeout: 15000,
  });

  if (!response.data || typeof response.data !== 'object') {
    throw new Error('SSLCommerz validation payload was invalid');
  }

  return response.data as Record<string, unknown>;
};

export const createCheckout = async (params: CheckoutStartParams) => {
  assertCheckoutPlan(params.planType);
  const provider = getConfiguredPaymentProvider();

  const amountCents = resolvePlanChargeAmountCents({
    planType: params.planType,
    billingTerm: params.billingTerm,
  });
  const currency = 'USD';

  const pending = await createPendingAttempt({
    organizationId: params.organizationId,
    planType: params.planType,
    billingTerm: params.billingTerm,
    provider,
    amountCents,
    currency,
    idempotencyKey: params.idempotencyKey,
  });

  if (pending.idempotent) {
    if (!pending.redirectUrl) {
      throw new Error('Existing checkout attempt missing redirect URL');
    }
    return {
      redirectUrl: pending.redirectUrl,
      idempotent: true,
    };
  }

  const checkoutResult =
    provider === 'stripe'
      ? await createStripeCheckout({
          organization: pending.organization,
          paymentAttempt: pending.paymentAttempt,
          invoice: pending.invoice,
          planType: params.planType,
          billingTerm: params.billingTerm,
          amountCents,
          currency,
        })
      : await createSSLCommerzCheckout({
          organization: pending.organization,
          paymentAttempt: pending.paymentAttempt,
          invoice: pending.invoice,
          planType: params.planType,
          billingTerm: params.billingTerm,
          amountCents,
          currency,
        });

  return {
    redirectUrl: checkoutResult.redirectUrl,
    idempotent: false,
  };
};

export const handleStripeWebhook = async (params: StripeWebhookParams) => {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    throw new Error('Stripe webhook is not configured');
  }
  if (!params.signature) {
    throw new Error('Missing Stripe signature');
  }

  const rawPayload = Buffer.isBuffer(params.rawBody)
    ? params.rawBody
    : Buffer.from(params.rawBody || '', 'utf8');
  const event = stripe.webhooks.constructEvent(
    rawPayload,
    params.signature,
    webhookSecret,
  );

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded' ||
    event.type === 'checkout.session.async_payment_failed' ||
    event.type === 'checkout.session.expired'
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentAttemptId = coerceString(session.metadata?.paymentAttemptId);
    if (!paymentAttemptId) {
      return { received: true, ignored: true, eventType: event.type };
    }

    if (
      event.type === 'checkout.session.async_payment_failed' ||
      event.type === 'checkout.session.expired'
    ) {
      await markAttemptFailed({
        paymentAttemptId,
        gateway: BillingGateway.STRIPE,
        status:
          event.type === 'checkout.session.expired'
            ? PaymentAttemptStatus.CANCELED
            : PaymentAttemptStatus.FAILED,
        gatewayPaymentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.id,
        reason:
          event.type === 'checkout.session.expired'
            ? 'Stripe checkout session expired'
            : 'Stripe payment failed',
      });
    } else {
      const paymentStatus = coerceString(session.payment_status);
      if (paymentStatus === 'paid') {
        await activateSuccessfulPayment({
          paymentAttemptId,
          gateway: BillingGateway.STRIPE,
          gatewayPaymentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.id,
          expectedAmountCents:
            typeof session.amount_total === 'number'
              ? session.amount_total
              : null,
          expectedCurrency:
            typeof session.currency === 'string' ? session.currency : null,
        });
      }
    }
  }

  return {
    received: true,
    eventType: event.type,
  };
};

export const processSSLCommerzCallback = async (
  params: SSLCommerzCallbackParams,
) => {
  const paymentAttemptId = coerceString(params.payload.tran_id);
  const gatewayPaymentId =
    coerceString(params.payload.bank_tran_id) ||
    coerceString(params.payload.val_id) ||
    null;

  if (!paymentAttemptId) {
    return {
      redirectUrl: buildUpgradeReturnUrl('failed'),
    };
  }

  if (params.kind === 'cancel') {
    await markAttemptFailed({
      paymentAttemptId,
      gateway: BillingGateway.SSLCOMMERZ,
      status: PaymentAttemptStatus.CANCELED,
      gatewayPaymentId,
      reason: 'SSLCommerz payment canceled by user',
    });
    return {
      redirectUrl: buildUpgradeReturnUrl('canceled', paymentAttemptId),
    };
  }

  if (params.kind === 'fail') {
    await markAttemptFailed({
      paymentAttemptId,
      gateway: BillingGateway.SSLCOMMERZ,
      status: PaymentAttemptStatus.FAILED,
      gatewayPaymentId,
      reason: 'SSLCommerz payment failed',
    });
    return {
      redirectUrl: buildUpgradeReturnUrl('failed', paymentAttemptId),
    };
  }

  const valId = coerceString(params.payload.val_id);
  if (!valId) {
    await markAttemptFailed({
      paymentAttemptId,
      gateway: BillingGateway.SSLCOMMERZ,
      status: PaymentAttemptStatus.FAILED,
      gatewayPaymentId,
      reason: 'SSLCommerz validation ID missing',
    });
    return {
      redirectUrl: buildUpgradeReturnUrl('failed', paymentAttemptId),
    };
  }

  const validation = await verifySSLCommerzPayment(valId);
  const validationStatus = coerceString(validation.status).toUpperCase();
  if (validationStatus !== 'VALID' && validationStatus !== 'VALIDATED') {
    await markAttemptFailed({
      paymentAttemptId,
      gateway: BillingGateway.SSLCOMMERZ,
      status: PaymentAttemptStatus.FAILED,
      gatewayPaymentId,
      reason: 'SSLCommerz validation failed',
    });
    return {
      redirectUrl: buildUpgradeReturnUrl('failed', paymentAttemptId),
    };
  }

  const validatedTranId = coerceString(validation.tran_id);
  if (!validatedTranId || validatedTranId !== paymentAttemptId) {
    await markAttemptFailed({
      paymentAttemptId,
      gateway: BillingGateway.SSLCOMMERZ,
      status: PaymentAttemptStatus.FAILED,
      gatewayPaymentId,
      reason: 'SSLCommerz transaction mismatch',
    });
    return {
      redirectUrl: buildUpgradeReturnUrl('failed', paymentAttemptId),
    };
  }

  const expectedAmountCents = parseAmountToCents(validation.amount);
  const expectedCurrency =
    coerceString(validation.currency) || normalizeCurrency('USD');

  await activateSuccessfulPayment({
    paymentAttemptId,
    gateway: BillingGateway.SSLCOMMERZ,
    gatewayPaymentId: coerceString(validation.bank_tran_id) || gatewayPaymentId,
    expectedAmountCents,
    expectedCurrency,
  });

  return {
    redirectUrl: buildUpgradeReturnUrl('success', paymentAttemptId),
  };
};
