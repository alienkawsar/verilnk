import { Request, Response } from 'express';
import { z } from 'zod';
import { PlanType } from '@prisma/client';
import * as billingService from '../services/billing.service';
import { prisma } from '../db/client';
import { PaymentConfigurationError } from '../config/payment.config';
import * as trialService from '../services/trial.service';
import { verifyWebhookSignature } from '../services/billing-security.service';
import {
  assertEnterpriseCompliance,
  isEnterpriseComplianceError,
  toEnterpriseComplianceErrorResponse,
} from '../services/enterprise-compliance.service';

const BILLING_TERM_VALUES = ['MONTHLY', 'ANNUAL'] as const;
const CHECKOUT_PLAN_VALUES = ['BASIC', 'PRO', 'BUSINESS'] as const;
const PAYMENT_MISCONFIGURED_MESSAGE =
  'Payment system misconfigured. Please contact support.';

const mockCheckoutSchema = z.object({
  organizationId: z.string().uuid().optional(),
  planType: z.nativeEnum(PlanType),
  amountCents: z.number().int().positive(),
  currency: z.string().optional(),
  durationDays: z.number().int().positive().optional(),
  billingTerm: z.enum(BILLING_TERM_VALUES).optional(),
  billingEmail: z.string().email().optional(),
  billingName: z.string().optional(),
  simulate: z.enum(['success', 'failure']).optional(),
});

const mockCallbackSchema = z.object({
  paymentAttemptId: z.string().uuid(),
  result: z.enum(['success', 'failure']),
});

const startTrialSchema = z.object({
  durationDays: z
    .literal(trialService.PRO_TRIAL_DURATION_DAYS)
    .optional()
    .default(trialService.PRO_TRIAL_DURATION_DAYS),
  planType: z.nativeEnum(PlanType).optional(),
});

const checkoutSchema = z
  .object({
    plan: z.enum(CHECKOUT_PLAN_VALUES),
    billingCadence: z.enum(BILLING_TERM_VALUES),
  })
  .strict();

const resolveOrganizationId = async (actor?: {
  id?: string;
  organizationId?: string;
}) => {
  if (!actor) return null;
  if (actor.organizationId) return actor.organizationId;
  if (!actor.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { organizationId: true },
  });

  return user?.organizationId ?? null;
};

const assertBillingComplianceForOrganization = async (
  organizationId: string,
  actorRole: string | null | undefined,
) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, planType: true, deletedAt: true },
  });

  if (!organization || organization.deletedAt) {
    throw new Error('Organization not found');
  }

  if (organization.planType !== PlanType.ENTERPRISE) {
    return;
  }

  await assertEnterpriseCompliance({
    enterpriseId: organization.id,
    action: 'BILLING_CHANGE',
    actorRole,
  });
};

const resolveAppUrl = () => {
  const appUrl = (process.env.APP_URL || '').trim();
  if (!appUrl) {
    throw new PaymentConfigurationError('APP_URL must be set.');
  }
  return appUrl.replace(/\/+$/g, '');
};

const resolveSSLCommerzFailureRedirect = () => {
  return `${resolveAppUrl()}/org/upgrade?status=failed`;
};

const handlePaymentConfigurationError = (
  error: unknown,
  res: Response,
): boolean => {
  if (!(error instanceof PaymentConfigurationError)) {
    return false;
  }

  // Keep full diagnostics in logs while masking config internals from clients.
  console.error('[Billing] Payment configuration error:', error);
  const message =
    process.env.NODE_ENV === 'production'
      ? PAYMENT_MISCONFIGURED_MESSAGE
      : error.message;
  res.status(500).json({ message });
  return true;
};

export const checkout = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = checkoutSchema.parse(req.body);
    const actor = (req as any).user;

    if (actor?.role) {
      res
        .status(403)
        .json({ message: 'Checkout is limited to organization accounts' });
      return;
    }

    const resolvedOrgId = await resolveOrganizationId(actor);
    if (!resolvedOrgId) {
      res.status(403).json({ message: 'Organization user required' });
      return;
    }

    await assertBillingComplianceForOrganization(resolvedOrgId, 'OWNER');

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const result = await billingService.createCheckout({
      organizationId: resolvedOrgId,
      planType: payload.plan as PlanType,
      billingTerm: payload.billingCadence,
      idempotencyKey,
    });

    res.json({ redirectUrl: result.redirectUrl });
  } catch (error: any) {
    if (isEnterpriseComplianceError(error)) {
      res.status(error.status).json(toEnterpriseComplianceErrorResponse(error));
      return;
    }
    if (handlePaymentConfigurationError(error, res)) {
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    res.status(400).json({ message: error.message || 'Checkout failed' });
  }
};

export const stripeWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const signature = req.headers['stripe-signature'] as string | undefined;
    const rawBody = req.rawBody ?? req.rawBodyText ?? null;
    if (!rawBody) {
      res.status(400).json({ message: 'Missing raw webhook body' });
      return;
    }

    const result = await billingService.handleStripeWebhook({
      rawBody,
      signature,
    });

    res.json(result);
  } catch (error: any) {
    if (handlePaymentConfigurationError(error, res)) {
      return;
    }
    res
      .status(400)
      .json({ message: error.message || 'Stripe webhook rejected' });
  }
};

