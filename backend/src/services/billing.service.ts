import { prisma } from '../db/client';
import {
    BillingGateway,
    InvoiceStatus,
    PaymentAttemptStatus,
    PlanStatus,
    PlanType,
    SubscriptionStatus,
    TrialStatus
} from '@prisma/client';
import crypto from 'crypto';
import * as organizationService from './organization.service';
import { computeInvoiceIntegrity, validateInvoiceIntegrity } from './billing-security.service';
import {
    BillingTerm,
    billingTermToDurationDays,
    resolveBillingTerm,
    resolvePlanChargeAmountCents
} from './billing-pricing.service';

const PAYMENT_MODE = (process.env.PAYMENT_MODE || 'mock').toLowerCase();

const buildMockId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

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
    return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
};

const buildInvoiceNumber = () => {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    return `INV-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

const ensureBillingAccount = async (organizationId: string, details?: { billingEmail?: string; billingName?: string }) => {
    const existing = await prisma.billingAccount.findUnique({ where: { organizationId } });
    if (existing) {
        if ((details?.billingEmail && existing.billingEmail !== details.billingEmail) ||
            (details?.billingName && existing.billingName !== details.billingName)) {
            return prisma.billingAccount.update({
                where: { id: existing.id },
                data: {
                    billingEmail: details?.billingEmail ?? existing.billingEmail,
                    billingName: details?.billingName ?? existing.billingName
                }
            });
        }
        return existing;
    }

    return prisma.billingAccount.create({
        data: {
            organizationId,
            gateway: BillingGateway.NONE,
            billingEmail: details?.billingEmail,
            billingName: details?.billingName
        }
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

    const billingTerm = resolveBillingTerm(params.billingTerm || null, params.durationDays);
    const durationDays = typeof params.durationDays === 'number' && Number.isFinite(params.durationDays) && params.durationDays > 0
        ? Math.floor(params.durationDays)
        : billingTermToDurationDays(billingTerm);
    const amountCents = resolvePlanChargeAmountCents({
        planType: params.planType,
        billingTerm,
        requestedAmountCents: params.amountCents
    });
    const currency = params.currency || 'USD';

    const org = await prisma.organization.findUnique({ where: { id: params.organizationId } });
    if (!org) {
        throw new Error('Organization not found');
    }

    const billingAccount = await ensureBillingAccount(params.organizationId, {
        billingEmail: params.billingEmail ?? org.email,
        billingName: params.billingName ?? org.name
    });

    const payloadHash = computeHash({
        organizationId: params.organizationId,
        planType: params.planType,
        amountCents,
        currency,
        billingTerm,
        durationDays
    });

    if (params.idempotencyKey) {
        const existingAttempt = await prisma.paymentAttempt.findFirst({
            where: {
                billingAccountId: billingAccount.id,
                idempotencyKey: params.idempotencyKey
            },
            include: { invoice: true }
        });

        if (existingAttempt) {
            if (existingAttempt.requestHash && existingAttempt.requestHash !== payloadHash) {
                throw new Error('Idempotency key reuse with different payload');
            }

            return {
                paymentAttempt: existingAttempt,
                invoice: existingAttempt.invoice,
                callbackUrl: '/api/billing/mock/callback'
            };
        }
    }

    const invoiceMetadata = {
        planType: params.planType,
        billingTerm,
        durationDays,
        organizationId: params.organizationId
    };

    const invoiceIntegrityHash = computeInvoiceIntegrity({
        planType: params.planType,
        amountCents,
        currency,
        organizationId: params.organizationId
    });

    const invoice = await prisma.invoice.create({
        data: {
            billingAccountId: billingAccount.id,
            status: InvoiceStatus.OPEN,
            amountCents,
            currency,
            invoiceNumber: buildInvoiceNumber(),
            metadata: invoiceMetadata as any,
            integrityHash: invoiceIntegrityHash
        }
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
            requestHash: payloadHash
        }
    });

    if (params.simulate) {
        return processMockCallback({
            paymentAttemptId: paymentAttempt.id,
            result: params.simulate
        });
    }

    return {
        paymentAttempt,
        invoice,
        callbackUrl: '/api/billing/mock/callback'
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
    const billingTerm = resolveBillingTerm(params.billingTerm || null, params.durationDays);
    const durationDays = typeof params.durationDays === 'number' && Number.isFinite(params.durationDays) && params.durationDays > 0
        ? Math.floor(params.durationDays)
        : billingTermToDurationDays(billingTerm);
    const amountCents = resolvePlanChargeAmountCents({
        planType: params.planType,
        billingTerm,
        requestedAmountCents: params.amountCents
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
        simulate: 'success'
    });

    return {
        ...checkoutResult,
        billingTerm,
        durationDays,
        amountCents
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
            billingAccount: true
        }
    });

    if (!attempt) {
        throw new Error('Payment attempt not found');
    }

    if (attempt.status !== PaymentAttemptStatus.PENDING) {
        return {
            paymentAttempt: attempt,
            invoice: attempt.invoice,
            idempotent: true,
            replayed: true
        };
    }

    if (!attempt.invoice) {
        throw new Error('Invoice not found');
    }

    if (attempt.amountCents !== attempt.invoice.amountCents || attempt.currency !== attempt.invoice.currency) {
        throw new Error('Amount validation failed');
    }

    const integrityCheck = validateInvoiceIntegrity({
        organizationId: (attempt.invoice.metadata as any)?.organizationId,
        planType: (attempt.invoice.metadata as any)?.planType,
        amountCents: attempt.invoice.amountCents,
        currency: attempt.invoice.currency,
        integrityHash: attempt.invoice.integrityHash
    });

    if (!integrityCheck.valid) {
        await prisma.$transaction([
            prisma.paymentAttempt.update({
                where: { id: attempt.id },
                data: {
                    status: PaymentAttemptStatus.FAILED,
                    processedAt: new Date(),
                    errorMessage: 'Invoice integrity validation failed'
                }
            }),
            prisma.invoice.update({
                where: { id: attempt.invoice.id },
                data: {
                    status: InvoiceStatus.VOID
                }
            })
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
                    errorMessage: 'Mock payment failed'
                }
            }),
            prisma.invoice.update({
                where: { id: attempt.invoice.id },
                data: {
                    status: InvoiceStatus.VOID
                }
            })
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
    const durationDays = typeof metadata.durationDays === 'number' && Number.isFinite(metadata.durationDays)
        ? Math.max(1, Math.floor(metadata.durationDays))
        : 30;
    const billingTerm = resolveBillingTerm(metadata.billingTerm || null, durationDays);

    const subscriptionPeriodEnd = new Date(now);
    subscriptionPeriodEnd.setDate(subscriptionPeriodEnd.getDate() + durationDays);

    const activeSubscription = await prisma.subscription.findFirst({
        where: {
            billingAccountId: attempt.billingAccountId,
            status: SubscriptionStatus.ACTIVE
        }
    });

    const activeTrial = await prisma.trialSession.findFirst({
        where: {
            billingAccountId: attempt.billingAccountId,
            status: TrialStatus.ACTIVE
        }
    });

    const [paymentAttempt, invoice, subscription] = await prisma.$transaction([
        prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
                status: PaymentAttemptStatus.SUCCESS,
                processedAt: now,
                gatewayPaymentId: attempt.gatewayPaymentId || buildMockId('mock_txn')
            }
        }),
        prisma.invoice.update({
            where: { id: attempt.invoice.id },
            data: {
                status: InvoiceStatus.PAID,
                paidAt: now
            }
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
                    durationDays
                } as any
            }
        })
    ]);

    if (activeSubscription) {
        await prisma.subscription.update({
            where: { id: activeSubscription.id },
            data: {
                status: SubscriptionStatus.CANCELED,
                canceledAt: now
            }
        });
    }

    if (activeTrial) {
        await prisma.trialSession.update({
            where: { id: activeTrial.id },
            data: {
                status: TrialStatus.CONVERTED,
                convertedAt: now
            }
        });
    }

    await prisma.billingAccount.update({
        where: { id: attempt.billingAccountId },
        data: {
            gateway: BillingGateway.MOCK
        }
    });

    await organizationService.updateOrganizationPlan(
        attempt.billingAccount.organizationId,
        {
            planType,
            planStatus: PlanStatus.ACTIVE,
            durationDays
        }
    );

    return {
        paymentAttempt,
        invoice,
        subscription
    };
};
