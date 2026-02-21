"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportBillingSubscriptionsCsv = exports.exportBillingInvoicesCsv = exports.downloadBillingInvoicePdf = exports.updateBillingInvoice = exports.listBillingInvoices = exports.listBillingSubscriptions = exports.getBillingOverview = exports.downloadEnterpriseInvoicePdf = exports.downloadOrganizationInvoicePdf = exports.listEnterpriseInvoices = exports.listOrganizationInvoices = exports.extendTrial = exports.flagRefund = exports.cancelSubscription = exports.applyOfflinePayment = exports.createManualInvoice = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const billingAdminService = __importStar(require("../services/billing-admin.service"));
const trialService = __importStar(require("../services/trial.service"));
const auditService = __importStar(require("../services/audit.service"));
const client_2 = require("@prisma/client");
const invoice_filename_service_1 = require("../services/invoice-filename.service");
const currency_1 = require("../utils/currency");
const createInvoiceSchema = zod_1.z.object({
    organizationId: zod_1.z.string().uuid(),
    amountCents: zod_1.z.number().int().positive(),
    currency: zod_1.z.string().optional(),
    planType: zod_1.z.nativeEnum(client_1.PlanType),
    notes: zod_1.z.string().optional(),
    durationDays: zod_1.z.number().int().positive().optional()
});
const refundFlagSchema = zod_1.z.object({
    note: zod_1.z.string().optional()
});
const extendTrialSchema = zod_1.z.object({
    extraDays: zod_1.z.number().int().positive()
});
const invoiceListQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(200).optional(),
    status: zod_1.z.nativeEnum(client_1.InvoiceStatus).optional(),
    planType: zod_1.z.nativeEnum(client_1.PlanType).optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    minAmountCents: zod_1.z.coerce.number().int().nonnegative().optional(),
    maxAmountCents: zod_1.z.coerce.number().int().nonnegative().optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional()
});
const BILLING_TERM_VALUES = ['MONTHLY', 'ANNUAL'];
const PAID_PLAN_VALUES = ['BASIC', 'PRO', 'BUSINESS', 'ENTERPRISE'];
const billingSubscriptionsQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(200).optional(),
    plan: zod_1.z.enum(PAID_PLAN_VALUES).optional(),
    billingTerm: zod_1.z.enum(BILLING_TERM_VALUES).optional(),
    status: zod_1.z.nativeEnum(client_1.SubscriptionStatus).optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(200).optional()
});
const billingInvoicesQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(200).optional(),
    status: zod_1.z.nativeEnum(client_1.InvoiceStatus).optional(),
    plan: zod_1.z.enum(PAID_PLAN_VALUES).optional(),
    billingTerm: zod_1.z.enum(BILLING_TERM_VALUES).optional(),
    rangeDays: zod_1.z.coerce.number().int().optional().refine((value) => value === undefined || [7, 30, 90].includes(value), {
        message: 'rangeDays must be one of 7, 30, 90'
    }),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().min(1).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(200).optional()
});
const updateBillingInvoiceSchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(client_1.InvoiceStatus).optional(),
    internalNote: zod_1.z
        .string()
        .max(2000, 'internalNote can be at most 2000 characters')
        .nullable()
        .optional()
}).superRefine((value, ctx) => {
    if (value.status === undefined && value.internalNote === undefined) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'At least one field must be provided (status, internalNote)'
        });
    }
});
const parseOptionalDate = (value) => {
    if (!value)
        return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date filter');
    }
    return date;
};
const toCsvValue = (value) => {
    if (value === null || value === undefined)
        return '';
    const text = String(value);
    if (/["\n,]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};
const sendCsv = (res, filename, headers, rows) => {
    const csvBody = [
        headers.map(toCsvValue).join(','),
        ...rows.map((row) => row.map(toCsvValue).join(','))
    ].join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment(filename);
    res.send(csvBody);
};
const listInvoicesByScope = async (req, res, scope) => {
    try {
        const parsed = invoiceListQuerySchema.parse(req.query);
        const startDate = parseOptionalDate(parsed.startDate);
        const endDate = parseOptionalDate(parsed.endDate);
        if (typeof parsed.minAmountCents === 'number'
            && typeof parsed.maxAmountCents === 'number'
            && parsed.minAmountCents > parsed.maxAmountCents) {
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to list invoices' });
    }
};
const downloadInvoicePdfByScope = async (req, res, scope) => {
    try {
        const { id } = req.params;
        const actor = req.user;
        if (!actor?.id) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        const pdf = await billingAdminService.buildInvoicePdfForAdmin(id, scope);
        await auditService.logAction({
            adminId: actor.id,
            actorRole: actor.role,
            action: client_2.AuditActionType.OTHER,
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
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Disposition', (0, invoice_filename_service_1.buildInvoiceContentDisposition)(pdf.filename));
        res.status(200).send(pdf.pdfBuffer);
    }
    catch (error) {
        if (error.message === 'Invoice not found') {
            res.status(404).json({ message: 'Invoice not found' });
            return;
        }
        res.status(500).json({ message: error.message || 'Failed to download invoice PDF' });
    }
};
const createManualInvoice = async (req, res) => {
    try {
        const payload = createInvoiceSchema.parse(req.body);
        const actor = req.user;
        const invoice = await billingAdminService.createManualInvoice({ ...payload, adminId: actor.id }, { ip: req.ip, userAgent: req.headers['user-agent'] });
        res.status(201).json(invoice);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to create invoice' });
    }
};
exports.createManualInvoice = createManualInvoice;
const applyOfflinePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const actor = req.user;
        const invoice = await billingAdminService.applyOfflinePayment({ invoiceId: id, adminId: actor.id }, { ip: req.ip, userAgent: req.headers['user-agent'] });
        res.json(invoice);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to apply offline payment' });
    }
};
exports.applyOfflinePayment = applyOfflinePayment;
const cancelSubscription = async (req, res) => {
    try {
        const { id } = req.params;
        const actor = req.user;
        const subscription = await billingAdminService.cancelSubscription({ subscriptionId: id, adminId: actor.id }, { ip: req.ip, userAgent: req.headers['user-agent'] });
        res.json(subscription);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to cancel subscription' });
    }
};
exports.cancelSubscription = cancelSubscription;
const flagRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = refundFlagSchema.parse(req.body);
        const actor = req.user;
        const invoice = await billingAdminService.flagInvoiceRefund({ invoiceId: id, adminId: actor.id, note: payload.note }, { ip: req.ip, userAgent: req.headers['user-agent'] });
        res.json(invoice);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to flag refund' });
    }
};
exports.flagRefund = flagRefund;
const extendTrial = async (req, res) => {
    try {
        const { organizationId } = req.params;
        const payload = extendTrialSchema.parse(req.body);
        const actor = req.user;
        const trial = await trialService.extendTrial({
            organizationId,
            extraDays: payload.extraDays
        });
        if (actor?.id) {
            auditService.logAction({
                adminId: actor.id,
                action: client_2.AuditActionType.UPDATE,
                entity: 'TrialSession',
                targetId: trial.id,
                details: `Extended trial by ${payload.extraDays} days`,
                snapshot: trial,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        res.json(trial);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to extend trial' });
    }
};
exports.extendTrial = extendTrial;
const listOrganizationInvoices = async (req, res) => {
    await listInvoicesByScope(req, res, 'ORG');
};
exports.listOrganizationInvoices = listOrganizationInvoices;
const listEnterpriseInvoices = async (req, res) => {
    await listInvoicesByScope(req, res, 'ENTERPRISE');
};
exports.listEnterpriseInvoices = listEnterpriseInvoices;
const downloadOrganizationInvoicePdf = async (req, res) => {
    await downloadInvoicePdfByScope(req, res, 'ORG');
};
exports.downloadOrganizationInvoicePdf = downloadOrganizationInvoicePdf;
const downloadEnterpriseInvoicePdf = async (req, res) => {
    await downloadInvoicePdfByScope(req, res, 'ENTERPRISE');
};
exports.downloadEnterpriseInvoicePdf = downloadEnterpriseInvoicePdf;
const getBillingOverview = async (req, res) => {
    try {
        const overview = await billingAdminService.getBillingOverview();
        res.json(overview);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Failed to load billing overview' });
    }
};
exports.getBillingOverview = getBillingOverview;
const listBillingSubscriptions = async (req, res) => {
    try {
        const parsed = billingSubscriptionsQuerySchema.parse(req.query);
        const data = await billingAdminService.listBillingSubscriptions({
            search: parsed.search,
            plan: parsed.plan,
            billingTerm: parsed.billingTerm,
            status: parsed.status,
            startDate: parseOptionalDate(parsed.startDate),
            endDate: parseOptionalDate(parsed.endDate),
            page: parsed.page,
            limit: parsed.limit
        });
        res.json(data);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to load subscriptions' });
    }
};
exports.listBillingSubscriptions = listBillingSubscriptions;
const listBillingInvoices = async (req, res) => {
    try {
        const parsed = billingInvoicesQuerySchema.parse(req.query);
        const data = await billingAdminService.listBillingInvoices({
            search: parsed.search,
            status: parsed.status,
            plan: parsed.plan,
            billingTerm: parsed.billingTerm,
            rangeDays: parsed.rangeDays,
            startDate: parseOptionalDate(parsed.startDate),
            endDate: parseOptionalDate(parsed.endDate),
            page: parsed.page,
            limit: parsed.limit
        });
        res.json(data);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to load invoices' });
    }
};
exports.listBillingInvoices = listBillingInvoices;
const updateBillingInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = updateBillingInvoiceSchema.parse(req.body);
        const actor = req.user;
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
            requestId: req.headers['x-request-id']
        });
        res.json(updated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
exports.updateBillingInvoice = updateBillingInvoice;
const downloadBillingInvoicePdf = async (req, res) => {
    try {
        const { id } = req.params;
        const actor = req.user;
        if (!actor?.id) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        const pdf = await billingAdminService.buildInvoicePdfForDashboard(id);
        await auditService.logAction({
            adminId: actor.id,
            actorRole: actor.role,
            action: client_2.AuditActionType.OTHER,
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
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Disposition', (0, invoice_filename_service_1.buildInvoiceContentDisposition)(pdf.filename));
        res.status(200).send(pdf.pdfBuffer);
    }
    catch (error) {
        if (error.message === 'Invoice not found') {
            res.status(404).json({ message: 'Invoice not found' });
            return;
        }
        res.status(500).json({ message: error.message || 'Failed to download invoice PDF' });
    }
};
exports.downloadBillingInvoicePdf = downloadBillingInvoicePdf;
const exportBillingInvoicesCsv = async (req, res) => {
    try {
        const parsed = billingInvoicesQuerySchema.parse(req.query);
        const data = await billingAdminService.listBillingInvoices({
            search: parsed.search,
            status: parsed.status,
            plan: parsed.plan,
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
            // Discovery note (backend/src/controllers/billing.admin.controller.ts):
            // CSV previously emitted numeric cents/100 values (e.g. 50.5). Export now keeps fixed 2-decimal currency strings.
            (0, currency_1.formatCentsToDecimalString)(row.amountCents),
            row.currency,
            row.status,
            row.issuedAt.toISOString(),
            row.updatedAt.toISOString()
        ]));
        sendCsv(res, `billing_invoices_${new Date().toISOString().slice(0, 10)}.csv`, ['Invoice #', 'Organization', 'Plan', 'Billing Term', 'Amount', 'Currency', 'Status', 'Issued At', 'Updated At'], rows);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(500).json({ message: error.message || 'Failed to export invoices' });
    }
};
exports.exportBillingInvoicesCsv = exportBillingInvoicesCsv;
const exportBillingSubscriptionsCsv = async (req, res) => {
    try {
        const parsed = billingSubscriptionsQuerySchema.parse(req.query);
        const data = await billingAdminService.listBillingSubscriptions({
            search: parsed.search,
            plan: parsed.plan,
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
            (0, currency_1.formatCentsToDecimalString)(row.mrrContributionCents),
            row.currency || '',
            row.lastInvoiceStatus || ''
        ]));
        sendCsv(res, `billing_subscriptions_${new Date().toISOString().slice(0, 10)}.csv`, ['Organization', 'Plan', 'Billing Term', 'Status', 'Renewal / Expiry', 'MRR Contribution', 'Currency', 'Last Invoice Status'], rows);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(500).json({ message: error.message || 'Failed to export subscriptions' });
    }
};
exports.exportBillingSubscriptionsCsv = exportBillingSubscriptionsCsv;
