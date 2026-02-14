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
exports.extendTrial = exports.flagRefund = exports.cancelSubscription = exports.applyOfflinePayment = exports.createManualInvoice = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const billingAdminService = __importStar(require("../services/billing-admin.service"));
const trialService = __importStar(require("../services/trial.service"));
const auditService = __importStar(require("../services/audit.service"));
const client_2 = require("@prisma/client");
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
