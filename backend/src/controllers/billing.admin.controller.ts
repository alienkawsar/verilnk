import { Request, Response } from 'express';
import { z } from 'zod';
import { InvoiceStatus, PlanType } from '@prisma/client';
import * as billingAdminService from '../services/billing-admin.service';
import * as trialService from '../services/trial.service';
import * as auditService from '../services/audit.service';
import { AuditActionType } from '@prisma/client';
import { buildInvoiceContentDisposition } from '../services/invoice-filename.service';

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

const invoiceListQuerySchema = z.object({
    search: z.string().trim().max(200).optional(),
    status: z.nativeEnum(InvoiceStatus).optional(),
    planType: z.nativeEnum(PlanType).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    minAmountCents: z.coerce.number().int().nonnegative().optional(),
    maxAmountCents: z.coerce.number().int().nonnegative().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
});

const parseOptionalDate = (value?: string): Date | undefined => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date filter');
    }
    return date;
};

const listInvoicesByScope = async (
    req: Request,
    res: Response,
    scope: billingAdminService.AdminInvoiceScope
): Promise<void> => {
    try {
        const parsed = invoiceListQuerySchema.parse(req.query);
        const startDate = parseOptionalDate(parsed.startDate);
        const endDate = parseOptionalDate(parsed.endDate);

        if (
            typeof parsed.minAmountCents === 'number'
            && typeof parsed.maxAmountCents === 'number'
            && parsed.minAmountCents > parsed.maxAmountCents
        ) {
            res.status(400).json({ message: 'minAmountCents cannot be greater than maxAmountCents' });
            return;
        }

        const response = await billingAdminService.listInvoices(scope, {
            search: parsed.search,
            status: parsed.status,
            planType: parsed.planType,
            startDate,
            endDate,
            minAmountCents: parsed.minAmountCents,
            maxAmountCents: parsed.maxAmountCents,
            page: parsed.page,
            limit: parsed.limit
        });

        res.json(response);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to list invoices' });
    }
};

const downloadInvoicePdfByScope = async (
    req: Request,
    res: Response,
    scope: billingAdminService.AdminInvoiceScope
): Promise<void> => {
    try {
        const { id } = req.params as { id: string };
        const actor = (req as any).user;
        if (!actor?.id) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const pdf = await billingAdminService.buildInvoicePdfForAdmin(id, scope);

        await auditService.logAction({
            adminId: actor.id,
            actorRole: actor.role,
            action: AuditActionType.OTHER,
            entity: 'Invoice',
            targetId: pdf.invoiceId,
            details: `ADMIN_INVOICE_PDF_DOWNLOADED scope=${scope} invoiceNumber=${pdf.invoiceNumber}`,
            snapshot: {
                scope,
                invoiceId: pdf.invoiceId,
                invoiceNumber: pdf.invoiceNumber,
                organizationId: pdf.organizationId
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', buildInvoiceContentDisposition(pdf.filename));
        res.status(200).send(pdf.pdfBuffer);
    } catch (error: any) {
        if (error.message === 'Invoice not found') {
            res.status(404).json({ message: 'Invoice not found' });
            return;
        }
        res.status(500).json({ message: error.message || 'Failed to download invoice PDF' });
    }
};

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

export const listOrganizationInvoices = async (req: Request, res: Response): Promise<void> => {
    await listInvoicesByScope(req, res, 'ORG');
};

export const listEnterpriseInvoices = async (req: Request, res: Response): Promise<void> => {
    await listInvoicesByScope(req, res, 'ENTERPRISE');
};

export const downloadOrganizationInvoicePdf = async (req: Request, res: Response): Promise<void> => {
    await downloadInvoicePdfByScope(req, res, 'ORG');
};

export const downloadEnterpriseInvoicePdf = async (req: Request, res: Response): Promise<void> => {
    await downloadInvoicePdfByScope(req, res, 'ENTERPRISE');
};
