import { Request, Response } from 'express';
import { z } from 'zod';
import { InvoiceStatus, PlanType, SubscriptionStatus } from '@prisma/client';
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

const BILLING_TERM_VALUES = ['MONTHLY', 'ANNUAL'] as const;
const PAID_PLAN_VALUES = ['BASIC', 'PRO', 'BUSINESS', 'ENTERPRISE'] as const;

const billingSubscriptionsQuerySchema = z.object({
    search: z.string().trim().max(200).optional(),
    plan: z.enum(PAID_PLAN_VALUES).optional(),
    billingTerm: z.enum(BILLING_TERM_VALUES).optional(),
    status: z.nativeEnum(SubscriptionStatus).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional()
});

const billingInvoicesQuerySchema = z.object({
    search: z.string().trim().max(200).optional(),
    status: z.nativeEnum(InvoiceStatus).optional(),
    plan: z.enum(PAID_PLAN_VALUES).optional(),
    billingTerm: z.enum(BILLING_TERM_VALUES).optional(),
    rangeDays: z.coerce.number().int().optional().refine((value) => value === undefined || [7, 30, 90].includes(value), {
        message: 'rangeDays must be one of 7, 30, 90'
    }),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional()
});

const updateBillingInvoiceSchema = z.object({
    status: z.nativeEnum(InvoiceStatus).optional(),
    internalNote: z
        .string()
        .max(2000, 'internalNote can be at most 2000 characters')
        .nullable()
        .optional()
}).superRefine((value, ctx) => {
    if (value.status === undefined && value.internalNote === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'At least one field must be provided (status, internalNote)'
        });
    }
});

const parseOptionalDate = (value?: string): Date | undefined => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date filter');
    }
    return date;
};

const toCsvValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/["\n,]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const sendCsv = (res: Response, filename: string, headers: string[], rows: Array<Array<unknown>>) => {
    const csvBody = [
        headers.map(toCsvValue).join(','),
        ...rows.map((row) => row.map(toCsvValue).join(','))
    ].join('\n');

    res.header('Content-Type', 'text/csv');
    res.attachment(filename);
    res.send(csvBody);
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

export const getBillingOverview = async (req: Request, res: Response): Promise<void> => {
    try {
        const overview = await billingAdminService.getBillingOverview();
        res.json(overview);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to load billing overview' });
    }
};

export const listBillingSubscriptions = async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = billingSubscriptionsQuerySchema.parse(req.query);
        const data = await billingAdminService.listBillingSubscriptions({
            search: parsed.search,
            plan: parsed.plan as PlanType | undefined,
            billingTerm: parsed.billingTerm,
            status: parsed.status,
            startDate: parseOptionalDate(parsed.startDate),
            endDate: parseOptionalDate(parsed.endDate),
            page: parsed.page,
            limit: parsed.limit
        });
        res.json(data);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to load subscriptions' });
    }
};

export const listBillingInvoices = async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = billingInvoicesQuerySchema.parse(req.query);
        const data = await billingAdminService.listBillingInvoices({
            search: parsed.search,
            status: parsed.status,
            plan: parsed.plan as PlanType | undefined,
            billingTerm: parsed.billingTerm,
            rangeDays: parsed.rangeDays,
            startDate: parseOptionalDate(parsed.startDate),
            endDate: parseOptionalDate(parsed.endDate),
            page: parsed.page,
            limit: parsed.limit
        });
        res.json(data);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to load invoices' });
    }
};

export const updateBillingInvoice = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params as { id: string };
        const payload = updateBillingInvoiceSchema.parse(req.body);
        const actor = (req as any).user;

        if (!actor?.id) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const updated = await billingAdminService.updateBillingInvoice(id, {
            status: payload.status,
            internalNote: payload.internalNote,
            actorId: actor.id,
            actorRole: actor.role,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            requestId: req.headers['x-request-id'] as string | undefined
        });
        res.json(updated);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        if (error.message === 'Invoice not found') {
            res.status(404).json({ message: 'Invoice not found' });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to update invoice' });
    }
};

export const downloadBillingInvoicePdf = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params as { id: string };
        const actor = (req as any).user;
        if (!actor?.id) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const pdf = await billingAdminService.buildInvoicePdfForDashboard(id);

        await auditService.logAction({
            adminId: actor.id,
            actorRole: actor.role,
            action: AuditActionType.OTHER,
            entity: 'Invoice',
            targetId: pdf.invoiceId,
            details: `BILLING_INVOICE_PDF_DOWNLOADED invoiceNumber=${pdf.invoiceNumber}`,
            snapshot: {
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

export const exportBillingInvoicesCsv = async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = billingInvoicesQuerySchema.parse(req.query);
        const data = await billingAdminService.listBillingInvoices({
            search: parsed.search,
            status: parsed.status,
            plan: parsed.plan as PlanType | undefined,
            billingTerm: parsed.billingTerm,
            rangeDays: parsed.rangeDays,
            startDate: parseOptionalDate(parsed.startDate),
            endDate: parseOptionalDate(parsed.endDate),
            page: 1,
            limit: 5000
        });

        const rows = data.invoices.map((row) => ([
            row.invoiceNumber,
            row.organization.name,
            row.plan,
            row.billingTerm,
            row.amountCents / 100,
            row.currency,
            row.status,
            row.issuedAt.toISOString(),
            row.updatedAt.toISOString()
        ]));

        sendCsv(
            res,
            `billing_invoices_${new Date().toISOString().slice(0, 10)}.csv`,
            ['Invoice #', 'Organization', 'Plan', 'Billing Term', 'Amount', 'Currency', 'Status', 'Issued At', 'Updated At'],
            rows
        );
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(500).json({ message: error.message || 'Failed to export invoices' });
    }
};

export const exportBillingSubscriptionsCsv = async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = billingSubscriptionsQuerySchema.parse(req.query);
        const data = await billingAdminService.listBillingSubscriptions({
            search: parsed.search,
            plan: parsed.plan as PlanType | undefined,
            billingTerm: parsed.billingTerm,
            status: parsed.status,
            startDate: parseOptionalDate(parsed.startDate),
            endDate: parseOptionalDate(parsed.endDate),
            page: 1,
            limit: 5000
        });

        const rows = data.subscriptions.map((row) => ([
            row.organization.name,
            row.plan,
            row.billingTerm,
            row.status,
            row.renewalDate ? row.renewalDate.toISOString() : '',
            row.mrrContributionCents !== null ? row.mrrContributionCents / 100 : '',
            row.currency || '',
            row.lastInvoiceStatus || ''
        ]));

        sendCsv(
            res,
            `billing_subscriptions_${new Date().toISOString().slice(0, 10)}.csv`,
            ['Organization', 'Plan', 'Billing Term', 'Status', 'Renewal / Expiry', 'MRR Contribution', 'Currency', 'Last Invoice Status'],
            rows
        );
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(500).json({ message: error.message || 'Failed to export subscriptions' });
    }
};
