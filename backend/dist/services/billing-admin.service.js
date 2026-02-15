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
exports.flagInvoiceRefund = exports.cancelSubscription = exports.applyOfflinePayment = exports.createManualInvoice = exports.buildInvoicePdfForAdmin = exports.listInvoices = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const auditService = __importStar(require("./audit.service"));
const client_3 = require("@prisma/client");
const organizationService = __importStar(require("./organization.service"));
const billing_security_service_1 = require("./billing-security.service");
const invoice_pdf_service_1 = require("./invoice-pdf.service");
const invoice_filename_service_1 = require("./invoice-filename.service");
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
const INVOICE_INCLUDE = {
    billingAccount: {
        select: {
            id: true,
            billingEmail: true,
            billingName: true,
            taxId: true,
            organization: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    website: true,
                    address: true,
                    planType: true
                }
            }
        }
    },
    subscription: {
        select: {
            id: true,
            planType: true,
            currentPeriodStart: true,
            currentPeriodEnd: true
        }
    }
};
const toMetadataRecord = (metadata) => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return {};
    }
    return metadata;
};
const toPlanType = (value) => {
    if (typeof value !== 'string')
        return null;
    if (value === client_2.PlanType.FREE || value === client_2.PlanType.BASIC || value === client_2.PlanType.PRO || value === client_2.PlanType.BUSINESS || value === client_2.PlanType.ENTERPRISE) {
        return value;
    }
    return null;
};
const resolveInvoicePlanType = (invoice) => {
    const metadata = toMetadataRecord(invoice.metadata);
    return (toPlanType(metadata.planType)
        || invoice.subscription?.planType
        || invoice.billingAccount.organization.planType
        || client_2.PlanType.BASIC);
};
const toIntOrZero = (value) => {
    if (typeof value === 'number' && Number.isFinite(value))
        return Math.max(0, Math.floor(value));
    return 0;
};
const buildInvoiceWhere = (scope, filters) => {
    const and = [];
    if (scope === 'ENTERPRISE') {
        and.push({
            billingAccount: {
                organization: {
                    planType: client_2.PlanType.ENTERPRISE
                }
            }
        });
    }
    else {
        and.push({
            billingAccount: {
                organization: {
                    planType: {
                        in: [client_2.PlanType.FREE, client_2.PlanType.BASIC, client_2.PlanType.PRO, client_2.PlanType.BUSINESS]
                    }
                }
            }
        });
    }
    if (filters.search) {
        and.push({
            OR: [
                {
                    invoiceNumber: {
                        contains: filters.search,
                        mode: 'insensitive'
                    }
                },
                {
                    billingAccount: {
                        organization: {
                            name: {
                                contains: filters.search,
                                mode: 'insensitive'
                            }
                        }
                    }
                },
                {
                    billingAccount: {
                        organization: {
                            email: {
                                contains: filters.search,
                                mode: 'insensitive'
                            }
                        }
                    }
                },
                {
                    billingAccount: {
                        billingEmail: {
                            contains: filters.search,
                            mode: 'insensitive'
                        }
                    }
                }
            ]
        });
    }
    if (filters.status) {
        and.push({ status: filters.status });
    }
    if (filters.planType) {
        and.push({
            OR: [
                { subscription: { planType: filters.planType } },
                { billingAccount: { organization: { planType: filters.planType } } }
            ]
        });
    }
    if (filters.startDate || filters.endDate) {
        const createdAt = {};
        if (filters.startDate)
            createdAt.gte = filters.startDate;
        if (filters.endDate)
            createdAt.lte = filters.endDate;
        and.push({ createdAt });
    }
    if (typeof filters.minAmountCents === 'number' || typeof filters.maxAmountCents === 'number') {
        const amountCents = {};
        if (typeof filters.minAmountCents === 'number')
            amountCents.gte = filters.minAmountCents;
        if (typeof filters.maxAmountCents === 'number')
            amountCents.lte = filters.maxAmountCents;
        and.push({ amountCents });
    }
    return and.length === 1 ? and[0] : { AND: and };
};
const mapInvoiceListItem = (invoice) => {
    const metadata = toMetadataRecord(invoice.metadata);
    const planType = resolveInvoicePlanType(invoice);
    return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8).toUpperCase()}`,
        status: invoice.status,
        amountCents: invoice.amountCents,
        currency: invoice.currency || 'USD',
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        dueAt: invoice.dueAt,
        paidAt: invoice.paidAt,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        planType,
        subscriptionId: invoice.subscriptionId,
        customer: {
            organizationId: invoice.billingAccount.organization.id,
            name: invoice.billingAccount.organization.name,
            email: invoice.billingAccount.organization.email,
            website: invoice.billingAccount.organization.website
        },
        billing: {
            billingEmail: invoice.billingAccount.billingEmail,
            billingName: invoice.billingAccount.billingName,
            taxId: invoice.billingAccount.taxId
        },
        metadata
    };
};
const listInvoices = async (scope, filters) => {
    const page = Math.max(1, Math.floor(filters.page || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(filters.limit || 20)));
    const skip = (page - 1) * limit;
    const where = buildInvoiceWhere(scope, filters);
    const [total, invoices] = await client_1.prisma.$transaction([
        client_1.prisma.invoice.count({ where }),
        client_1.prisma.invoice.findMany({
            where,
            include: INVOICE_INCLUDE,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        })
    ]);
    return {
        invoices: invoices.map(mapInvoiceListItem),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
};
exports.listInvoices = listInvoices;
const buildInvoicePdfForAdmin = async (invoiceId, scope) => {
    const invoice = await client_1.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: INVOICE_INCLUDE
    });
    if (!invoice) {
        throw new Error('Invoice not found');
    }
    const planType = resolveInvoicePlanType(invoice);
    const isEnterpriseInvoice = planType === client_2.PlanType.ENTERPRISE;
    if (scope === 'ENTERPRISE' && !isEnterpriseInvoice) {
        throw new Error('Invoice not found');
    }
    if (scope === 'ORG' && isEnterpriseInvoice) {
        throw new Error('Invoice not found');
    }
    const metadata = toMetadataRecord(invoice.metadata);
    const periodStart = invoice.periodStart || invoice.subscription?.currentPeriodStart || invoice.createdAt;
    let periodEnd = invoice.periodEnd || invoice.subscription?.currentPeriodEnd || null;
    if (!periodEnd && typeof metadata.durationDays === 'number' && Number.isFinite(metadata.durationDays)) {
        const days = Math.max(0, Math.floor(Number(metadata.durationDays)));
        if (days > 0) {
            periodEnd = new Date(periodStart.getTime() + days * 24 * 60 * 60 * 1000);
        }
    }
    const invoiceNumber = invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
    const pdfBuffer = await (0, invoice_pdf_service_1.buildInvoicePdfBuffer)({
        invoiceNumber,
        invoiceDate: invoice.createdAt,
        status: invoice.status,
        paidAt: invoice.paidAt,
        periodStart,
        periodEnd,
        planName: planType,
        planType,
        currency: invoice.currency || 'USD',
        amountCents: invoice.amountCents,
        discountCents: toIntOrZero(metadata.discountCents),
        taxCents: toIntOrZero(metadata.taxCents),
        billTo: {
            name: invoice.billingAccount.organization.name,
            email: invoice.billingAccount.billingEmail || invoice.billingAccount.organization.email,
            website: invoice.billingAccount.organization.website,
            address: invoice.billingAccount.organization.address
        },
        notes: typeof metadata.notes === 'string' ? metadata.notes : null
    });
    const filename = (0, invoice_filename_service_1.buildInvoiceDownloadFilename)({
        organizationName: invoice.billingAccount.organization.name,
        organizationId: invoice.billingAccount.organization.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceId: invoice.id,
        invoiceDate: invoice.createdAt
    });
    return {
        invoiceId: invoice.id,
        invoiceNumber,
        planType,
        organizationId: invoice.billingAccount.organization.id,
        filename,
        pdfBuffer
    };
};
exports.buildInvoicePdfForAdmin = buildInvoicePdfForAdmin;
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
