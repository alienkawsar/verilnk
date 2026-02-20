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
import * as realtimeService from './realtime.service';
import { resolvePlanChargeAmountCents } from './billing-pricing.service';

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
export type BillingTerm = 'MONTHLY' | 'ANNUAL';

const PAID_PLAN_TYPES: PlanType[] = [
    PlanType.BASIC,
    PlanType.PRO,
    PlanType.BUSINESS,
    PlanType.ENTERPRISE
];

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

export interface BillingOverviewResponse {
    mrrCents: number | null;
    arrCents: number | null;
    activeSubscriptionsByPlan: Record<'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE', number>;
    activeSubscriptionsByBillingTerm: Record<BillingTerm, number>;
    newPaidOrganizations: { last7Days: number; last30Days: number };
    renewalsDue: { next30Days: number; next60Days: number; next90Days: number };
    failedVoidPayments: { failedPayments: number; voidInvoices: number; total: number };
}

export interface BillingSubscriptionsFilters {
    search?: string;
    plan?: PlanType;
    billingTerm?: BillingTerm;
    status?: SubscriptionStatus;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}

export interface BillingSubscriptionsRow {
    id: string;
    organization: { id: string; name: string };
    plan: PlanType;
    billingTerm: BillingTerm | null;
    status: SubscriptionStatus;
    renewalDate: Date | null;
    mrrContributionCents: number | null;
    currency: string | null;
    lastInvoiceStatus: InvoiceStatus | null;
    lastInvoiceUpdatedAt: Date | null;
}

export interface BillingInvoicesFilters {
    search?: string;
    status?: InvoiceStatus;
    plan?: PlanType;
    billingTerm?: BillingTerm;
    rangeDays?: number;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}

export interface BillingInvoiceRow {
    id: string;
    invoiceNumber: string;
    organization: { id: string; name: string };
    plan: PlanType;
    billingTerm: BillingTerm | null;
    amountCents: number;
    currency: string;
    status: InvoiceStatus;
    issuedAt: Date;
    updatedAt: Date;
    internalNote: string | null;
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
            currentPeriodEnd: true,
            metadata: true
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

const toBillingTerm = (value: unknown): BillingTerm | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'MONTHLY') return 'MONTHLY';
    if (normalized === 'ANNUAL') return 'ANNUAL';
    return null;
};

const inferBillingTermFromDurationDays = (value: unknown): BillingTerm | null => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const duration = Math.max(0, Math.floor(value));
    if (duration >= 300) return 'ANNUAL';
    if (duration >= 20) return 'MONTHLY';
    return null;
};

const inferBillingTermFromPeriod = (start: Date | null | undefined, end: Date | null | undefined): BillingTerm | null => {
    if (!start || !end) return null;
    const diffMs = end.getTime() - start.getTime();
    if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays >= 300) return 'ANNUAL';
    if (diffDays >= 20) return 'MONTHLY';
    return null;
};

const resolveSubscriptionBillingTerm = (subscription: {
    metadata?: unknown;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
}): BillingTerm | null => {
    const metadata = toMetadataRecord(subscription.metadata);
    return (
        toBillingTerm(metadata.billingTerm)
        || inferBillingTermFromDurationDays(metadata.durationDays)
        || inferBillingTermFromPeriod(subscription.currentPeriodStart || null, subscription.currentPeriodEnd || null)
    );
};

