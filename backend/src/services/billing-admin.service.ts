import { prisma } from '../db/client';
import {
    BillingGateway,
    InvoiceStatus,
    PaymentAttemptStatus,
    SubscriptionStatus,
    PlanStatus,
    PlanType,
    Prisma
} from '@prisma/client';
import * as auditService from './audit.service';
import { AuditActionType } from '@prisma/client';
import * as organizationService from './organization.service';
import { computeInvoiceIntegrity } from './billing-security.service';
import { buildInvoicePdfBuffer } from './invoice-pdf.service';
import { buildInvoiceDownloadFilename } from './invoice-filename.service';

const ensureBillingAccount = async (organizationId: string) => {
    return prisma.billingAccount.upsert({
        where: { organizationId },
        update: {},
        create: {
            organizationId,
            gateway: BillingGateway.NONE
        }
    });
};

export type AdminInvoiceScope = 'ORG' | 'ENTERPRISE';

export interface AdminInvoiceListFilters {
    search?: string;
    status?: InvoiceStatus;
    planType?: PlanType;
    startDate?: Date;
    endDate?: Date;
    minAmountCents?: number;
    maxAmountCents?: number;
    page?: number;
    limit?: number;
}

export interface AdminInvoiceListItem {
    id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    amountCents: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
    dueAt: Date | null;
    paidAt: Date | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    planType: PlanType;
    subscriptionId: string | null;
    customer: {
        organizationId: string;
        name: string;
        email: string;
        website: string | null;
    };
    billing: {
        billingEmail: string | null;
        billingName: string | null;
        taxId: string | null;
    };
    metadata: Record<string, unknown>;
}

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
} as const;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
    include: typeof INVOICE_INCLUDE;
}>;

const toMetadataRecord = (metadata: unknown): Record<string, unknown> => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return {};
    }
    return metadata as Record<string, unknown>;
};

const toPlanType = (value: unknown): PlanType | null => {
    if (typeof value !== 'string') return null;
    if (value === PlanType.FREE || value === PlanType.BASIC || value === PlanType.PRO || value === PlanType.BUSINESS || value === PlanType.ENTERPRISE) {
        return value;
    }
    return null;
};

const resolveInvoicePlanType = (invoice: InvoiceWithRelations): PlanType => {
    const metadata = toMetadataRecord(invoice.metadata);
    return (
        toPlanType(metadata.planType)
        || invoice.subscription?.planType
        || invoice.billingAccount.organization.planType
        || PlanType.BASIC
    );
};

const toIntOrZero = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
    return 0;
};