const handleSSLCommerzCallback = async (
  req: Request,
  res: Response,
  kind: 'success' | 'fail' | 'cancel',
): Promise<void> => {
  try {
    const payload: Record<string, unknown> = {
      ...(req.query as Record<string, unknown>),
      ...((req.body || {}) as Record<string, unknown>),
    };
    const result = await billingService.processSSLCommerzCallback({
      kind,
      payload,
    });
    res.redirect(302, result.redirectUrl);
  } catch (error: any) {
    if (error instanceof PaymentConfigurationError) {
      console.error(
        '[Billing] Payment configuration error during SSLCommerz callback:',
        error,
      );
    } else {
      console.error('[Billing] SSLCommerz callback failed:', error);
    }

    let fallbackRedirect = '/org/upgrade?status=failed';
    try {
      fallbackRedirect = resolveSSLCommerzFailureRedirect();
    } catch (redirectError) {
      console.error(
        '[Billing] Failed to resolve SSLCommerz failure redirect:',
        redirectError,
      );
    }

    res.redirect(302, fallbackRedirect);
  }
};

export const sslcommerzSuccess = async (
  req: Request,
  res: Response,
): Promise<void> => {
  await handleSSLCommerzCallback(req, res, 'success');
};

export const sslcommerzFail = async (
  req: Request,
  res: Response,
): Promise<void> => {
  await handleSSLCommerzCallback(req, res, 'fail');
};

export const sslcommerzCancel = async (
  req: Request,
  res: Response,
): Promise<void> => {
  await handleSSLCommerzCallback(req, res, 'cancel');
};

export const mockCheckout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const payload = mockCheckoutSchema.parse(req.body);
    const actor = (req as any).user;

    let organizationId = payload.organizationId;
    if (actor?.role) {
      if (!organizationId) {
        res
          .status(400)
          .json({ message: 'organizationId is required for admin checkout' });
        return;
      }
    } else {
      const resolvedOrgId = await resolveOrganizationId(actor);
      if (!resolvedOrgId) {
        res.status(403).json({ message: 'Organization user required' });
        return;
      }
      if (organizationId && organizationId !== resolvedOrgId) {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }
      organizationId = resolvedOrgId;
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!organizationId) {
      res.status(400).json({ message: 'organizationId is required' });
      return;
    }

    await assertBillingComplianceForOrganization(
      organizationId,
      actor?.role ? String(actor.role).toUpperCase() : 'OWNER',
    );

    const result = await billingService.createMockCheckout({
      ...payload,
      organizationId,
      idempotencyKey,
    });

    res.json(result);
  } catch (error: any) {
    if (isEnterpriseComplianceError(error)) {
      res.status(error.status).json(toEnterpriseComplianceErrorResponse(error));
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    res.status(400).json({ message: error.message || 'Mock checkout failed' });
  }
};

export const mockCallback = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    const signatureCheck = verifyWebhookSignature(req.body || {}, signature);
    if (!signatureCheck.verified) {
      res
        .status(400)
        .json({ message: signatureCheck.reason || 'Invalid signature' });
      return;
    }

    const payload = mockCallbackSchema.parse(req.body);
    const actor = (req as any).user;

    const attemptForCompliance = await prisma.paymentAttempt.findUnique({
      where: { id: payload.paymentAttemptId },
      include: {
        billingAccount: {
          select: {
            organizationId: true,
          },
        },
      },
    });

    if (!actor?.role) {
      const resolvedOrgId = await resolveOrganizationId(actor);
      if (!resolvedOrgId) {
        res.status(403).json({ message: 'Organization user required' });
        return;
      }

      if (
        !attemptForCompliance ||
        attemptForCompliance.billingAccount.organizationId !== resolvedOrgId
      ) {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }
    }

    if (attemptForCompliance?.billingAccount.organizationId) {
      await assertBillingComplianceForOrganization(
        attemptForCompliance.billingAccount.organizationId,
        actor?.role ? String(actor.role).toUpperCase() : 'OWNER',
      );
    }

    const result = await billingService.processMockCallback(payload);
    res.json(result);
  } catch (error: any) {
    if (isEnterpriseComplianceError(error)) {
      res.status(error.status).json(toEnterpriseComplianceErrorResponse(error));
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    res.status(400).json({ message: error.message || 'Mock callback failed' });
  }
};

export const startTrial = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const payload = startTrialSchema.parse(req.body);
    const actor = (req as any).user;

    if (actor?.role) {
      res
        .status(403)
        .json({ message: 'Trial start is limited to organization accounts' });
      return;
    }

    const resolvedOrgId = await resolveOrganizationId(actor);
    if (!resolvedOrgId) {
      res.status(403).json({ message: 'Organization user required' });
      return;
    }

    await assertBillingComplianceForOrganization(resolvedOrgId, 'OWNER');

    const trial = await trialService.startTrial({
      organizationId: resolvedOrgId,
      durationDays: payload.durationDays,
      planType: payload.planType,
    });

    res.json({ trial });
  } catch (error: any) {
    if (isEnterpriseComplianceError(error)) {
      res.status(error.status).json(toEnterpriseComplianceErrorResponse(error));
      return;
    }
    if (
      error instanceof trialService.TrialServiceError &&
      error.code === 'TRIAL_ALREADY_USED'
    ) {
      res.status(400).json({ error: 'TRIAL_ALREADY_USED' });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    res.status(400).json({ message: error.message || 'Failed to start trial' });
  }
};

export const getTrialStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const actor = (req as any).user;

    if (actor?.role) {
      res
        .status(403)
        .json({ message: 'Trial status is limited to organization accounts' });
      return;
    }

    const resolvedOrgId = await resolveOrganizationId(actor);
    if (!resolvedOrgId) {
      res.status(403).json({ message: 'Organization user required' });
      return;
    }

    const status = await trialService.getTrialStatus(resolvedOrgId);
    res.json(status);
  } catch (error: any) {
    res
      .status(500)
      .json({ message: error.message || 'Failed to load trial status' });
  }
};
