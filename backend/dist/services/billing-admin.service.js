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
exports.flagInvoiceRefund = exports.cancelSubscription = exports.applyOfflinePayment = exports.createManualInvoice = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const auditService = __importStar(require("./audit.service"));
const client_3 = require("@prisma/client");
const organizationService = __importStar(require("./organization.service"));
const billing_security_service_1 = require("./billing-security.service");
const ensureBillingAccount = async (organizationId) => {
    return client_1.prisma.billingAccount.upsert({
        where: { organizationId },
        update: {},
        create: {
            organizationId,
            gateway: client_2.BillingGateway.NONE
        }
    });
};
const createManualInvoice = async (params, auditContext) => {
    const billingAccount = await ensureBillingAccount(params.organizationId);
    const invoice = await client_1.prisma.invoice.create({
        data: {
            billingAccountId: billingAccount.id,
            status: client_2.InvoiceStatus.OPEN,
            amountCents: params.amountCents,
            currency: params.currency || 'USD',
            metadata: {
                planType: params.planType,
                durationDays: params.durationDays || null,
                notes: params.notes || null,
                manual: true,
                organizationId: params.organizationId
            },
            integrityHash: (0, billing_security_service_1.computeInvoiceIntegrity)({
                organizationId: params.organizationId,
                planType: params.planType,
                amountCents: params.amountCents,
                currency: params.currency || 'USD'
            })
        }
    });
    await auditService.logAction({
        adminId: params.adminId,
        action: client_3.AuditActionType.CREATE,
        entity: 'Invoice',
        targetId: invoice.id,
        details: `Created manual invoice for organization ${params.organizationId}`,
        snapshot: invoice,
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });
    return invoice;
};
exports.createManualInvoice = createManualInvoice;
const applyOfflinePayment = async (params, auditContext) => {
    const invoice = await client_1.prisma.invoice.findUnique({ where: { id: params.invoiceId }, include: { billingAccount: true } });
    if (!invoice)
        throw new Error('Invoice not found');
    const updatedInvoice = await client_1.prisma.invoice.update({
        where: { id: params.invoiceId },
        data: {
            status: client_2.InvoiceStatus.PAID,
            paidAt: new Date()
        }
    });
    await client_1.prisma.paymentAttempt.create({
        data: {
            billingAccountId: updatedInvoice.billingAccountId,
            invoiceId: updatedInvoice.id,
            status: client_2.PaymentAttemptStatus.SUCCESS,
            amountCents: updatedInvoice.amountCents,
            currency: updatedInvoice.currency,
            gateway: client_2.BillingGateway.NONE,
            gatewayPaymentId: `offline_${updatedInvoice.id}`
        }
    });
    const planType = invoice.metadata?.planType;
    const durationDays = invoice.metadata?.durationDays;
    if (planType) {
        await organizationService.updateOrganizationPlan(invoice.billingAccount.organizationId, {
            planType,
            planStatus: client_2.PlanStatus.ACTIVE,
            durationDays: durationDays || 30
        });
    }
    await auditService.logAction({
        adminId: params.adminId,
        action: client_3.AuditActionType.UPDATE,
        entity: 'Invoice',
        targetId: updatedInvoice.id,
        details: 'Applied offline payment',
        snapshot: { before: invoice, after: updatedInvoice },
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });
    return updatedInvoice;
};
exports.applyOfflinePayment = applyOfflinePayment;
const cancelSubscription = async (params, auditContext) => {
    const subscription = await client_1.prisma.subscription.findUnique({ where: { id: params.subscriptionId } });
    if (!subscription)
        throw new Error('Subscription not found');
    const updated = await client_1.prisma.subscription.update({
        where: { id: params.subscriptionId },
        data: {
            status: client_2.SubscriptionStatus.CANCELED,
            canceledAt: new Date()
        }
    });
    await auditService.logAction({
        adminId: params.adminId,
        action: client_3.AuditActionType.UPDATE,
        entity: 'Subscription',
        targetId: updated.id,
        details: 'Canceled subscription',
        snapshot: { before: subscription, after: updated },
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });
    return updated;
};
exports.cancelSubscription = cancelSubscription;
const flagInvoiceRefund = async (params, auditContext) => {
    const invoice = await client_1.prisma.invoice.findUnique({ where: { id: params.invoiceId } });
    if (!invoice)
        throw new Error('Invoice not found');
    const metadata = (invoice.metadata || {});
    const updated = await client_1.prisma.invoice.update({
        where: { id: params.invoiceId },
        data: {
            metadata: {
                ...metadata,
                refundFlaggedAt: new Date().toISOString(),
                refundNote: params.note || null,
                refundFlaggedBy: params.adminId
            }
        }
    });
    await auditService.logAction({
        adminId: params.adminId,
        action: client_3.AuditActionType.UPDATE,
        entity: 'Invoice',
        targetId: updated.id,
        details: 'Flagged invoice for refund review',
        snapshot: { before: invoice, after: updated },
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });
    return updated;
};
exports.flagInvoiceRefund = flagInvoiceRefund;
