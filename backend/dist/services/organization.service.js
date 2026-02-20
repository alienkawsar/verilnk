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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkUpdateOrganizationPlan = exports.updateOrganizationPlan = exports.bulkUpdateOrganizationPriority = exports.updateOrganizationPriority = exports.deleteOrganizations = exports.permanentlyDeleteOrganization = exports.restoreOrganization = exports.softDeleteOrganization = exports.restrictOrganization = exports.deleteOrganization = exports.updateOrganization = exports.getPublicOrganizationSitemapEntries = exports.getPublicOrganization = exports.adminCreateOrganization = exports.signupOrganization = exports.getOrganizationById = exports.getAllOrganizations = exports.checkAndExpirePriorities = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const meilisearch_service_1 = require("./meilisearch.service");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const entitlement_service_1 = require("./entitlement.service");
const auditService = __importStar(require("./audit.service"));
const client_3 = require("@prisma/client");
const client_4 = require("@prisma/client");
const passwordPolicy_1 = require("../utils/passwordPolicy");
const enterprise_quota_service_1 = require("./enterprise-quota.service");
const billing_pricing_service_1 = require("./billing-pricing.service");
const organization_visibility_service_1 = require("./organization-visibility.service");
const checkAndExpirePriorities = async () => {
    // 1. Find expired priorities
    const expiredOrgs = await client_1.prisma.organization.findMany({
        where: {
            priorityExpiresAt: {
                lte: new Date()
            },
            deletedAt: null
        },
        select: { id: true, status: true }
    });
    if (expiredOrgs.length === 0)
        return;
    const ids = expiredOrgs.map(o => o.id);
    // 2. Downgrade to NORMAL and clear expiration
    await client_1.prisma.organization.updateMany({
        where: { id: { in: ids } },
        data: {
            priority: 'NORMAL',
            priorityExpiresAt: null
        }
    });
    // 3. Re-index affected Approved orgs in Meilisearch
    const approvedIds = expiredOrgs.filter(o => o.status === client_2.OrgStatus.APPROVED).map(o => o.id);
    if (approvedIds.length > 0) {
        for (const orgId of approvedIds) {
            await (0, meilisearch_service_1.reindexOrganizationSites)(orgId);
        }
    }
};
exports.checkAndExpirePriorities = checkAndExpirePriorities;
const runWithConcurrency = async (items, concurrency, worker) => {
    const maxConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
    let currentIndex = 0;
    const runners = Array.from({ length: maxConcurrency }, async () => {
        while (currentIndex < items.length) {
            const index = currentIndex;
            currentIndex += 1;
            await worker(items[index]);
        }
    });
    await Promise.all(runners);
};
const getAllOrganizations = async (filters = {}) => {
    // Lazy check for expired priorities before fetching
    await (0, exports.checkAndExpirePriorities)().catch(console.error); // Do not block if check fails, just log
    const { countryId, stateId, categoryId, status, type, priority, planType, deleted } = filters;
    const where = {};
    if (countryId)
        where.countryId = countryId;
    if (stateId)
        where.stateId = stateId;
    if (categoryId)
        where.categoryId = categoryId;
    if (status)
        where.status = status;
    if (type)
        where.type = type;
    if (priority)
        where.priority = priority;
    if (planType)
        where.planType = planType;
    if (deleted === 'only') {
        where.deletedAt = { not: null };
    }
    else if (deleted !== 'include') {
        where.deletedAt = null;
    }
    const organizations = await client_1.prisma.organization.findMany({
        where,
        include: {
            country: true,
            state: true,
            category: true,
            users: true,
            sites: true
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
    if (organizations.length === 0)
        return organizations;
    const organizationIds = organizations.map((organization) => organization.id);
    let quotaRows = [];
    try {
        quotaRows = await client_1.prisma.$queryRaw `
            SELECT
                "id",
                "enterpriseMaxWorkspaces",
                "enterpriseMaxLinkedOrgs",
                "enterpriseMaxApiKeys",
                "enterpriseMaxMembers"
            FROM "Organization"
            WHERE "id" IN (${client_2.Prisma.join(organizationIds)})
        `;
    }
    catch (error) {
        console.error('[Organizations] quota enrichment fallback:', {
            message: error?.message,
            code: error?.code
        });
    }
    const toNullableNumber = (value) => {
        if (value === null || value === undefined)
            return null;
        if (typeof value === 'number' && Number.isFinite(value))
            return value;
        if (typeof value === 'bigint')
            return Number(value);
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    };
    const quotaMap = new Map(quotaRows.map((row) => [
        row.id,
        {
            enterpriseMaxWorkspaces: toNullableNumber(row.enterpriseMaxWorkspaces),
            enterpriseMaxLinkedOrgs: toNullableNumber(row.enterpriseMaxLinkedOrgs),
            enterpriseMaxApiKeys: toNullableNumber(row.enterpriseMaxApiKeys),
            enterpriseMaxMembers: toNullableNumber(row.enterpriseMaxMembers)
        }
    ]));
    return organizations.map((organization) => ({
        ...organization,
        ...(quotaMap.get(organization.id) || {})
    }));
};
exports.getAllOrganizations = getAllOrganizations;
const getOrganizationById = async (id) => {
    return client_1.prisma.organization.findUnique({
        where: { id },
        include: {
            country: true,
            state: true,
            category: true,
            users: true,
            sites: true
        }
    });
};
exports.getOrganizationById = getOrganizationById;
const slugify = (value) => {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
};
const generateUniqueSlug = async (name) => {
    const base = slugify(name);
    let slug = base || `org-${Date.now()}`;
    let suffix = 1;
    while (true) {
        const existing = await client_1.prisma.organization.findUnique({ where: { slug } });
        if (!existing)
            return slug;
        slug = `${base}-${suffix}`;
        suffix += 1;
    }
};
const getEnterpriseLinkRequestModel = () => client_1.prisma.enterpriseOrgLinkRequest;
const activatePendingEnterpriseLinkIntents = async (organizationId, actorUserId) => {
    const linkRequestModel = getEnterpriseLinkRequestModel();
    if (!linkRequestModel) {
        return { activated: 0, requestIds: [], workspaceIds: [] };
    }
    const pendingIntents = await linkRequestModel.findMany({
        where: {
            organizationId,
            status: 'PENDING_APPROVAL',
            workspaceId: { not: null }
        },
        select: {
            id: true,
            workspaceId: true,
            requestedByUserId: true
        }
    });
    if (!Array.isArray(pendingIntents) || pendingIntents.length === 0) {
        return { activated: 0, requestIds: [], workspaceIds: [] };
    }
    return client_1.prisma.$transaction(async (tx) => {
        const txLinkRequestModel = tx.enterpriseOrgLinkRequest;
        let activated = 0;
        const requestIds = [];
        const workspaceIds = new Set();
        const now = new Date();
        for (const intent of pendingIntents) {
            if (!intent.workspaceId)
                continue;
            await tx.workspaceOrganization.upsert({
                where: {
                    workspaceId_organizationId: {
                        workspaceId: intent.workspaceId,
                        organizationId
                    }
                },
                create: {
                    workspaceId: intent.workspaceId,
                    organizationId,
                    linkedBy: intent.requestedByUserId || actorUserId || null
                },
                update: {}
            });
            await txLinkRequestModel.update({
                where: { id: intent.id },
                data: {
                    status: 'APPROVED',
                    decidedAt: now,
                    decisionByOrgUserId: actorUserId || null
                }
            });
            activated += 1;
            requestIds.push(intent.id);
            workspaceIds.add(intent.workspaceId);
        }
        return {
            activated,
            requestIds,
            workspaceIds: Array.from(workspaceIds)
        };
    }, {
        timeout: 10000,
        maxWait: 5000
    });
};
const denyPendingEnterpriseLinkIntents = async (organizationId, actorUserId) => {
    const linkRequestModel = getEnterpriseLinkRequestModel();
    if (!linkRequestModel)
        return { denied: 0 };
    const result = await linkRequestModel.updateMany({
        where: {
            organizationId,
            status: 'PENDING_APPROVAL'
        },
        data: {
            status: 'DENIED',
            decidedAt: new Date(),
            decisionByOrgUserId: actorUserId || null
        }
    });
    return { denied: Number(result?.count || 0) };
};
const signupOrganization = async (data) => {
    // 1. Check if email exists (User or Admin)
    const existingUser = await client_1.prisma.user.findUnique({ where: { email: data.email } });
    const existingAdmin = await client_1.prisma.admin.findUnique({ where: { email: data.email } });
    const existingOrgEmail = await client_1.prisma.organization.findUnique({ where: { email: data.email } });
    if (existingUser || existingAdmin || existingOrgEmail) {
        throw new Error('Email already in use');
    }
    // 2. Hash Password
    (0, passwordPolicy_1.assertStrongPassword)(data.password);
    const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
    // const userName = `${data.firstName} ${data.lastName}`; // Removed as per requirement
    const userName = data.orgName; // Use Org Name as fallback for User Name since First/Last are gone
    // 3. Transaction: Create Org, User, and Site (Pending)
    return await client_1.prisma.$transaction(async (tx) => {
        let categoryId = data.categoryId;
        if (!categoryId) {
            const defaultCat = await tx.category.findFirst({ orderBy: { sortOrder: 'asc' } });
            if (!defaultCat)
                throw new Error('No categories available to assign to organization');
            categoryId = defaultCat.id;
        }
        // Create Organization
        const org = await tx.organization.create({
            data: {
                name: data.orgName,
                slug: await generateUniqueSlug(data.orgName),
                email: data.email,
                website: data.website,
                phone: data.phone,
                address: data.address,
                countryId: data.countryId,
                stateId: data.stateId || null,
                categoryId,
                status: client_2.OrgStatus.PENDING,
                type: data.type, // Enum matches
                about: data.about || null,
                logo: data.logo || null
            }
        });
        // Create User linked to Org
        const user = await tx.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                // firstName & lastName removed, will default to "" via schema
                name: userName,
                country: data.countryId, // Store ID as string since schema uses String?
                organizationId: org.id
            }
        });
        // Create Site (Pending Review)
        // Ensure website/url is unique in Site table too
        // Note: Site.url is unique. If organization website already exists in Site table, this will fail.
        // We might want to check this before transaction start, or let it fail.
        // We need a category for the site. If optional in signup, we might need a default or use the one provided.
        // If categoryId is missing, we might fail or need a fallback. 
        // The prompt says "Category (optional)". But Site model requires categoryId.
        // Logic: If not provided, we must handle it. 
        // For now, let's assume if it's optional in UI, backend might need to enforce it OR Site model allows nullable?
        // Checking schema: categoryId String (Required).
        // Solution: We need to ensure categoryId is provided OR fetch a default "Uncategorized" category.
        // For MVP, if categoryId is missing, we'll try to find any category or fail.
        // Let's assume the frontend forces selection or we pick the first one.
        // categoryId is guaranteed above; reuse for site creation
        const site = await tx.site.create({
            data: {
                name: data.orgName,
                url: data.website,
                countryId: data.countryId,
                stateId: data.stateId || null,
                categoryId: categoryId,
                status: 'PENDING', // VerificationStatus.PENDING
                organizationId: org.id
            }
        });
        return { user, org, site };
    }, {
        timeout: 10000,
        maxWait: 5000
    });
};
exports.signupOrganization = signupOrganization;
const adminCreateOrganization = async (data, auditContext) => {
    const existingUser = await client_1.prisma.user.findUnique({ where: { email: data.email } });
    const existingAdmin = await client_1.prisma.admin.findUnique({ where: { email: data.email } });
    const existingOrgEmail = await client_1.prisma.organization.findUnique({ where: { email: data.email } });
    if (existingUser || existingAdmin || existingOrgEmail) {
        throw new Error('Email already in use');
    }
    (0, passwordPolicy_1.assertStrongPassword)(data.password);
    const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
    const slug = await generateUniqueSlug(data.name);
    const planType = data.planType ?? client_2.PlanType.FREE;
    let planStatus = data.planStatus ?? client_2.PlanStatus.ACTIVE;
    const now = new Date();
    const billingTerm = (0, billing_pricing_service_1.resolveBillingTerm)(data.billingTerm || null, data.durationDays);
    const shouldProvisionPaidPlan = planType !== client_2.PlanType.FREE && planStatus === client_2.PlanStatus.ACTIVE;
    const normalizedAmountCents = shouldProvisionPaidPlan
        ? (0, billing_pricing_service_1.resolvePlanChargeAmountCents)({
            planType,
            billingTerm,
            requestedAmountCents: data.amountCents
        })
        : null;
    let planStartAt = now;
    let planEndAt = null;
    let supportTier = PLAN_SUPPORT_TIER[planType] ?? client_2.SupportTier.NONE;
    let priorityOverride = null;
    const enterpriseQuotaValues = (0, enterprise_quota_service_1.normalizeEnterpriseQuotaLimits)({
        enterpriseMaxWorkspaces: data.enterpriseMaxWorkspaces,
        enterpriseMaxLinkedOrgs: data.enterpriseMaxLinkedOrgs,
        enterpriseMaxApiKeys: data.enterpriseMaxApiKeys,
        enterpriseMaxMembers: data.enterpriseMaxMembers
    });
    if (planType === client_2.PlanType.FREE) {
        planStatus = client_2.PlanStatus.ACTIVE;
        supportTier = client_2.SupportTier.NONE;
        planEndAt = null;
        priorityOverride = null;
    }
    else {
        if (data.durationDays && data.durationDays > 0) {
            planEndAt = new Date(now);
            planEndAt.setDate(planEndAt.getDate() + data.durationDays);
        }
        if (planType === client_2.PlanType.ENTERPRISE) {
            priorityOverride = data.priorityOverride ?? null;
        }
    }
    const result = await client_1.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
            data: {
                name: data.name,
                slug,
                email: data.email,
                website: data.website,
                phone: data.phone,
                address: data.address,
                countryId: data.countryId,
                stateId: data.stateId || null,
                categoryId: data.categoryId,
                status: client_2.OrgStatus.APPROVED,
                // Discovery note (backend/src/services/organization.service.ts):
                // Priority was hardcoded to NORMAL here, so admin-selected priority never persisted on create.
                priority: data.priority ?? 'NORMAL',
                type: data.type || 'PUBLIC',
                about: data.about || null,
                logo: data.logo || null,
                planType,
                planStatus,
                planStartAt,
                planEndAt,
                supportTier,
                priorityOverride
            }
        });
        if (planType === client_2.PlanType.ENTERPRISE) {
            await tx.$executeRaw `
                UPDATE "Organization"
                SET
                    "enterpriseMaxWorkspaces" = ${enterpriseQuotaValues.maxWorkspaces},
                    "enterpriseMaxLinkedOrgs" = ${enterpriseQuotaValues.maxLinkedOrgs},
                    "enterpriseMaxApiKeys" = ${enterpriseQuotaValues.maxApiKeys},
                    "enterpriseMaxMembers" = ${enterpriseQuotaValues.maxMembers}
                WHERE "id" = ${org.id}
            `;
        }
        const user = await tx.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                name: data.name,
                country: data.countryId,
                organizationId: org.id,
                mustChangePassword: false
            }
        });
        const site = await tx.site.create({
            data: {
                name: data.name,
                url: data.website,
                countryId: data.countryId,
                stateId: data.stateId || null,
                categoryId: data.categoryId,
                status: client_4.VerificationStatus.SUCCESS,
                organizationId: org.id
            }
        });
        if (auditContext) {
            await auditService.logActionTx(tx, {
                adminId: auditContext.adminId,
                actorRole: auditContext.role,
                action: client_3.AuditActionType.CREATE,
                entity: 'Organization',
                targetId: org.id,
                details: `ORG_CREATED_BY_ADMIN orgId=${org.id} orgName="${org.name}"`,
                snapshot: { org, user, site },
                ipAddress: auditContext.ip,
                userAgent: auditContext.userAgent
            });
        }
        return { org, user, site };
    }, {
        timeout: 10000,
        maxWait: 5000
    });
    if (result.org.status === client_2.OrgStatus.APPROVED) {
        const fullSite = await client_1.prisma.site.findUnique({
            where: { id: result.site.id },
            include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
        });
        if (fullSite) {
            await (0, meilisearch_service_1.indexSite)(fullSite);
        }
    }
    let billingProvision = null;
    // Discovery note (backend/src/services/organization.service.ts):
    // Admin org creation previously only set Organization.planType/planStatus and skipped billing models.
    // ACCOUNTS dashboard reads Subscription/Invoice rows, so paid orgs without those rows were invisible.
    if (shouldProvisionPaidPlan) {
        const billingService = await Promise.resolve().then(() => __importStar(require('./billing.service')));
        const billingResult = await billingService.provisionOrganizationPlanFromCheckout({
            organizationId: result.org.id,
            planType,
            billingTerm,
            amountCents: normalizedAmountCents || undefined,
            durationDays: data.durationDays,
            billingEmail: result.org.email,
            billingName: result.org.name,
            idempotencyKey: `admin-org-create:${result.org.id}:${planType}:${billingTerm}`
        });
        const invoice = billingResult?.invoice || null;
        const subscription = billingResult?.subscription || null;
        billingProvision = {
            invoiceId: invoice?.id || null,
            invoiceNumber: invoice?.invoiceNumber || null,
            subscriptionId: subscription?.id || null,
            amountCents: typeof billingResult?.amountCents === 'number' ? billingResult.amountCents : normalizedAmountCents,
            billingTerm
        };
        if (auditContext) {
            await auditService.logAction({
                adminId: auditContext.adminId,
                actorRole: auditContext.role,
                action: client_3.AuditActionType.OTHER,
                entity: 'OrganizationBilling',
                targetId: result.org.id,
                details: `ORG_CREATED_WITH_PLAN orgId=${result.org.id} plan=${planType} billingTerm=${billingTerm} amountCents=${billingProvision.amountCents || 0}`,
                snapshot: {
                    orgId: result.org.id,
                    plan: planType,
                    billingTerm,
                    amount: billingProvision.amountCents,
                    invoiceNumber: billingProvision.invoiceNumber,
                    invoiceId: billingProvision.invoiceId,
                    subscriptionId: billingProvision.subscriptionId
                },
                ipAddress: auditContext.ip,
                userAgent: auditContext.userAgent
            });
        }
    }
    return {
        ...result,
        billingProvision
    };
};
exports.adminCreateOrganization = adminCreateOrganization;
// Public Profile (Sanitized)
const getPublicOrganization = async (id) => {
    const org = await client_1.prisma.organization.findUnique({
        where: { id },
        include: {
            country: true,
            state: true,
            category: true,
        },
    });
    if (!org)
        return null;
    if (org.deletedAt)
        return null;
    const { entitlements, organization, wasUpdated } = await (0, entitlement_service_1.resolveOrganizationEntitlements)(org);
    const currentOrg = wasUpdated ? { ...org, ...organization } : org;
    const effectiveRestricted = await (0, organization_visibility_service_1.isOrganizationEffectivelyRestricted)(currentOrg.id);
    if (effectiveRestricted) {
        return {
            id: currentOrg.id,
            name: currentOrg.name,
            website: currentOrg.website,
            address: currentOrg.address,
            phone: currentOrg.phone,
            country: currentOrg.country,
            state: currentOrg.state,
            category: currentOrg.category,
            isVerified: false,
            createdAt: currentOrg.createdAt,
            type: currentOrg.type,
            about: currentOrg.about,
            logo: currentOrg.logo,
            isRestricted: true,
            effectiveRestricted: true
        };
    }
    if (!entitlements.canAccessOrgPage)
        return null;
    return {
        id: currentOrg.id,
        name: currentOrg.name,
        website: currentOrg.website,
        address: currentOrg.address,
        phone: currentOrg.phone, // Maybe hide? Prompt says "Office address", implies phone might be public too.
        country: currentOrg.country,
        state: currentOrg.state,
        category: currentOrg.category,
        isVerified: entitlements.canShowBadge,
        createdAt: currentOrg.createdAt,
        type: currentOrg.type,
        about: currentOrg.about,
        logo: currentOrg.logo,
        isRestricted: false,
        effectiveRestricted: false
    };
};
exports.getPublicOrganization = getPublicOrganization;
const getPublicOrganizationSitemapEntries = async () => {
    const now = new Date();
    const effectivelyRestrictedOrgIds = await (0, organization_visibility_service_1.getEffectivelyRestrictedOrganizationIds)();
    const orgs = await client_1.prisma.organization.findMany({
        where: {
            status: client_2.OrgStatus.APPROVED,
            isRestricted: false,
            planType: { not: client_2.PlanType.FREE },
            planStatus: client_2.PlanStatus.ACTIVE,
            deletedAt: null,
            ...(effectivelyRestrictedOrgIds.length > 0
                ? {
                    id: {
                        notIn: effectivelyRestrictedOrgIds
                    }
                }
                : {}),
            OR: [
                { planEndAt: null },
                { planEndAt: { gt: now } }
            ]
        },
        select: {
            id: true,
            updatedAt: true,
            name: true,
            country: {
                select: {
                    code: true,
                    name: true
                }
            }
        }
    });
    return orgs.map((org) => ({
        id: org.id,
        updatedAt: org.updatedAt,
        name: org.name,
        countryCode: org.country?.code,
        countryName: org.country?.name
    }));
};
exports.getPublicOrganizationSitemapEntries = getPublicOrganizationSitemapEntries;
const updateOrganization = async (id, data, auditContext) => {
    // Check if website is changing
    if (data.website) {
        const currentOrg = await client_1.prisma.organization.findUnique({ where: { id } });
        if (currentOrg && currentOrg.website !== data.website) {
            // Website changed, reset status to PENDING
            data.status = client_2.OrgStatus.PENDING;
            // Also need to update the Site URL and Status
            // We can do this in the transaction below if we unify logic
        }
    }
    // Existing update logic (enhanced)
    const result = await client_1.prisma.$transaction(async (tx) => {
        // Update Org
        const org = await tx.organization.update({
            where: { id },
            data
        });
        // Cascade to Site (Status)
        if (data.status) {
            const statusMap = {
                [client_2.OrgStatus.APPROVED]: 'SUCCESS',
                [client_2.OrgStatus.REJECTED]: 'FAILED', // or REJECTED if enum matches
                [client_2.OrgStatus.PENDING]: 'PENDING'
            };
            const siteStatus = statusMap[data.status];
            if (siteStatus) {
                await tx.site.updateMany({
                    where: { organizationId: id },
                    data: { status: siteStatus }
                });
            }
        }
        // Cascade Structural Changes (Country, State, Category, Name)
        const siteUpdates = {};
        if (data.countryId)
            siteUpdates.countryId = data.countryId;
        if (data.stateId !== undefined)
            siteUpdates.stateId = data.stateId;
        if (data.categoryId)
            siteUpdates.categoryId = data.categoryId;
        if (data.name)
            siteUpdates.name = data.name;
        if (Object.keys(siteUpdates).length > 0) {
            await tx.site.updateMany({
                where: { organizationId: id },
                data: siteUpdates
            });
        }
        // If website changed, update Site URL as well
        // If website changed, update Site URL as well
        if (data.website) {
            await tx.site.updateMany({
                where: { organizationId: id },
                data: { url: data.website }
            });
        }
        return org;
    }, {
        timeout: 10000,
        maxWait: 5000
    });
    let activatedLinkIntents = { activated: 0, requestIds: [], workspaceIds: [] };
    let deniedLinkIntents = { denied: 0 };
    if (data.status === client_2.OrgStatus.APPROVED) {
        activatedLinkIntents = await activatePendingEnterpriseLinkIntents(id, auditContext?.adminId);
    }
    else if (data.status === client_2.OrgStatus.REJECTED) {
        deniedLinkIntents = await denyPendingEnterpriseLinkIntents(id, auditContext?.adminId);
    }
    if (auditContext && activatedLinkIntents.activated > 0) {
        await auditService.logAction({
            adminId: auditContext.adminId,
            actorRole: auditContext.role,
            action: client_3.AuditActionType.UPDATE,
            entity: 'EnterpriseOrgLinkRequest',
            targetId: id,
            details: `Activated ${activatedLinkIntents.activated} enterprise link intent(s) after organization approval`,
            snapshot: {
                organizationId: id,
                requestIds: activatedLinkIntents.requestIds,
                workspaceIds: activatedLinkIntents.workspaceIds
            },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    if (auditContext && deniedLinkIntents.denied > 0) {
        await auditService.logAction({
            adminId: auditContext.adminId,
            actorRole: auditContext.role,
            action: client_3.AuditActionType.UPDATE,
            entity: 'EnterpriseOrgLinkRequest',
            targetId: id,
            details: `Denied ${deniedLinkIntents.denied} enterprise link intent(s) after organization rejection`,
            snapshot: { organizationId: id, denied: deniedLinkIntents.denied },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    // Sync with Meilisearch
    if (data.status) {
        if (data.status === client_2.OrgStatus.APPROVED) {
            const sites = await client_1.prisma.site.findMany({
                where: { organizationId: id },
                include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
            });
            for (const site of sites) {
                await (0, meilisearch_service_1.indexSite)(site);
            }
        }
        else {
            const sites = await client_1.prisma.site.findMany({
                where: { organizationId: id },
                select: { id: true }
            });
            for (const site of sites) {
                await (0, meilisearch_service_1.removeSiteFromIndex)(site.id);
            }
        }
    }
    else {
        const needsReindex = Boolean(data.name ||
            data.countryId ||
            data.categoryId ||
            data.website ||
            data.logo ||
            data.about ||
            data.priority ||
            data.stateId !== undefined);
        if (needsReindex) {
            const org = await client_1.prisma.organization.findUnique({ where: { id } });
            if (org?.status === client_2.OrgStatus.APPROVED) {
                await (0, meilisearch_service_1.reindexOrganizationSites)(id);
            }
        }
    }
    return result;
};
exports.updateOrganization = updateOrganization;
const deleteOrganization = async (id, auditContext, deleteReason) => {
    return (0, exports.softDeleteOrganization)(id, auditContext, deleteReason);
};
exports.deleteOrganization = deleteOrganization;
const restrictOrganization = async (id, restricted) => {
    const updated = await client_1.prisma.organization.update({
        where: { id },
        data: { isRestricted: restricted }
    });
    if (updated.planType === client_2.PlanType.ENTERPRISE) {
        await (0, meilisearch_service_1.reindexEnterpriseManagedSites)(id);
    }
    else {
        await (0, meilisearch_service_1.reindexOrganizationSites)(id);
    }
    return updated;
};
exports.restrictOrganization = restrictOrganization;
const getDeleteRecoveryDays = () => {
    const days = Number(process.env.ORG_DELETE_RECOVERY_DAYS || 7);
    return Number.isFinite(days) && days > 0 ? days : 7;
};
const canRestoreOrg = (deletedAt) => {
    if (!deletedAt)
        return false;
    const windowDays = getDeleteRecoveryDays();
    const limit = new Date(deletedAt);
    limit.setDate(limit.getDate() + windowDays);
    return new Date() <= limit;
};
const softDeleteOrganization = async (id, auditContext, deleteReason) => {
    const now = new Date();
    const sitesToRemove = await client_1.prisma.site.findMany({
        where: { organizationId: id },
        select: { id: true }
    });
    const result = await client_1.prisma.$transaction(async (tx) => {
        const existing = await tx.organization.findUnique({ where: { id } });
        if (!existing)
            throw new Error('Organization not found');
        if (existing.deletedAt)
            return existing;
        const updated = await tx.organization.update({
            where: { id },
            data: {
                deletedAt: now,
                deletedBy: auditContext?.adminId,
                deleteReason: deleteReason || null,
                priority: 'LOW',
                priorityExpiresAt: null
            }
        });
        await tx.site.updateMany({
            where: { organizationId: id },
            data: { deletedAt: now }
        });
        await tx.orgAnalytics.updateMany({
            where: { organizationId: id },
            data: { deletedAt: now }
        });
        const siteIds = await tx.site.findMany({ where: { organizationId: id }, select: { id: true } });
        if (siteIds.length > 0) {
            await tx.report.updateMany({
                where: { siteId: { in: siteIds.map(s => s.id) } },
                data: { deletedAt: now }
            });
        }
        if (auditContext) {
            await auditService.logActionTx(tx, {
                adminId: auditContext.adminId,
                actorRole: auditContext.role,
                action: client_3.AuditActionType.DELETE,
                entity: 'Organization',
                targetId: id,
                details: deleteReason ? `Soft deleted organization: ${deleteReason}` : 'Soft deleted organization',
                snapshot: { before: existing, after: updated },
                ipAddress: auditContext.ip,
                userAgent: auditContext.userAgent
            });
        }
        return updated;
    }, {
        timeout: 10000,
        maxWait: 5000
    });
    for (const site of sitesToRemove) {
        await (0, meilisearch_service_1.removeSiteFromIndex)(site.id);
    }
    return result;
};
exports.softDeleteOrganization = softDeleteOrganization;
const restoreOrganization = async (id, auditContext) => {
    const org = await client_1.prisma.organization.findUnique({ where: { id } });
    if (!org || !org.deletedAt)
        throw new Error('Organization not found or not deleted');
    if (!canRestoreOrg(org.deletedAt))
        throw new Error('Restore window expired');
    const restored = await client_1.prisma.$transaction(async (tx) => {
        const before = await tx.organization.findUnique({ where: { id } });
        if (!before)
            throw new Error('Organization not found');
        const updated = await tx.organization.update({
            where: { id },
            data: {
                deletedAt: null,
                deletedBy: null,
                deleteReason: null
            }
        });
        await tx.site.updateMany({
            where: { organizationId: id },
            data: { deletedAt: null }
        });
        await tx.orgAnalytics.updateMany({
            where: { organizationId: id },
            data: { deletedAt: null }
        });
        const siteIds = await tx.site.findMany({ where: { organizationId: id }, select: { id: true } });
        if (siteIds.length > 0) {
            await tx.report.updateMany({
                where: { siteId: { in: siteIds.map(s => s.id) } },
                data: { deletedAt: null }
            });
        }
        if (auditContext) {
            await auditService.logActionTx(tx, {
                adminId: auditContext.adminId,
                actorRole: auditContext.role,
                action: client_3.AuditActionType.UPDATE,
                entity: 'Organization',
                targetId: id,
                details: 'Restored organization',
                snapshot: { before, after: updated },
                ipAddress: auditContext.ip,
                userAgent: auditContext.userAgent
            });
        }
        return updated;
    }, {
        timeout: 10000,
        maxWait: 5000
    });
    if (restored.status === client_2.OrgStatus.APPROVED) {
        const sites = await client_1.prisma.site.findMany({
            where: { organizationId: id, status: 'SUCCESS' },
            include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
        });
        for (const site of sites) {
            await (0, meilisearch_service_1.indexSite)(site);
        }
    }
    return restored;
};
exports.restoreOrganization = restoreOrganization;
const permanentlyDeleteOrganization = async (id, auditContext) => {
    const org = await client_1.prisma.organization.findUnique({ where: { id } });
    if (!org || !org.deletedAt)
        throw new Error('Organization not found or not deleted');
    if (canRestoreOrg(org.deletedAt))
        throw new Error('Restore window not expired');
    const sitesToRemove = await client_1.prisma.site.findMany({
        where: { organizationId: id },
        select: { id: true }
    });
    const result = await client_1.prisma.$transaction(async (tx) => {
        const before = await tx.organization.findUnique({ where: { id } });
        if (!before)
            throw new Error('Organization not found');
        await tx.orgAnalytics.deleteMany({ where: { organizationId: id } });
        await tx.changeRequest.deleteMany({ where: { organizationId: id } });
        const sites = await tx.site.findMany({ where: { organizationId: id }, select: { id: true } });
        const siteIds = sites.map(s => s.id);
        if (siteIds.length > 0) {
            await tx.verificationLog.deleteMany({ where: { siteId: { in: siteIds } } });
            await tx.report.deleteMany({ where: { siteId: { in: siteIds } } });
            await tx.site.deleteMany({ where: { organizationId: id } });
        }
        const users = await tx.user.findMany({ where: { organizationId: id }, select: { id: true } });
        const userIds = users.map(u => u.id);
        if (userIds.length > 0) {
            await tx.report.deleteMany({ where: { userId: { in: userIds } } });
            await tx.changeRequest.deleteMany({ where: { requesterId: { in: userIds } } });
            await tx.user.deleteMany({ where: { organizationId: id } });
        }
        const deleted = await tx.organization.delete({ where: { id } });
        if (auditContext) {
            await auditService.logActionTx(tx, {
                adminId: auditContext.adminId,
                actorRole: auditContext.role,
                action: client_3.AuditActionType.DELETE,
                entity: 'Organization',
                targetId: id,
                details: 'Permanently deleted organization',
                snapshot: { before, after: null },
                ipAddress: auditContext.ip,
                userAgent: auditContext.userAgent
            });
        }
        return deleted;
    }, {
        timeout: 10000,
        maxWait: 5000
    });
    for (const site of sitesToRemove) {
        await (0, meilisearch_service_1.removeSiteFromIndex)(site.id);
    }
    return result;
};
exports.permanentlyDeleteOrganization = permanentlyDeleteOrganization;
const deleteOrganizations = async (ids, auditContext, deleteReason) => {
    const now = new Date();
    const orgs = await client_1.prisma.organization.findMany({
        where: { id: { in: ids } }
    });
    if (orgs.length !== ids.length) {
        throw new Error('One or more organizations not found');
    }
    const orgMap = new Map(orgs.map(o => [o.id, o]));
    const sitesToRemove = await client_1.prisma.site.findMany({
        where: { organizationId: { in: ids } },
        select: { id: true, organizationId: true }
    });
    await client_1.prisma.$transaction(async (tx) => {
        for (const id of ids) {
            const existing = orgMap.get(id);
            if (!existing) {
                throw new Error('Organization not found');
            }
            if (existing.deletedAt) {
                continue;
            }
            const updated = await tx.organization.update({
                where: { id },
                data: {
                    deletedAt: now,
                    deletedBy: auditContext?.adminId,
                    deleteReason: deleteReason || null,
                    priority: 'LOW',
                    priorityExpiresAt: null
                }
            });
            await tx.site.updateMany({
                where: { organizationId: id },
                data: { deletedAt: now }
            });
            await tx.orgAnalytics.updateMany({
                where: { organizationId: id },
                data: { deletedAt: now }
            });
            const siteIds = await tx.site.findMany({ where: { organizationId: id }, select: { id: true } });
            if (siteIds.length > 0) {
                await tx.report.updateMany({
                    where: { siteId: { in: siteIds.map(s => s.id) } },
                    data: { deletedAt: now }
                });
            }
            if (auditContext) {
                await auditService.logActionTx(tx, {
                    adminId: auditContext.adminId,
                    actorRole: auditContext.role,
                    action: client_3.AuditActionType.DELETE,
                    entity: 'Organization',
                    targetId: id,
                    details: deleteReason ? `Soft deleted organization: ${deleteReason}` : 'Soft deleted organization',
                    snapshot: { before: existing, after: updated },
                    ipAddress: auditContext.ip,
                    userAgent: auditContext.userAgent
                });
            }
        }
    }, {
        timeout: 10000,
        maxWait: 5000
    });
    for (const site of sitesToRemove) {
        await (0, meilisearch_service_1.removeSiteFromIndex)(site.id);
    }
    return { deleted: ids, errors: [] };
};
exports.deleteOrganizations = deleteOrganizations;
const updateOrganizationPriority = async (id, priority, durationDays) => {
    let expiresAt = null;
    if (durationDays && durationDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);
    }
    const org = await client_1.prisma.organization.update({
        where: { id },
        data: {
            priority: priority,
            priorityExpiresAt: expiresAt
        }
    });
    // Sync with Meilisearch for affected org sites to update orgPriorityRank instantly.
    if (org.status === client_2.OrgStatus.APPROVED) {
        await (0, meilisearch_service_1.reindexOrganizationSites)(id);
    }
    return org;
};
exports.updateOrganizationPriority = updateOrganizationPriority;
const bulkUpdateOrganizationPriority = async (ids, priority, durationDays) => {
    let expiresAt = null;
    if (durationDays && durationDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);
    }
    // 1. Update in DB (transaction)
    const result = await client_1.prisma.$transaction(async (tx) => {
        return tx.organization.updateMany({
            where: { id: { in: ids } },
            data: {
                priority: priority,
                priorityExpiresAt: expiresAt
            }
        });
    }, {
        timeout: 10000,
        maxWait: 5000
    });
    // 2. Re-index only affected approved orgs with controlled concurrency.
    const approvedOrgs = await client_1.prisma.organization.findMany({
        where: { id: { in: ids }, status: client_2.OrgStatus.APPROVED },
        select: { id: true }
    });
    const reindexFailures = [];
    await runWithConcurrency(approvedOrgs.map((org) => org.id), 4, async (orgId) => {
        try {
            await (0, meilisearch_service_1.reindexOrganizationSites)(orgId);
        }
        catch (error) {
            reindexFailures.push({
                orgId,
                message: error?.message || 'Failed to reindex organization sites'
            });
        }
    });
    return {
        ...result,
        reindex: {
            attempted: approvedOrgs.length,
            failed: reindexFailures.length,
            failures: reindexFailures
        }
    };
};
exports.bulkUpdateOrganizationPriority = bulkUpdateOrganizationPriority;
const PLAN_SUPPORT_TIER = {
    FREE: 'NONE',
    BASIC: 'EMAIL',
    PRO: 'CHAT',
    BUSINESS: 'INSTANT',
    ENTERPRISE: 'DEDICATED'
};
const mapPriorityOverrideValue = (value) => {
    if (value === null || value === undefined)
        return null;
    return value;
};
const getOrganizationEnterpriseQuotaColumns = async (organizationId) => {
    const rows = await client_1.prisma.$queryRaw `
        SELECT
            "enterpriseMaxWorkspaces",
            "enterpriseMaxLinkedOrgs",
            "enterpriseMaxApiKeys",
            "enterpriseMaxMembers"
        FROM "Organization"
        WHERE "id" = ${organizationId}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
        return {
            enterpriseMaxWorkspaces: null,
            enterpriseMaxLinkedOrgs: null,
            enterpriseMaxApiKeys: null,
            enterpriseMaxMembers: null
        };
    }
    const toNullableNumber = (value) => {
        if (value === null || value === undefined)
            return null;
        if (typeof value === 'number' && Number.isFinite(value))
            return value;
        if (typeof value === 'bigint')
            return Number(value);
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    };
    return {
        enterpriseMaxWorkspaces: toNullableNumber(row.enterpriseMaxWorkspaces),
        enterpriseMaxLinkedOrgs: toNullableNumber(row.enterpriseMaxLinkedOrgs),
        enterpriseMaxApiKeys: toNullableNumber(row.enterpriseMaxApiKeys),
        enterpriseMaxMembers: toNullableNumber(row.enterpriseMaxMembers)
    };
};
const persistOrganizationEnterpriseQuotas = async (organizationId, quotas) => {
    await client_1.prisma.$executeRaw `
        UPDATE "Organization"
        SET
            "enterpriseMaxWorkspaces" = ${quotas.maxWorkspaces},
            "enterpriseMaxLinkedOrgs" = ${quotas.maxLinkedOrgs},
            "enterpriseMaxApiKeys" = ${quotas.maxApiKeys},
            "enterpriseMaxMembers" = ${quotas.maxMembers}
        WHERE "id" = ${organizationId}
    `;
};
const ENTERPRISE_LINK_INTENT_TYPE = {
    CREATE_UNDER_ENTERPRISE: 'CREATE_UNDER_ENTERPRISE'
};
const syncManagedEnterpriseOrganizationExpiry = async (enterpriseId, planEndAt) => {
    const linkRequestModel = getEnterpriseLinkRequestModel();
    if (!linkRequestModel)
        return 0;
    const intents = (await linkRequestModel.findMany({
        where: {
            enterpriseId,
            intentType: ENTERPRISE_LINK_INTENT_TYPE.CREATE_UNDER_ENTERPRISE,
            status: { in: ['PENDING_APPROVAL', 'APPROVED'] }
        },
        select: { organizationId: true }
    }));
    const managedOrgIds = Array.from(new Set(intents
        .map((intent) => intent.organizationId)
        .filter((organizationId) => Boolean(organizationId)))).filter((organizationId) => organizationId !== enterpriseId);
    if (managedOrgIds.length === 0)
        return 0;
    const result = await client_1.prisma.organization.updateMany({
        where: {
            id: { in: managedOrgIds },
            deletedAt: null
        },
        data: {
            planEndAt
        }
    });
    return Number(result?.count || 0);
};
const updateOrganizationPlan = async (id, data, auditContext) => {
    const org = await client_1.prisma.organization.findUnique({ where: { id } });
    if (!org)
        throw new Error('Organization not found');
    const existingQuotas = await getOrganizationEnterpriseQuotaColumns(id);
    const now = new Date();
    const updateData = {
        planType: data.planType,
        planStatus: data.planStatus,
        supportTier: PLAN_SUPPORT_TIER[data.planType] ?? client_2.SupportTier.NONE
    };
    if (data.durationDays !== undefined) {
        if (data.durationDays && data.durationDays > 0) {
            const endAt = new Date(now);
            endAt.setDate(endAt.getDate() + data.durationDays);
            updateData.planStartAt = now;
            updateData.planEndAt = endAt;
        }
        else {
            updateData.planStartAt = now;
            updateData.planEndAt = null;
        }
    }
    let enterpriseQuotaValues = null;
    if (data.planType === client_2.PlanType.ENTERPRISE) {
        updateData.priorityOverride = mapPriorityOverrideValue(data.priorityOverride);
        enterpriseQuotaValues = (0, enterprise_quota_service_1.normalizeEnterpriseQuotaLimits)({
            enterpriseMaxWorkspaces: data.enterpriseMaxWorkspaces ?? existingQuotas.enterpriseMaxWorkspaces,
            enterpriseMaxLinkedOrgs: data.enterpriseMaxLinkedOrgs ?? existingQuotas.enterpriseMaxLinkedOrgs,
            enterpriseMaxApiKeys: data.enterpriseMaxApiKeys ?? existingQuotas.enterpriseMaxApiKeys,
            enterpriseMaxMembers: data.enterpriseMaxMembers ?? existingQuotas.enterpriseMaxMembers
        });
    }
    else {
        updateData.priorityOverride = null;
    }
    if (data.planType === client_2.PlanType.FREE) {
        updateData.planStatus = client_2.PlanStatus.ACTIVE;
        updateData.supportTier = client_2.SupportTier.NONE;
        updateData.priorityOverride = null;
        updateData.planEndAt = null;
    }
    const updated = await client_1.prisma.organization.update({
        where: { id },
        data: updateData
    });
    if (updated.planType === client_2.PlanType.ENTERPRISE && enterpriseQuotaValues) {
        await persistOrganizationEnterpriseQuotas(updated.id, enterpriseQuotaValues);
    }
    const shouldSyncManagedOrgExpiry = updated.planType === client_2.PlanType.ENTERPRISE &&
        Object.prototype.hasOwnProperty.call(updateData, 'planEndAt');
    let syncedManagedOrganizations = 0;
    if (shouldSyncManagedOrgExpiry) {
        syncedManagedOrganizations = await syncManagedEnterpriseOrganizationExpiry(updated.id, updated.planEndAt);
    }
    if (updated.status === client_2.OrgStatus.APPROVED) {
        const sites = await client_1.prisma.site.findMany({
            where: { organizationId: id, status: 'SUCCESS' },
            include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
        });
        for (const site of sites) {
            await (0, meilisearch_service_1.indexSite)(site);
        }
    }
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_3.AuditActionType.UPDATE,
            entity: 'OrganizationPlan',
            targetId: id,
            details: `Updated plan for organization ${org.name}`,
            snapshot: {
                before: org,
                after: updated,
                managedExpirySync: syncedManagedOrganizations
            },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    return updated;
};
exports.updateOrganizationPlan = updateOrganizationPlan;
const bulkUpdateOrganizationPlan = async (ids, data, auditContext) => {
    const results = [];
    const errors = [];
    for (const id of ids) {
        try {
            const updated = await (0, exports.updateOrganizationPlan)(id, data, auditContext);
            results.push(updated.id);
        }
        catch (error) {
            errors.push({ id, message: error.message });
        }
    }
    return { updated: results, errors };
};
exports.bulkUpdateOrganizationPlan = bulkUpdateOrganizationPlan;
