import { Request, Response } from 'express';
import { z } from 'zod';
import { PlanType } from '@prisma/client';
import * as billingService from '../services/billing.service';
import { prisma } from '../db/client';
import * as trialService from '../services/trial.service';
import { verifyWebhookSignature } from '../services/billing-security.service';
import {
    assertEnterpriseCompliance,
    isEnterpriseComplianceError,
    toEnterpriseComplianceErrorResponse
} from '../services/enterprise-compliance.service';

const BILLING_TERM_VALUES = ['MONTHLY', 'ANNUAL'] as const;

const mockCheckoutSchema = z.object({
    organizationId: z.string().uuid().optional(),
    planType: z.nativeEnum(PlanType),
    amountCents: z.number().int().positive(),
    currency: z.string().optional(),
    durationDays: z.number().int().positive().optional(),
    billingTerm: z.enum(BILLING_TERM_VALUES).optional(),
    billingEmail: z.string().email().optional(),
    billingName: z.string().optional(),
    simulate: z.enum(['success', 'failure']).optional()
});

const mockCallbackSchema = z.object({
    paymentAttemptId: z.string().uuid(),
    result: z.enum(['success', 'failure'])
});

const startTrialSchema = z.object({
    durationDays: z.number().int().positive(),
    planType: z.nativeEnum(PlanType).optional()
});

const resolveOrganizationId = async (actor?: { id?: string; organizationId?: string }) => {
    if (!actor) return null;
    if (actor.organizationId) return actor.organizationId;
    if (!actor.id) return null;

    const user = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { organizationId: true }
    });

    return user?.organizationId ?? null;
};

const assertBillingComplianceForOrganization = async (
    organizationId: string,
    actorRole: string | null | undefined
) => {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, planType: true, deletedAt: true }
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
        actorRole
    });
};

export const mockCheckout = async (req: Request, res: Response): Promise<void> => {
    try {
        const payload = mockCheckoutSchema.parse(req.body);
        const actor = (req as any).user;

        let organizationId = payload.organizationId;
        if (actor?.role) {
            if (!organizationId) {
                res.status(400).json({ message: 'organizationId is required for admin checkout' });
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
            actor?.role ? String(actor.role).toUpperCase() : 'OWNER'
        );

        const result = await billingService.createMockCheckout({
            ...payload,
            organizationId,
            idempotencyKey
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

export const mockCallback = async (req: Request, res: Response): Promise<void> => {
    try {
        const signature = req.headers['x-webhook-signature'] as string | undefined;
        const signatureCheck = verifyWebhookSignature(req.body || {}, signature);
        if (!signatureCheck.verified) {
            res.status(400).json({ message: signatureCheck.reason || 'Invalid signature' });
            return;
        }

        const payload = mockCallbackSchema.parse(req.body);
        const actor = (req as any).user;

        const attemptForCompliance = await prisma.paymentAttempt.findUnique({
            where: { id: payload.paymentAttemptId },
            include: {
                billingAccount: {
                    select: {
                        organizationId: true
                    }
                }
            }
        });

        if (!actor?.role) {
            const resolvedOrgId = await resolveOrganizationId(actor);
            if (!resolvedOrgId) {
                res.status(403).json({ message: 'Organization user required' });
                return;
            }

            if (
                !attemptForCompliance
                || attemptForCompliance.billingAccount.organizationId !== resolvedOrgId
            ) {
                res.status(403).json({ message: 'Forbidden' });
                return;
            }
        }

        if (attemptForCompliance?.billingAccount.organizationId) {
            await assertBillingComplianceForOrganization(
                attemptForCompliance.billingAccount.organizationId,
                actor?.role ? String(actor.role).toUpperCase() : 'OWNER'
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

export const startTrial = async (req: Request, res: Response): Promise<void> => {
    try {
        const payload = startTrialSchema.parse(req.body);
        const actor = (req as any).user;

        if (actor?.role) {
            res.status(403).json({ message: 'Trial start is limited to organization accounts' });
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
            planType: payload.planType
        });

        res.json({ trial });
    } catch (error: any) {
        if (isEnterpriseComplianceError(error)) {
            res.status(error.status).json(toEnterpriseComplianceErrorResponse(error));
            return;
        }
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to start trial' });
    }
};

export const getTrialStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const actor = (req as any).user;

        if (actor?.role) {
            res.status(403).json({ message: 'Trial status is limited to organization accounts' });
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
        res.status(500).json({ message: error.message || 'Failed to load trial status' });
    }
};