const buildInvoiceWhere = (scope: AdminInvoiceScope, filters: AdminInvoiceListFilters): Prisma.InvoiceWhereInput => {
    const and: Prisma.InvoiceWhereInput[] = [];

    if (scope === 'ENTERPRISE') {
        and.push({
            billingAccount: {
                organization: {
                    planType: PlanType.ENTERPRISE
                }
            }
        });
    } else {
        and.push({
            billingAccount: {
                organization: {
                    planType: {
                        in: [PlanType.FREE, PlanType.BASIC, PlanType.PRO, PlanType.BUSINESS]
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
        const createdAt: Prisma.DateTimeFilter = {};
        if (filters.startDate) createdAt.gte = filters.startDate;
        if (filters.endDate) createdAt.lte = filters.endDate;
        and.push({ createdAt });
    }

    if (typeof filters.minAmountCents === 'number' || typeof filters.maxAmountCents === 'number') {
        const amountCents: Prisma.IntFilter = {};
        if (typeof filters.minAmountCents === 'number') amountCents.gte = filters.minAmountCents;
        if (typeof filters.maxAmountCents === 'number') amountCents.lte = filters.maxAmountCents;
        and.push({ amountCents });
    }

    return and.length === 1 ? and[0] : { AND: and };
};

const mapInvoiceListItem = (invoice: InvoiceWithRelations): AdminInvoiceListItem => {
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

export const listInvoices = async (scope: AdminInvoiceScope, filters: AdminInvoiceListFilters) => {
    const page = Math.max(1, Math.floor(filters.page || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(filters.limit || 20)));
    const skip = (page - 1) * limit;
    const where = buildInvoiceWhere(scope, filters);

    const [total, invoices] = await prisma.$transaction([
        prisma.invoice.count({ where }),
        prisma.invoice.findMany({
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

export const buildInvoicePdfForAdmin = async (invoiceId: string, scope: AdminInvoiceScope) => {
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: INVOICE_INCLUDE
    });

    if (!invoice) {
        throw new Error('Invoice not found');
    }

    const planType = resolveInvoicePlanType(invoice);
    const isEnterpriseInvoice = planType === PlanType.ENTERPRISE;
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
    const pdfBuffer = await buildInvoicePdfBuffer({
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

    const filename = buildInvoiceDownloadFilename({
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

export const createManualInvoice = async (params: {
    organizationId: string;
    amountCents: number;
    currency?: string;
    planType: PlanType;
    notes?: string;
    adminId: string;
    durationDays?: number;
}, auditContext?: { ip?: string; userAgent?: string }) => {
    const billingAccount = await ensureBillingAccount(params.organizationId);
    const invoice = await prisma.invoice.create({
        data: {
            billingAccountId: billingAccount.id,
            status: InvoiceStatus.OPEN,
            amountCents: params.amountCents,
            currency: params.currency || 'USD',
            metadata: {
                planType: params.planType,
                durationDays: params.durationDays || null,
                notes: params.notes || null,
                manual: true,
                organizationId: params.organizationId
            } as any,
            integrityHash: computeInvoiceIntegrity({
                organizationId: params.organizationId,
                planType: params.planType,
                amountCents: params.amountCents,
                currency: params.currency || 'USD'
            })
        }
    });

    await auditService.logAction({
        adminId: params.adminId,
        action: AuditActionType.CREATE,
        entity: 'Invoice',
        targetId: invoice.id,
        details: `Created manual invoice for organization ${params.organizationId}`,
        snapshot: invoice,
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });

    return invoice;
};

export const applyOfflinePayment = async (params: {
    invoiceId: string;
    adminId: string;
}, auditContext?: { ip?: string; userAgent?: string }) => {
    const invoice = await prisma.invoice.findUnique({ where: { id: params.invoiceId }, include: { billingAccount: true } });
    if (!invoice) throw new Error('Invoice not found');

    const updatedInvoice = await prisma.invoice.update({
        where: { id: params.invoiceId },
        data: {
            status: InvoiceStatus.PAID,
            paidAt: new Date()
        }
    });

    await prisma.paymentAttempt.create({
        data: {
            billingAccountId: updatedInvoice.billingAccountId,
            invoiceId: updatedInvoice.id,
            status: PaymentAttemptStatus.SUCCESS,
            amountCents: updatedInvoice.amountCents,
            currency: updatedInvoice.currency,
            gateway: BillingGateway.NONE,
            gatewayPaymentId: `offline_${updatedInvoice.id}`
        }
    });

    const planType = (invoice.metadata as any)?.planType as PlanType | undefined;
    const durationDays = (invoice.metadata as any)?.durationDays as number | undefined;
    if (planType) {
        await organizationService.updateOrganizationPlan(invoice.billingAccount.organizationId, {
            planType,
            planStatus: PlanStatus.ACTIVE,
            durationDays: durationDays || 30
        });
    }

    await auditService.logAction({
        adminId: params.adminId,
        action: AuditActionType.UPDATE,
        entity: 'Invoice',
        targetId: updatedInvoice.id,
        details: 'Applied offline payment',
        snapshot: { before: invoice, after: updatedInvoice },
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });

    return updatedInvoice;
};

export const cancelSubscription = async (params: { subscriptionId: string; adminId: string }, auditContext?: { ip?: string; userAgent?: string }) => {
    const subscription = await prisma.subscription.findUnique({ where: { id: params.subscriptionId } });
    if (!subscription) throw new Error('Subscription not found');

    const updated = await prisma.subscription.update({
        where: { id: params.subscriptionId },
        data: {
            status: SubscriptionStatus.CANCELED,
            canceledAt: new Date()
        }
    });

    await auditService.logAction({
        adminId: params.adminId,
        action: AuditActionType.UPDATE,
        entity: 'Subscription',
        targetId: updated.id,
        details: 'Canceled subscription',
        snapshot: { before: subscription, after: updated },
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });

    return updated;
};

export const flagInvoiceRefund = async (params: { invoiceId: string; adminId: string; note?: string }, auditContext?: { ip?: string; userAgent?: string }) => {
    const invoice = await prisma.invoice.findUnique({ where: { id: params.invoiceId } });
    if (!invoice) throw new Error('Invoice not found');

    const metadata = (invoice.metadata || {}) as Record<string, any>;
    const updated = await prisma.invoice.update({
        where: { id: params.invoiceId },
        data: {
            metadata: {
                ...metadata,
                refundFlaggedAt: new Date().toISOString(),
                refundNote: params.note || null,
                refundFlaggedBy: params.adminId
            } as any
        }
    });

    await auditService.logAction({
        adminId: params.adminId,
        action: AuditActionType.UPDATE,
        entity: 'Invoice',
        targetId: updated.id,
        details: 'Flagged invoice for refund review',
        snapshot: { before: invoice, after: updated },
        ipAddress: auditContext?.ip,
        userAgent: auditContext?.userAgent
    });

    return updated;
};
