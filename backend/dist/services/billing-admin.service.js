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
exports.flagInvoiceRefund = exports.cancelSubscription = exports.applyOfflinePayment = exports.createManualInvoice = exports.updateBillingInvoice = exports.buildInvoicePdfForDashboard = exports.buildInvoicePdfForAdmin = exports.listBillingInvoices = exports.listBillingSubscriptions = exports.getBillingOverview = exports.listInvoices = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const auditService = __importStar(require("./audit.service"));
const client_3 = require("@prisma/client");
const organizationService = __importStar(require("./organization.service"));
const billing_security_service_1 = require("./billing-security.service");
const invoice_pdf_service_1 = require("./invoice-pdf.service");
const invoice_filename_service_1 = require("./invoice-filename.service");
const realtimeService = __importStar(require("./realtime.service"));
const billing_pricing_service_1 = require("./billing-pricing.service");
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
const PAID_PLAN_TYPES = [
    client_2.PlanType.BASIC,
    client_2.PlanType.PRO,
    client_2.PlanType.BUSINESS,
    client_2.PlanType.ENTERPRISE
];
const INVOICE_INCLUDE = {
    billingAccount: {
        select: {
            id: true,
            gateway: true,
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
                    planType: true,
                    country: {
                        select: {
                            code: true
                        }
                    }
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
const toBillingTerm = (value) => {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'MONTHLY')
        return 'MONTHLY';
    if (normalized === 'ANNUAL')
        return 'ANNUAL';
    return null;
};
const inferBillingTermFromDurationDays = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return null;
    const duration = Math.max(0, Math.floor(value));
    if (duration >= 300)
        return 'ANNUAL';
    if (duration >= 20)
        return 'MONTHLY';
    return null;
};
const inferBillingTermFromPeriod = (start, end) => {
    if (!start || !end)
        return null;
    const diffMs = end.getTime() - start.getTime();
    if (!Number.isFinite(diffMs) || diffMs <= 0)
        return null;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays >= 300)
        return 'ANNUAL';
    if (diffDays >= 20)
        return 'MONTHLY';
    return null;
};
const resolveSubscriptionBillingTerm = (subscription) => {
    const metadata = toMetadataRecord(subscription.metadata);
    return (toBillingTerm(metadata.billingTerm)
        || inferBillingTermFromDurationDays(metadata.durationDays)
        || inferBillingTermFromPeriod(subscription.currentPeriodStart || null, subscription.currentPeriodEnd || null));
};
const resolveInvoiceBillingTerm = (invoice) => {
    const metadata = toMetadataRecord(invoice.metadata);
    return (toBillingTerm(metadata.billingTerm)
        || inferBillingTermFromDurationDays(metadata.durationDays)
        || inferBillingTermFromPeriod(invoice.periodStart || null, invoice.periodEnd || null)
        || (invoice.subscription
            ? resolveSubscriptionBillingTerm({
                metadata: invoice.subscription.metadata,
                currentPeriodStart: invoice.subscription.currentPeriodStart,
                currentPeriodEnd: invoice.subscription.currentPeriodEnd
            })
            : null));
};
const resolveInvoicePlanType = (invoice) => {
    const metadata = toMetadataRecord(invoice.metadata);
    return (toPlanType(metadata.planType)
        || invoice.subscription?.planType
        || invoice.billingAccount.organization.planType
        || client_2.PlanType.BASIC);
};
const resolveLegacyPlanMrrContribution = (planType, billingTerm) => {
    if (!billingTerm)
        return null;
    if (planType !== client_2.PlanType.BASIC && planType !== client_2.PlanType.PRO && planType !== client_2.PlanType.BUSINESS) {
        return null;
    }
    const billedAmount = (0, billing_pricing_service_1.resolvePlanChargeAmountCents)({
        planType,
        billingTerm
    });
    return billingTerm === 'ANNUAL' ? Math.round(billedAmount / 12) : billedAmount;
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
const mapBillingInvoiceRow = (invoice) => {
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
const getBillingOverview = async () => {
    const now = new Date();
    const day30Ms = 30 * 24 * 60 * 60 * 1000;
    const day60Ms = 60 * 24 * 60 * 60 * 1000;
    const day90Ms = 90 * 24 * 60 * 60 * 1000;
    const day7Ago = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const day30Ago = new Date(now.getTime() - day30Ms);
    const [activeSubscriptions, paidInvoices, failedPaymentsCount, voidInvoicesCount] = await client_1.prisma.$transaction([
        client_1.prisma.subscription.findMany({
            where: {
                planType: { in: PAID_PLAN_TYPES },
                status: { in: [client_2.SubscriptionStatus.ACTIVE, client_2.SubscriptionStatus.TRIALING] }
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
        client_1.prisma.invoice.findMany({
            where: {
                status: client_2.InvoiceStatus.PAID,
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
        client_1.prisma.paymentAttempt.count({
            where: {
                status: client_2.PaymentAttemptStatus.FAILED,
                billingAccount: {
                    organization: {
                        planType: { in: PAID_PLAN_TYPES }
                    }
                }
            }
        }),
        client_1.prisma.invoice.count({
            where: {
                status: client_2.InvoiceStatus.VOID,
                billingAccount: {
                    organization: {
                        planType: { in: PAID_PLAN_TYPES }
                    }
                }
            }
        })
    ]);
    const activeSubscriptionOrganizationIds = Array.from(new Set(activeSubscriptions.map((subscription) => subscription.billingAccount.organizationId)));
    const legacyPaidOrganizations = await client_1.prisma.organization.findMany({
        where: {
            planType: { in: PAID_PLAN_TYPES },
            planStatus: client_2.PlanStatus.ACTIVE,
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
    const activeSubscriptionsByPlan = {
        BASIC: 0,
        PRO: 0,
        BUSINESS: 0,
        ENTERPRISE: 0
    };
    const activeSubscriptionsByBillingTerm = {
        MONTHLY: 0,
        ANNUAL: 0
    };
    let mrrCents = 0;
    let hasMrrData = false;
    const mrrCurrencies = new Set();
    const renewalsDue = { next30Days: 0, next60Days: 0, next90Days: 0 };
    for (const subscription of activeSubscriptions) {
        const plan = subscription.planType;
        if (plan === client_2.PlanType.BASIC || plan === client_2.PlanType.PRO || plan === client_2.PlanType.BUSINESS || plan === client_2.PlanType.ENTERPRISE) {
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
            if (diffMs <= day90Ms)
                renewalsDue.next90Days += 1;
            if (diffMs <= day60Ms)
                renewalsDue.next60Days += 1;
            if (diffMs <= day30Ms)
                renewalsDue.next30Days += 1;
        }
    }
    // Discovery note (backend/src/services/billing-admin.service.ts):
    // Legacy admin-created paid orgs could exist without Subscription/Invoice rows.
    // Include active paid Organization-plan rows so ENTERPRISE/BASIC/PRO/BUSINESS are visible in ACCOUNTS KPIs.
    for (const organization of legacyPaidOrganizations) {
        const plan = organization.planType;
        if (plan === client_2.PlanType.BASIC || plan === client_2.PlanType.PRO || plan === client_2.PlanType.BUSINESS || plan === client_2.PlanType.ENTERPRISE) {
            activeSubscriptionsByPlan[plan] += 1;
        }
        const billingTerm = inferBillingTermFromPeriod(organization.planStartAt || null, organization.planEndAt || null);
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
            if (diffMs <= day90Ms)
                renewalsDue.next90Days += 1;
            if (diffMs <= day60Ms)
                renewalsDue.next60Days += 1;
            if (diffMs <= day30Ms)
                renewalsDue.next30Days += 1;
        }
    }
    const firstPaidByOrg = new Map();
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
        if (firstPaidAt >= day30Ago)
            newPaidOrganizations30 += 1;
        if (firstPaidAt >= day7Ago)
            newPaidOrganizations7 += 1;
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
exports.getBillingOverview = getBillingOverview;
const listBillingSubscriptions = async (filters) => {
    const page = Math.max(1, Math.floor(filters.page || 1));
    const limit = Math.min(200, Math.max(1, Math.floor(filters.limit || 20)));
    const skip = (page - 1) * limit;
    const and = [
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
        const currentPeriodEnd = {};
        if (filters.startDate)
            currentPeriodEnd.gte = filters.startDate;
        if (filters.endDate)
            currentPeriodEnd.lte = filters.endDate;
        and.push({ currentPeriodEnd });
    }
    const subscriptions = await client_1.prisma.subscription.findMany({
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
    const subscriptionRows = subscriptions
        .map((subscription) => {
        const billingTerm = resolveSubscriptionBillingTerm(subscription);
        const lastInvoice = subscription.invoices[0];
        const mrrContributionCents = (subscription.amountCents !== null
            && subscription.amountCents !== undefined
            && billingTerm)
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
    const activeSubscriptionOrganizationIds = Array.from(new Set(subscriptions.map((subscription) => subscription.billingAccount.organization.id)));
    const shouldIncludeLegacyRows = !filters.status || filters.status === client_2.SubscriptionStatus.ACTIVE;
    const legacyOrganizations = shouldIncludeLegacyRows
        ? await client_1.prisma.organization.findMany({
            where: {
                planType: { in: PAID_PLAN_TYPES },
                planStatus: client_2.PlanStatus.ACTIVE,
                deletedAt: null,
                id: {
                    notIn: activeSubscriptionOrganizationIds
                },
                ...(filters.plan ? { planType: filters.plan } : {}),
                ...(filters.search
                    ? {
                        name: {
                            contains: filters.search,
                            mode: 'insensitive'
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
    const legacyRows = legacyOrganizations
        .map((organization) => {
        const billingTerm = inferBillingTermFromPeriod(organization.planStartAt || null, organization.planEndAt || null);
        const lastInvoice = organization.billingAccount?.invoices?.[0];
        const mrrContributionCents = resolveLegacyPlanMrrContribution(organization.planType, billingTerm);
        return {
            id: `ORG-PLAN-${organization.id}`,
            organization: {
                id: organization.id,
                name: organization.name
            },
            plan: organization.planType,
            billingTerm,
            status: client_2.SubscriptionStatus.ACTIVE,
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
        if (renewalA !== renewalB)
            return renewalB - renewalA;
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
exports.listBillingSubscriptions = listBillingSubscriptions;
const listBillingInvoices = async (filters) => {
    const page = Math.max(1, Math.floor(filters.page || 1));
    const limit = Math.min(200, Math.max(1, Math.floor(filters.limit || 20)));
    const skip = (page - 1) * limit;
    const and = [
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
    const dateFilter = {};
    if (filters.startDate)
        dateFilter.gte = filters.startDate;
    if (filters.endDate)
        dateFilter.lte = filters.endDate;
    if (!filters.startDate && !filters.endDate && filters.rangeDays) {
        dateFilter.gte = new Date(Date.now() - filters.rangeDays * 24 * 60 * 60 * 1000);
    }
    if (Object.keys(dateFilter).length > 0) {
        and.push({ createdAt: dateFilter });
    }
    const invoices = await client_1.prisma.invoice.findMany({
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
exports.listBillingInvoices = listBillingInvoices;
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
        dueAt: invoice.dueAt,
        paidAt: invoice.paidAt,
        periodStart,
        periodEnd,
        planName: planType,
        planType,
        billingGateway: invoice.billingAccount.gateway,
        billToCountryCode: invoice.billingAccount.organization.country?.code || null,
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
const buildInvoicePdfForDashboard = async (invoiceId) => {
    const invoice = await client_1.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: INVOICE_INCLUDE
    });
    if (!invoice) {
        throw new Error('Invoice not found');
    }
    const planType = resolveInvoicePlanType(invoice);
    const scope = planType === client_2.PlanType.ENTERPRISE ? 'ENTERPRISE' : 'ORG';
    return (0, exports.buildInvoicePdfForAdmin)(invoiceId, scope);
};
exports.buildInvoicePdfForDashboard = buildInvoicePdfForDashboard;
const updateBillingInvoice = async (invoiceId, input) => {
    const result = await client_1.prisma.$transaction(async (tx) => {
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
        const updatedMetadata = {
            ...existingMetadata
        };
        if (input.internalNote !== undefined) {
            updatedMetadata.internalNote = input.internalNote ?? null;
        }
        const updated = await tx.invoice.update({
            where: { id: invoiceId },
            data: {
                status: nextStatus,
                ...(input.internalNote !== undefined ? { metadata: updatedMetadata } : {})
            },
            include: INVOICE_INCLUDE
        });
        const plan = resolveInvoicePlanType(updated);
        const billingTerm = resolveInvoiceBillingTerm(updated);
        const invoiceNumber = updated.invoiceNumber || `INV-${updated.id.slice(0, 8).toUpperCase()}`;
        const logEntry = await auditService.logActionTx(tx, {
            adminId: input.actorId,
            actorRole: input.actorRole,
            action: client_3.AuditActionType.INVOICE_UPDATE,
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
exports.updateBillingInvoice = updateBillingInvoice;
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
