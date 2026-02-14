import { Request, Response } from 'express';
import { z } from 'zod';
import { PlanType } from '@prisma/client';
import * as billingAdminService from '../services/billing-admin.service';
import * as trialService from '../services/trial.service';
import * as auditService from '../services/audit.service';
import { AuditActionType } from '@prisma/client';

const createInvoiceSchema = z.object({
    organizationId: z.string().uuid(),
    amountCents: z.number().int().positive(),
    currency: z.string().optional(),
    planType: z.nativeEnum(PlanType),
    notes: z.string().optional(),
    durationDays: z.number().int().positive().optional()
});

const refundFlagSchema = z.object({
    note: z.string().optional()
});

const extendTrialSchema = z.object({
    extraDays: z.number().int().positive()
});

export const createManualInvoice = async (req: Request, res: Response): Promise<void> => {
    try {
        const payload = createInvoiceSchema.parse(req.body);
        const actor = (req as any).user;
        const invoice = await billingAdminService.createManualInvoice(
            { ...payload, adminId: actor.id },
            { ip: req.ip, userAgent: req.headers['user-agent'] }
        );
        res.status(201).json(invoice);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to create invoice' });
    }
};

export const applyOfflinePayment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params as { id: string };
        const actor = (req as any).user;
        const invoice = await billingAdminService.applyOfflinePayment(
            { invoiceId: id, adminId: actor.id },
            { ip: req.ip, userAgent: req.headers['user-agent'] }
        );
        res.json(invoice);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Failed to apply offline payment' });
    }
};

export const cancelSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params as { id: string };
        const actor = (req as any).user;
        const subscription = await billingAdminService.cancelSubscription(
            { subscriptionId: id, adminId: actor.id },
            { ip: req.ip, userAgent: req.headers['user-agent'] }
        );
        res.json(subscription);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Failed to cancel subscription' });
    }
};

export const flagRefund = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params as { id: string };
        const payload = refundFlagSchema.parse(req.body);
        const actor = (req as any).user;
        const invoice = await billingAdminService.flagInvoiceRefund(
            { invoiceId: id, adminId: actor.id, note: payload.note },
            { ip: req.ip, userAgent: req.headers['user-agent'] }
        );
        res.json(invoice);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to flag refund' });
    }
};

export const extendTrial = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params as { organizationId: string };
        const payload = extendTrialSchema.parse(req.body);
        const actor = (req as any).user;

        const trial = await trialService.extendTrial({
            organizationId,
            extraDays: payload.extraDays
        });

        if (actor?.id) {
            auditService.logAction({
                adminId: actor.id,
                action: AuditActionType.UPDATE,
                entity: 'TrialSession',
                targetId: trial.id,
                details: `Extended trial by ${payload.extraDays} days`,
                snapshot: trial,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        res.json(trial);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to extend trial' });
    }
};
