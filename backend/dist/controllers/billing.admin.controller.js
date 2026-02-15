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
exports.downloadEnterpriseInvoicePdf = exports.downloadOrganizationInvoicePdf = exports.listEnterpriseInvoices = exports.listOrganizationInvoices = exports.extendTrial = exports.flagRefund = exports.cancelSubscription = exports.applyOfflinePayment = exports.createManualInvoice = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const billingAdminService = __importStar(require("../services/billing-admin.service"));
const trialService = __importStar(require("../services/trial.service"));
const auditService = __importStar(require("../services/audit.service"));
const client_2 = require("@prisma/client");
const invoice_filename_service_1 = require("../services/invoice-filename.service");
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
const parseOptionalDate = (value) => {
    if (!value)
        return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date filter');
    }
    return date;
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