const resolveInvoiceBillingTerm = (invoice: {
    metadata?: unknown;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    subscription?: {
        metadata?: unknown;
        currentPeriodStart?: Date | null;
        currentPeriodEnd?: Date | null;
    } | null;
}): BillingTerm | null => {
    const metadata = toMetadataRecord(invoice.metadata);
    return (
        toBillingTerm(metadata.billingTerm)
        || inferBillingTermFromDurationDays(metadata.durationDays)
        || inferBillingTermFromPeriod(invoice.periodStart || null, invoice.periodEnd || null)
        || (
            invoice.subscription
                ? resolveSubscriptionBillingTerm({
                    metadata: invoice.subscription.metadata,
                    currentPeriodStart: invoice.subscription.currentPeriodStart,
                    currentPeriodEnd: invoice.subscription.currentPeriodEnd
                })
                : null
        )
    );
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

const resolveLegacyPlanMrrContribution = (planType: PlanType, billingTerm: BillingTerm | null): number | null => {
    if (!billingTerm) return null;
    if (planType !== PlanType.BASIC && planType !== PlanType.PRO && planType !== PlanType.BUSINESS) {
        return null;
    }

    const billedAmount = resolvePlanChargeAmountCents({
        planType,
        billingTerm
    });
    return billingTerm === 'ANNUAL' ? Math.round(billedAmount / 12) : billedAmount;
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

const mapBillingInvoiceRow = (invoice: InvoiceWithRelations): BillingInvoiceRow => {
    const metadata = toMetadataRecord(invoice.metadata);
    const internalNote = typeof metadata.internalNote === 'string' ? metadata.internalNote : null;

    return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8).toUpperCase()}`,
        organization: {
            id: invoice.billingAccount.organization.id,
            name: invoice.billingAccount.organization.name
        },
        plan: resolveInvoicePlanType(invoice),
        billingTerm: resolveInvoiceBillingTerm(invoice),
        amountCents: invoice.amountCents,
        currency: invoice.currency || 'USD',
        status: invoice.status,
        issuedAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        internalNote
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

export const getBillingOverview = async (): Promise<BillingOverviewResponse> => {
    const now = new Date();
    const day30Ms = 30 * 24 * 60 * 60 * 1000;
    const day60Ms = 60 * 24 * 60 * 60 * 1000;
    const day90Ms = 90 * 24 * 60 * 60 * 1000;
    const day7Ago = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const day30Ago = new Date(now.getTime() - day30Ms);

    const [activeSubscriptions, paidInvoices, failedPaymentsCount, voidInvoicesCount] = await prisma.$transaction([
        prisma.subscription.findMany({
            where: {
                planType: { in: PAID_PLAN_TYPES },
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] }
            },
            select: {
                billingAccount: {
                    select: {
                        organizationId: true
                    }
                },
                planType: true,
                amountCents: true,
                currency: true,
                metadata: true,
                currentPeriodStart: true,
                currentPeriodEnd: true
            }
        }),
        prisma.invoice.findMany({
            where: {
                status: InvoiceStatus.PAID,
                billingAccount: {
                    organization: {
                        planType: { in: PAID_PLAN_TYPES }
                    }
                }
            },
            select: {
                billingAccount: {
                    select: { organizationId: true }
                },
                paidAt: true,
                createdAt: true
            }
        }),
        prisma.paymentAttempt.count({
            where: {
                status: PaymentAttemptStatus.FAILED,
                billingAccount: {
                    organization: {
                        planType: { in: PAID_PLAN_TYPES }
                    }
                }
            }
        }),
        prisma.invoice.count({
            where: {
                status: InvoiceStatus.VOID,
                billingAccount: {
                    organization: {
                        planType: { in: PAID_PLAN_TYPES }
                    }
                }
            }
        })
    ]);

    const activeSubscriptionOrganizationIds = Array.from(new Set(
        activeSubscriptions.map((subscription) => subscription.billingAccount.organizationId)
    ));

    const legacyPaidOrganizations = await prisma.organization.findMany({
        where: {
            planType: { in: PAID_PLAN_TYPES },
            planStatus: PlanStatus.ACTIVE,
            deletedAt: null,
            id: {
                notIn: activeSubscriptionOrganizationIds
            }
        },
        select: {
            id: true,
            planType: true,
            planStartAt: true,
            planEndAt: true
        }
    });

    const activeSubscriptionsByPlan: Record<'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE', number> = {
        BASIC: 0,
        PRO: 0,
        BUSINESS: 0,
        ENTERPRISE: 0
    };

    const activeSubscriptionsByBillingTerm: Record<BillingTerm, number> = {
        MONTHLY: 0,
        ANNUAL: 0
    };

    let mrrCents = 0;
    let hasMrrData = false;
    const mrrCurrencies = new Set<string>();
    const renewalsDue = { next30Days: 0, next60Days: 0, next90Days: 0 };

    for (const subscription of activeSubscriptions) {
        const plan = subscription.planType;
        if (plan === PlanType.BASIC || plan === PlanType.PRO || plan === PlanType.BUSINESS || plan === PlanType.ENTERPRISE) {
            activeSubscriptionsByPlan[plan] += 1;
        }

        const billingTerm = resolveSubscriptionBillingTerm(subscription);
        if (billingTerm) {
            activeSubscriptionsByBillingTerm[billingTerm] += 1;
        }

        if (subscription.amountCents !== null && subscription.amountCents !== undefined && billingTerm) {
            hasMrrData = true;
            if (subscription.currency) {
                mrrCurrencies.add(subscription.currency);
            }
            const monthlyContribution = billingTerm === 'ANNUAL'
                ? Math.round(subscription.amountCents / 12)
                : subscription.amountCents;
            mrrCents += monthlyContribution;
        }

        const renewalDate = subscription.currentPeriodEnd;
        if (renewalDate && renewalDate > now) {
            const diffMs = renewalDate.getTime() - now.getTime();
            if (diffMs <= day90Ms) renewalsDue.next90Days += 1;
            if (diffMs <= day60Ms) renewalsDue.next60Days += 1;
            if (diffMs <= day30Ms) renewalsDue.next30Days += 1;
        }
    }

    // Discovery note (backend/src/services/billing-admin.service.ts):
    // Legacy admin-created paid orgs could exist without Subscription/Invoice rows.
    // Include active paid Organization-plan rows so ENTERPRISE/BASIC/PRO/BUSINESS are visible in ACCOUNTS KPIs.
    for (const organization of legacyPaidOrganizations) {
        const plan = organization.planType;
        if (plan === PlanType.BASIC || plan === PlanType.PRO || plan === PlanType.BUSINESS || plan === PlanType.ENTERPRISE) {
            activeSubscriptionsByPlan[plan] += 1;
        }

        const billingTerm = inferBillingTermFromPeriod(
            organization.planStartAt || null,
            organization.planEndAt || null
        );
        if (billingTerm) {
            activeSubscriptionsByBillingTerm[billingTerm] += 1;
        }

        const fallbackMrrContribution = resolveLegacyPlanMrrContribution(plan, billingTerm);
        if (fallbackMrrContribution !== null) {
            hasMrrData = true;
            mrrCurrencies.add('USD');
            mrrCents += fallbackMrrContribution;
        }

        const renewalDate = organization.planEndAt;
        if (renewalDate && renewalDate > now) {
            const diffMs = renewalDate.getTime() - now.getTime();
            if (diffMs <= day90Ms) renewalsDue.next90Days += 1;
            if (diffMs <= day60Ms) renewalsDue.next60Days += 1;
            if (diffMs <= day30Ms) renewalsDue.next30Days += 1;
        }
    }

    const firstPaidByOrg = new Map<string, Date>();
    for (const paidInvoice of paidInvoices) {
        const orgId = paidInvoice.billingAccount.organizationId;
        const paidAt = paidInvoice.paidAt || paidInvoice.createdAt;
        const existing = firstPaidByOrg.get(orgId);
        if (!existing || paidAt < existing) {
            firstPaidByOrg.set(orgId, paidAt);
        }
    }

    let newPaidOrganizations7 = 0;
    let newPaidOrganizations30 = 0;
    for (const firstPaidAt of firstPaidByOrg.values()) {
        if (firstPaidAt >= day30Ago) newPaidOrganizations30 += 1;
        if (firstPaidAt >= day7Ago) newPaidOrganizations7 += 1;
    }

    const canComputeMrr = hasMrrData && mrrCurrencies.size <= 1;

    return {
        mrrCents: canComputeMrr ? mrrCents : null,
        arrCents: canComputeMrr ? mrrCents * 12 : null,
        activeSubscriptionsByPlan,
        activeSubscriptionsByBillingTerm,
        newPaidOrganizations: {
            last7Days: newPaidOrganizations7,
            last30Days: newPaidOrganizations30
        },
        renewalsDue,
        failedVoidPayments: {
            failedPayments: failedPaymentsCount,
            voidInvoices: voidInvoicesCount,
            total: failedPaymentsCount + voidInvoicesCount
        }
    };
};

export const listBillingSubscriptions = async (filters: BillingSubscriptionsFilters) => {
    const page = Math.max(1, Math.floor(filters.page || 1));
    const limit = Math.min(200, Math.max(1, Math.floor(filters.limit || 20)));
    const skip = (page - 1) * limit;

    const and: Prisma.SubscriptionWhereInput[] = [
        {
            planType: { in: PAID_PLAN_TYPES }
        }
    ];

    if (filters.plan) {
        and.push({ planType: filters.plan });
    }
    if (filters.status) {
        and.push({ status: filters.status });
    }
    if (filters.search) {
        and.push({
            billingAccount: {
                organization: {
                    name: {
                        contains: filters.search,
                        mode: 'insensitive'
                    }
                }
            }
        });
    }
    if (filters.startDate || filters.endDate) {
        const currentPeriodEnd: Prisma.DateTimeFilter = {};
        if (filters.startDate) currentPeriodEnd.gte = filters.startDate;
        if (filters.endDate) currentPeriodEnd.lte = filters.endDate;
        and.push({ currentPeriodEnd });
    }

    const subscriptions = await prisma.subscription.findMany({
        where: and.length === 1 ? and[0] : { AND: and },
        include: {
            billingAccount: {
                select: {
                    organization: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            },
            invoices: {
                select: {
                    status: true,
                    updatedAt: true
                },
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        },
        orderBy: { updatedAt: 'desc' }
    });

    const subscriptionRows: BillingSubscriptionsRow[] = subscriptions
        .map((subscription) => {
            const billingTerm = resolveSubscriptionBillingTerm(subscription);
            const lastInvoice = subscription.invoices[0];
            const mrrContributionCents = (
                subscription.amountCents !== null
                && subscription.amountCents !== undefined
                && billingTerm
            )
                ? (billingTerm === 'ANNUAL'
                    ? Math.round(subscription.amountCents / 12)
                    : subscription.amountCents)
                : null;

            return {
                id: subscription.id,
                organization: {
                    id: subscription.billingAccount.organization.id,
                    name: subscription.billingAccount.organization.name
                },
                plan: subscription.planType,
                billingTerm,
                status: subscription.status,
                renewalDate: subscription.currentPeriodEnd,
                mrrContributionCents,
                currency: subscription.currency,
                lastInvoiceStatus: lastInvoice?.status || null,
                lastInvoiceUpdatedAt: lastInvoice?.updatedAt || null
            };
        })
        .filter((row) => !filters.billingTerm || row.billingTerm === filters.billingTerm);

    const activeSubscriptionOrganizationIds = Array.from(new Set(
        subscriptions.map((subscription) => subscription.billingAccount.organization.id)
    ));

    const shouldIncludeLegacyRows = !filters.status || filters.status === SubscriptionStatus.ACTIVE;
    const legacyOrganizations = shouldIncludeLegacyRows
        ? await prisma.organization.findMany({
            where: {
                planType: { in: PAID_PLAN_TYPES },
                planStatus: PlanStatus.ACTIVE,
                deletedAt: null,
                id: {
                    notIn: activeSubscriptionOrganizationIds
                },
                ...(filters.plan ? { planType: filters.plan } : {}),
                ...(filters.search
                    ? {
                        name: {
                            contains: filters.search,
                            mode: 'insensitive' as const
                        }
                    }
                    : {}),
                ...((filters.startDate || filters.endDate)
                    ? {
                        planEndAt: {
                            ...(filters.startDate ? { gte: filters.startDate } : {}),
                            ...(filters.endDate ? { lte: filters.endDate } : {})
                        }
                    }
                    : {})
            },
            select: {
                id: true,
                name: true,
                planType: true,
                planStartAt: true,
                planEndAt: true,
                billingAccount: {
                    select: {
                        invoices: {
                            select: {
                                status: true,
                                updatedAt: true
                            },
                            orderBy: { createdAt: 'desc' },
                            take: 1
                        }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' }
        })
        : [];

    const legacyRows: BillingSubscriptionsRow[] = legacyOrganizations
        .map((organization) => {
            const billingTerm = inferBillingTermFromPeriod(
                organization.planStartAt || null,
                organization.planEndAt || null
            );
            const lastInvoice = organization.billingAccount?.invoices?.[0];
            const mrrContributionCents = resolveLegacyPlanMrrContribution(
                organization.planType,
                billingTerm
            );

            return {
                id: `ORG-PLAN-${organization.id}`,
                organization: {
                    id: organization.id,
                    name: organization.name
                },
                plan: organization.planType,
                billingTerm,
                status: SubscriptionStatus.ACTIVE,
                renewalDate: organization.planEndAt,
                mrrContributionCents,
                currency: mrrContributionCents !== null ? 'USD' : null,
                lastInvoiceStatus: lastInvoice?.status || null,
                lastInvoiceUpdatedAt: lastInvoice?.updatedAt || null
            };
        })
        .filter((row) => !filters.billingTerm || row.billingTerm === filters.billingTerm);

    const rows = [...subscriptionRows, ...legacyRows].sort((a, b) => {
        const renewalA = a.renewalDate ? a.renewalDate.getTime() : 0;
        const renewalB = b.renewalDate ? b.renewalDate.getTime() : 0;
        if (renewalA !== renewalB) return renewalB - renewalA;
        return a.organization.name.localeCompare(b.organization.name);
    });

    const total = rows.length;
    const pagedRows = rows.slice(skip, skip + limit);

    return {
        subscriptions: pagedRows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit))
        }
    };
};

export const listBillingInvoices = async (filters: BillingInvoicesFilters) => {
    const page = Math.max(1, Math.floor(filters.page || 1));
    const limit = Math.min(200, Math.max(1, Math.floor(filters.limit || 20)));
    const skip = (page - 1) * limit;

    const and: Prisma.InvoiceWhereInput[] = [
        {
            billingAccount: {
                organization: {
                    planType: { in: PAID_PLAN_TYPES }
                }
            }
        }
    ];

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
                }
            ]
        });
    }

    if (filters.status) {
        and.push({ status: filters.status });
    }

    if (filters.plan) {
        and.push({
            OR: [
                { subscription: { planType: filters.plan } },
                { billingAccount: { organization: { planType: filters.plan } } }
            ]
        });
    }

    const dateFilter: Prisma.DateTimeFilter = {};
    if (filters.startDate) dateFilter.gte = filters.startDate;
    if (filters.endDate) dateFilter.lte = filters.endDate;
    if (!filters.startDate && !filters.endDate && filters.rangeDays) {
        dateFilter.gte = new Date(Date.now() - filters.rangeDays * 24 * 60 * 60 * 1000);
    }
    if (Object.keys(dateFilter).length > 0) {
        and.push({ createdAt: dateFilter });
    }

    const invoices = await prisma.invoice.findMany({
        where: and.length === 1 ? and[0] : { AND: and },
        include: INVOICE_INCLUDE,
        orderBy: { createdAt: 'desc' }
    });

    const rows = invoices
        .map(mapBillingInvoiceRow)
        .filter((row) => !filters.billingTerm || row.billingTerm === filters.billingTerm)
        .filter((row) => !filters.plan || row.plan === filters.plan);

    const total = rows.length;
    const pagedRows = rows.slice(skip, skip + limit);

    return {
        invoices: pagedRows,
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

export const buildInvoicePdfForDashboard = async (invoiceId: string) => {
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: INVOICE_INCLUDE
    });

    if (!invoice) {
        throw new Error('Invoice not found');
    }

    const planType = resolveInvoicePlanType(invoice);
    const scope: AdminInvoiceScope = planType === PlanType.ENTERPRISE ? 'ENTERPRISE' : 'ORG';
    return buildInvoicePdfForAdmin(invoiceId, scope);
};

export const updateBillingInvoice = async (
    invoiceId: string,
    input: {
        status?: InvoiceStatus;
        internalNote?: string | null;
        actorId: string;
        actorRole?: string;
        ip?: string;
        userAgent?: string;
        requestId?: string;
    }
) => {
    const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.invoice.findUnique({
            where: { id: invoiceId },
            include: INVOICE_INCLUDE
        });
        if (!existing) {
            throw new Error('Invoice not found');
        }

        const existingMetadata = toMetadataRecord(existing.metadata);
        const beforeInternalNote = typeof existingMetadata.internalNote === 'string'
            ? existingMetadata.internalNote
            : null;

        const nextStatus = input.status ?? existing.status;
        const nextInternalNote = input.internalNote === undefined ? beforeInternalNote : input.internalNote;

        const updatedMetadata: Record<string, unknown> = {
            ...existingMetadata
        };
        if (input.internalNote !== undefined) {
            updatedMetadata.internalNote = input.internalNote ?? null;
        }

        const updated = await tx.invoice.update({
            where: { id: invoiceId },
            data: {
                status: nextStatus,
                ...(input.internalNote !== undefined ? { metadata: updatedMetadata as any } : {})
            },
            include: INVOICE_INCLUDE
        });

        const plan = resolveInvoicePlanType(updated);
        const billingTerm = resolveInvoiceBillingTerm(updated);
        const invoiceNumber = updated.invoiceNumber || `INV-${updated.id.slice(0, 8).toUpperCase()}`;

        const logEntry = await auditService.logActionTx(tx, {
            adminId: input.actorId,
            actorRole: input.actorRole,
            action: AuditActionType.INVOICE_UPDATE,
            entity: 'Invoice',
            targetId: updated.id,
            details: `INVOICE_UPDATE invoice=${invoiceNumber}`,
            snapshot: {
                before: {
                    status: existing.status,
                    internalNote: beforeInternalNote
                },
                after: {
                    status: nextStatus,
                    internalNote: nextInternalNote
                },
                meta: {
                    orgId: updated.billingAccount.organization.id,
                    invoiceNumber,
                    plan,
                    billingTerm,
                    amount: updated.amountCents,
                    source: 'BILLING_DASHBOARD',
                    ip: input.ip || null,
                    userAgent: input.userAgent || null,
                    requestId: input.requestId || null
                }
            },
            ipAddress: input.ip,
            userAgent: input.userAgent
        });

        return { updated, logEntry };
    });

    realtimeService.broadcast('LOG', {
        ...result.logEntry,
        adminName: 'Fetching...'
    });

    return mapBillingInvoiceRow(result.updated);
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
