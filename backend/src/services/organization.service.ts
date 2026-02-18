import { prisma } from '../db/client';
import {
    OrgStatus,
    Site,
    User,
    Organization,
    PlanType,
    PlanStatus,
    SupportTier,
    Prisma
} from '@prisma/client';
import { indexSite, removeSiteFromIndex, reindexEnterpriseManagedSites, reindexOrganizationSites } from './meilisearch.service';
import bcrypt from 'bcryptjs';
import { resolveOrganizationEntitlements } from './entitlement.service';
import * as auditService from './audit.service';
import { AuditActionType } from '@prisma/client';
import { VerificationStatus } from '@prisma/client';
import { assertStrongPassword } from '../utils/passwordPolicy';
import { normalizeEnterpriseQuotaLimits } from './enterprise-quota.service';
import {
    getEffectivelyRestrictedOrganizationIds,
    isOrganizationEffectivelyRestricted
} from './organization-visibility.service';

export const checkAndExpirePriorities = async () => {
    // 1. Find expired priorities
    const expiredOrgs = await prisma.organization.findMany({
        where: {
            priorityExpiresAt: {
                lte: new Date()
            },
            deletedAt: null
        },
        select: { id: true, status: true }
    });

    if (expiredOrgs.length === 0) return;

    const ids = expiredOrgs.map(o => o.id);

    // 2. Downgrade to NORMAL and clear expiration
    await prisma.organization.updateMany({
        where: { id: { in: ids } },
        data: {
            priority: 'NORMAL',
            priorityExpiresAt: null
        }
    });

    // 3. Re-index affected Approved orgs in Meilisearch
    const approvedIds = expiredOrgs.filter(o => o.status === OrgStatus.APPROVED).map(o => o.id);
    if (approvedIds.length > 0) {
        for (const orgId of approvedIds) {
            await reindexOrganizationSites(orgId);
        }
    }
};

const runWithConcurrency = async <T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
) => {
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

export const getAllOrganizations = async (filters: { countryId?: string; stateId?: string; categoryId?: string; status?: string; type?: string; priority?: string; planType?: string; deleted?: 'only' | 'include' | 'exclude' } = {}): Promise<Organization[]> => {
    // Lazy check for expired priorities before fetching
    await checkAndExpirePriorities().catch(console.error); // Do not block if check fails, just log

    const { countryId, stateId, categoryId, status, type, priority, planType, deleted } = filters;
    const where: Prisma.OrganizationWhereInput = {};

    if (countryId) where.countryId = countryId;
    if (stateId) where.stateId = stateId;
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status as OrgStatus;
    if (type) where.type = type as any;
    if (priority) where.priority = priority as any;
    if (planType) where.planType = planType as any;

    if (deleted === 'only') {
        where.deletedAt = { not: null };
    } else if (deleted !== 'include') {
        where.deletedAt = null;
    }

    const organizations = await prisma.organization.findMany({
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

    if (organizations.length === 0) return organizations;

    const organizationIds = organizations.map((organization) => organization.id);
    let quotaRows: Array<{
        id: string;
        enterpriseMaxWorkspaces: unknown;
        enterpriseMaxLinkedOrgs: unknown;
        enterpriseMaxApiKeys: unknown;
        enterpriseMaxMembers: unknown;
    }> = [];

    try {
        quotaRows = await prisma.$queryRaw<Array<{
            id: string;
            enterpriseMaxWorkspaces: unknown;
            enterpriseMaxLinkedOrgs: unknown;
            enterpriseMaxApiKeys: unknown;
            enterpriseMaxMembers: unknown;
        }>>`
            SELECT
                "id",
                "enterpriseMaxWorkspaces",
                "enterpriseMaxLinkedOrgs",
                "enterpriseMaxApiKeys",
                "enterpriseMaxMembers"
            FROM "Organization"
            WHERE "id" IN (${Prisma.join(organizationIds)})
        `;
    } catch (error: any) {
        console.error('[Organizations] quota enrichment fallback:', {
            message: error?.message,
            code: error?.code
        });
    }

    const toNullableNumber = (value: unknown): number | null => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'bigint') return Number(value);
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    };

    const quotaMap = new Map(
        quotaRows.map((row) => [
            row.id,
            {
                enterpriseMaxWorkspaces: toNullableNumber(row.enterpriseMaxWorkspaces),
                enterpriseMaxLinkedOrgs: toNullableNumber(row.enterpriseMaxLinkedOrgs),
                enterpriseMaxApiKeys: toNullableNumber(row.enterpriseMaxApiKeys),
                enterpriseMaxMembers: toNullableNumber(row.enterpriseMaxMembers)
            }
        ])
    );

    return organizations.map((organization) => ({
        ...organization,
        ...(quotaMap.get(organization.id) || {})
    })) as Organization[];
};

export const getOrganizationById = async (id: string): Promise<Organization | null> => {
    return prisma.organization.findUnique({
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

interface OrgSignupData {
    email: string;
    password: string;
    orgName: string;
    website: string;
    phone: string;
    address: string;
    countryId: string;
    stateId?: string;
    categoryId?: string;
    type: 'PUBLIC' | 'PRIVATE' | 'NON_PROFIT';
    about?: string;
    logo?: string;
}

const slugify = (value: string) => {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
};

const generateUniqueSlug = async (name: string) => {
    const base = slugify(name);
    let slug = base || `org-${Date.now()}`;
    let suffix = 1;

    while (true) {
        const existing = await prisma.organization.findUnique({ where: { slug } });
        if (!existing) return slug;
        slug = `${base}-${suffix}`;
        suffix += 1;
    }
};

const getEnterpriseLinkRequestModel = () => (prisma as any).enterpriseOrgLinkRequest;

const activatePendingEnterpriseLinkIntents = async (
    organizationId: string,
    actorUserId?: string
) => {
    const linkRequestModel = getEnterpriseLinkRequestModel();
    if (!linkRequestModel) {
        return { activated: 0, requestIds: [] as string[], workspaceIds: [] as string[] };
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
        return { activated: 0, requestIds: [] as string[], workspaceIds: [] as string[] };
    }

    return prisma.$transaction(async (tx) => {
        const txLinkRequestModel = (tx as any).enterpriseOrgLinkRequest;
        let activated = 0;
        const requestIds: string[] = [];
        const workspaceIds = new Set<string>();
        const now = new Date();

        for (const intent of pendingIntents) {
            if (!intent.workspaceId) continue;

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
        timeout: 10_000,
        maxWait: 5_000
    });
};

const denyPendingEnterpriseLinkIntents = async (
    organizationId: string,
    actorUserId?: string
) => {
    const linkRequestModel = getEnterpriseLinkRequestModel();
    if (!linkRequestModel) return { denied: 0 };

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

export const signupOrganization = async (data: OrgSignupData) => {
    // 1. Check if email exists (User or Admin)
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    const existingAdmin = await prisma.admin.findUnique({ where: { email: data.email } });
    const existingOrgEmail = await prisma.organization.findUnique({ where: { email: data.email } });

    if (existingUser || existingAdmin || existingOrgEmail) {
        throw new Error('Email already in use');
    }

    // 2. Hash Password
    assertStrongPassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 10);
    // const userName = `${data.firstName} ${data.lastName}`; // Removed as per requirement
    const userName = data.orgName; // Use Org Name as fallback for User Name since First/Last are gone

    // 3. Transaction: Create Org, User, and Site (Pending)
    return await prisma.$transaction(async (tx) => {
        let categoryId = data.categoryId;
        if (!categoryId) {
            const defaultCat = await tx.category.findFirst({ orderBy: { sortOrder: 'asc' } });
            if (!defaultCat) throw new Error('No categories available to assign to organization');
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
                status: OrgStatus.PENDING,
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
        timeout: 10_000,
        maxWait: 5_000
    });
};

export const adminCreateOrganization = async (
    data: {
        name: string;
        email: string;
        password: string;
        website: string;
        phone: string;
        address: string;
        countryId: string;
        categoryId: string;
        stateId?: string;
        about?: string;
        logo?: string;
        type?: 'PUBLIC' | 'PRIVATE' | 'NON_PROFIT';
        planType?: PlanType;
        planStatus?: PlanStatus;
        durationDays?: number;
        priorityOverride?: number | null;
        enterpriseMaxWorkspaces?: number | null;
        enterpriseMaxLinkedOrgs?: number | null;
        enterpriseMaxApiKeys?: number | null;
        enterpriseMaxMembers?: number | null;
    },
    auditContext?: { adminId: string; ip?: string; userAgent?: string; role?: string }
) => {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    const existingAdmin = await prisma.admin.findUnique({ where: { email: data.email } });
    const existingOrgEmail = await prisma.organization.findUnique({ where: { email: data.email } });
    if (existingUser || existingAdmin || existingOrgEmail) {
        throw new Error('Email already in use');
    }

    assertStrongPassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const slug = await generateUniqueSlug(data.name);

    const planType = data.planType ?? PlanType.FREE;
    let planStatus = data.planStatus ?? PlanStatus.ACTIVE;
    const now = new Date();
    let planStartAt = now;
    let planEndAt: Date | null = null;
    let supportTier = PLAN_SUPPORT_TIER[planType] ?? SupportTier.NONE;
    let priorityOverride: number | null = null;
    const enterpriseQuotaValues = normalizeEnterpriseQuotaLimits({
        enterpriseMaxWorkspaces: data.enterpriseMaxWorkspaces,
        enterpriseMaxLinkedOrgs: data.enterpriseMaxLinkedOrgs,
        enterpriseMaxApiKeys: data.enterpriseMaxApiKeys,
        enterpriseMaxMembers: data.enterpriseMaxMembers
    });

    if (planType === PlanType.FREE) {
        planStatus = PlanStatus.ACTIVE;
        supportTier = SupportTier.NONE;
        planEndAt = null;
        priorityOverride = null;
    } else {
        if (data.durationDays && data.durationDays > 0) {
            planEndAt = new Date(now);
            planEndAt.setDate(planEndAt.getDate() + data.durationDays);
        }
        if (planType === PlanType.ENTERPRISE) {
            priorityOverride = data.priorityOverride ?? null;
        }
    }

    const result = await prisma.$transaction(async (tx) => {
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
                status: OrgStatus.APPROVED,
                priority: 'NORMAL',
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

        if (planType === PlanType.ENTERPRISE) {
            await tx.$executeRaw`
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
                status: VerificationStatus.SUCCESS,
                organizationId: org.id
            }
        });

        if (auditContext) {
            await auditService.logActionTx(tx, {
                adminId: auditContext.adminId,
                actorRole: auditContext.role,
                action: AuditActionType.CREATE,
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
        timeout: 10_000,
        maxWait: 5_000
    });

    if (result.org.status === OrgStatus.APPROVED) {
        const fullSite = await prisma.site.findUnique({
            where: { id: result.site.id },
            include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
        });
        if (fullSite) {
            await indexSite(fullSite as any);
        }
    }

    return result;
};

// Public Profile (Sanitized)
export const getPublicOrganization = async (id: string) => {
    const org = await prisma.organization.findUnique({
        where: { id },
        include: {
            country: true,
            state: true,
            category: true,
        },
    });

    if (!org) return null;
    if (org.deletedAt) return null;
    const { entitlements, organization, wasUpdated } = await resolveOrganizationEntitlements(org);
    const currentOrg = wasUpdated ? { ...org, ...organization } : org;
    const effectiveRestricted = await isOrganizationEffectivelyRestricted(currentOrg.id);
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
    if (!entitlements.canAccessOrgPage) return null;

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

export const getPublicOrganizationSitemapEntries = async () => {
    const now = new Date();
    const effectivelyRestrictedOrgIds = await getEffectivelyRestrictedOrganizationIds();
    const orgs = await prisma.organization.findMany({
        where: {
            status: OrgStatus.APPROVED,
            isRestricted: false,
            planType: { not: PlanType.FREE },
            planStatus: PlanStatus.ACTIVE,
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

export const updateOrganization = async (
    id: string,
    data: Partial<Organization>,
    auditContext?: { adminId: string; ip?: string; userAgent?: string; role?: string }
) => {
    // Check if website is changing
    if (data.website) {
        const currentOrg = await prisma.organization.findUnique({ where: { id } });
        if (currentOrg && currentOrg.website !== data.website) {
            // Website changed, reset status to PENDING
            data.status = OrgStatus.PENDING;
            // Also need to update the Site URL and Status
            // We can do this in the transaction below if we unify logic
        }
    }

    // Existing update logic (enhanced)
    const result = await prisma.$transaction(async (tx) => {
        // Update Org
        const org = await tx.organization.update({
            where: { id },
            data
        });

        // Cascade to Site (Status)
        if (data.status) {
            const statusMap: Record<string, string> = {
                [OrgStatus.APPROVED]: 'SUCCESS',
                [OrgStatus.REJECTED]: 'FAILED', // or REJECTED if enum matches
                [OrgStatus.PENDING]: 'PENDING'
            };
            const siteStatus = statusMap[data.status];

            if (siteStatus) {
                await tx.site.updateMany({
                    where: { organizationId: id },
                    data: { status: siteStatus as any }
                });
            }
        }

        // Cascade Structural Changes (Country, State, Category, Name)
        const siteUpdates: any = {};
        if (data.countryId) siteUpdates.countryId = data.countryId;
        if (data.stateId !== undefined) siteUpdates.stateId = data.stateId;
        if (data.categoryId) siteUpdates.categoryId = data.categoryId;
        if (data.name) siteUpdates.name = data.name;

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
        timeout: 10_000,
        maxWait: 5_000
    });

    let activatedLinkIntents = { activated: 0, requestIds: [] as string[], workspaceIds: [] as string[] };
    let deniedLinkIntents = { denied: 0 };
    if (data.status === OrgStatus.APPROVED) {
        activatedLinkIntents = await activatePendingEnterpriseLinkIntents(id, auditContext?.adminId);
    } else if (data.status === OrgStatus.REJECTED) {
        deniedLinkIntents = await denyPendingEnterpriseLinkIntents(id, auditContext?.adminId);
    }

    if (auditContext && activatedLinkIntents.activated > 0) {
        await auditService.logAction({
            adminId: auditContext.adminId,
            actorRole: auditContext.role,
            action: AuditActionType.UPDATE,
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
            action: AuditActionType.UPDATE,
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
        if (data.status === OrgStatus.APPROVED) {
            const sites = await prisma.site.findMany({
                where: { organizationId: id },
                include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
            });
            for (const site of sites) {
                await indexSite(site);
            }
        } else {
            const sites = await prisma.site.findMany({
                where: { organizationId: id },
                select: { id: true }
            });
            for (const site of sites) {
                await removeSiteFromIndex(site.id);
            }
        }
    } else {
        const needsReindex = Boolean(
            data.name ||
            data.countryId ||
            data.categoryId ||
            data.website ||
            data.logo ||
            data.about ||
            data.priority ||
            data.stateId !== undefined
        );

        if (needsReindex) {
            const org = await prisma.organization.findUnique({ where: { id } });
            if (org?.status === OrgStatus.APPROVED) {
                await reindexOrganizationSites(id);
            }
        }
    }

    return result;
};

export const deleteOrganization = async (
    id: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string; role?: string },
    deleteReason?: string
) => {
    return softDeleteOrganization(id, auditContext, deleteReason);
};

export const restrictOrganization = async (id: string, restricted: boolean) => {
    const updated = await prisma.organization.update({
        where: { id },
        data: { isRestricted: restricted }
    });

    if (updated.planType === PlanType.ENTERPRISE) {
        await reindexEnterpriseManagedSites(id);
    } else {
        await reindexOrganizationSites(id);
    }
    return updated;
};

const getDeleteRecoveryDays = () => {
    const days = Number(process.env.ORG_DELETE_RECOVERY_DAYS || 7);
    return Number.isFinite(days) && days > 0 ? days : 7;
};

const canRestoreOrg = (deletedAt?: Date | null) => {
    if (!deletedAt) return false;
    const windowDays = getDeleteRecoveryDays();
    const limit = new Date(deletedAt);
    limit.setDate(limit.getDate() + windowDays);
    return new Date() <= limit;
};

export const softDeleteOrganization = async (
    id: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string; role?: string },
    deleteReason?: string
) => {
    const now = new Date();
    const sitesToRemove = await prisma.site.findMany({
        where: { organizationId: id },
        select: { id: true }
    });

    const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.organization.findUnique({ where: { id } });
        if (!existing) throw new Error('Organization not found');
        if (existing.deletedAt) return existing;

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
                action: AuditActionType.DELETE,
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
        timeout: 10_000,
        maxWait: 5_000
    });

    for (const site of sitesToRemove) {
        await removeSiteFromIndex(site.id);
    }

    return result;
};

export const restoreOrganization = async (
    id: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string; role?: string }
) => {
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org || !org.deletedAt) throw new Error('Organization not found or not deleted');
    if (!canRestoreOrg(org.deletedAt)) throw new Error('Restore window expired');

    const restored = await prisma.$transaction(async (tx) => {
        const before = await tx.organization.findUnique({ where: { id } });
        if (!before) throw new Error('Organization not found');

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
                action: AuditActionType.UPDATE,
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
        timeout: 10_000,
        maxWait: 5_000
    });

    if (restored.status === OrgStatus.APPROVED) {
        const sites = await prisma.site.findMany({
            where: { organizationId: id, status: 'SUCCESS' },
            include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
        });
        for (const site of sites) {
            await indexSite(site);
        }
    }

    return restored;
};

export const permanentlyDeleteOrganization = async (
    id: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string; role?: string }
) => {
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org || !org.deletedAt) throw new Error('Organization not found or not deleted');
    if (canRestoreOrg(org.deletedAt)) throw new Error('Restore window not expired');

    const sitesToRemove = await prisma.site.findMany({
        where: { organizationId: id },
        select: { id: true }
    });

    const result = await prisma.$transaction(async (tx) => {
        const before = await tx.organization.findUnique({ where: { id } });
        if (!before) throw new Error('Organization not found');

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
                action: AuditActionType.DELETE,
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
        timeout: 10_000,
        maxWait: 5_000
    });

    for (const site of sitesToRemove) {
        await removeSiteFromIndex(site.id);
    }

    return result;
};

export const deleteOrganizations = async (
    ids: string[],
    auditContext?: { adminId: string; ip?: string; userAgent?: string; role?: string },
    deleteReason?: string
) => {
    const now = new Date();
    const orgs = await prisma.organization.findMany({
        where: { id: { in: ids } }
    });
    if (orgs.length !== ids.length) {
        throw new Error('One or more organizations not found');
    }

    const orgMap = new Map(orgs.map(o => [o.id, o]));
    const sitesToRemove = await prisma.site.findMany({
        where: { organizationId: { in: ids } },
        select: { id: true, organizationId: true }
    });

    await prisma.$transaction(async (tx) => {
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
                    action: AuditActionType.DELETE,
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
        timeout: 10_000,
        maxWait: 5_000
    });

    for (const site of sitesToRemove) {
        await removeSiteFromIndex(site.id);
    }

    return { deleted: ids, errors: [] };
};

export const updateOrganizationPriority = async (id: string, priority: string, durationDays?: number) => {

    let expiresAt: Date | null = null;
    if (durationDays && durationDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);
    }

    const org = await prisma.organization.update({
        where: { id },
        data: {
            priority: priority as any,
            priorityExpiresAt: expiresAt
        }
    });

    // Sync with Meilisearch for affected org sites to update orgPriorityRank instantly.
    if (org.status === OrgStatus.APPROVED) {
        await reindexOrganizationSites(id);
    }

    return org;
};

export const bulkUpdateOrganizationPriority = async (ids: string[], priority: string, durationDays?: number) => {

    let expiresAt: Date | null = null;
    if (durationDays && durationDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);
    }

    // 1. Update in DB (transaction)
    const result = await prisma.$transaction(async (tx) => {
        return tx.organization.updateMany({
            where: { id: { in: ids } },
            data: {
                priority: priority as any,
                priorityExpiresAt: expiresAt
            }
        });
    }, {
        timeout: 10_000,
        maxWait: 5_000
    });

    // 2. Re-index only affected approved orgs with controlled concurrency.
    const approvedOrgs = await prisma.organization.findMany({
        where: { id: { in: ids }, status: OrgStatus.APPROVED },
        select: { id: true }
    });

    const reindexFailures: { orgId: string; message: string }[] = [];
    await runWithConcurrency(approvedOrgs.map((org) => org.id), 4, async (orgId) => {
        try {
            await reindexOrganizationSites(orgId);
        } catch (error: any) {
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

const PLAN_SUPPORT_TIER: Record<PlanType, SupportTier> = {
    FREE: 'NONE',
    BASIC: 'EMAIL',
    PRO: 'CHAT',
    BUSINESS: 'INSTANT',
    ENTERPRISE: 'DEDICATED'
};

const mapPriorityOverrideValue = (value?: number | null): number | null => {
    if (value === null || value === undefined) return null;
    return value;
};

const getOrganizationEnterpriseQuotaColumns = async (organizationId: string) => {
    const rows = await prisma.$queryRaw<Array<{
        enterpriseMaxWorkspaces: unknown;
        enterpriseMaxLinkedOrgs: unknown;
        enterpriseMaxApiKeys: unknown;
        enterpriseMaxMembers: unknown;
    }>>`
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

    const toNullableNumber = (value: unknown): number | null => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'bigint') return Number(value);
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

const persistOrganizationEnterpriseQuotas = async (
    organizationId: string,
    quotas: {
        maxWorkspaces: number;
        maxLinkedOrgs: number;
        maxApiKeys: number;
        maxMembers: number;
    }
) => {
    await prisma.$executeRaw`
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
} as const;

const syncManagedEnterpriseOrganizationExpiry = async (
    enterpriseId: string,
    planEndAt: Date | null
) => {
    const linkRequestModel = getEnterpriseLinkRequestModel();
    if (!linkRequestModel) return 0;

    const intents = (await linkRequestModel.findMany({
        where: {
            enterpriseId,
            intentType: ENTERPRISE_LINK_INTENT_TYPE.CREATE_UNDER_ENTERPRISE,
            status: { in: ['PENDING_APPROVAL', 'APPROVED'] }
        },
        select: { organizationId: true }
    })) as Array<{ organizationId?: string | null }>;

    const managedOrgIds: string[] = Array.from(
        new Set(
            intents
                .map((intent) => intent.organizationId)
                .filter((organizationId): organizationId is string => Boolean(organizationId))
        )
    ).filter((organizationId: string) => organizationId !== enterpriseId);

    if (managedOrgIds.length === 0) return 0;

    const result = await prisma.organization.updateMany({
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

export const updateOrganizationPlan = async (
    id: string,
    data: {
        planType: PlanType;
        planStatus: PlanStatus;
        durationDays?: number;
        priorityOverride?: number | null;
        enterpriseMaxWorkspaces?: number | null;
        enterpriseMaxLinkedOrgs?: number | null;
        enterpriseMaxApiKeys?: number | null;
        enterpriseMaxMembers?: number | null;
    },
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
) => {
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) throw new Error('Organization not found');
    const existingQuotas = await getOrganizationEnterpriseQuotaColumns(id);

    const now = new Date();
    const updateData: any = {
        planType: data.planType,
        planStatus: data.planStatus,
        supportTier: PLAN_SUPPORT_TIER[data.planType] ?? SupportTier.NONE
    };

    if (data.durationDays !== undefined) {
        if (data.durationDays && data.durationDays > 0) {
            const endAt = new Date(now);
            endAt.setDate(endAt.getDate() + data.durationDays);
            updateData.planStartAt = now;
            updateData.planEndAt = endAt;
        } else {
            updateData.planStartAt = now;
            updateData.planEndAt = null;
        }
    }

    let enterpriseQuotaValues: ReturnType<typeof normalizeEnterpriseQuotaLimits> | null = null;
    if (data.planType === PlanType.ENTERPRISE) {
        updateData.priorityOverride = mapPriorityOverrideValue(data.priorityOverride);
        enterpriseQuotaValues = normalizeEnterpriseQuotaLimits({
            enterpriseMaxWorkspaces: data.enterpriseMaxWorkspaces ?? existingQuotas.enterpriseMaxWorkspaces,
            enterpriseMaxLinkedOrgs: data.enterpriseMaxLinkedOrgs ?? existingQuotas.enterpriseMaxLinkedOrgs,
            enterpriseMaxApiKeys: data.enterpriseMaxApiKeys ?? existingQuotas.enterpriseMaxApiKeys,
            enterpriseMaxMembers: data.enterpriseMaxMembers ?? existingQuotas.enterpriseMaxMembers
        });
    } else {
        updateData.priorityOverride = null;
    }

    if (data.planType === PlanType.FREE) {
        updateData.planStatus = PlanStatus.ACTIVE;
        updateData.supportTier = SupportTier.NONE;
        updateData.priorityOverride = null;
        updateData.planEndAt = null;
    }

    const updated = await prisma.organization.update({
        where: { id },
        data: updateData
    });

    if (updated.planType === PlanType.ENTERPRISE && enterpriseQuotaValues) {
        await persistOrganizationEnterpriseQuotas(updated.id, enterpriseQuotaValues);
    }

    const shouldSyncManagedOrgExpiry =
        updated.planType === PlanType.ENTERPRISE &&
        Object.prototype.hasOwnProperty.call(updateData, 'planEndAt');

    let syncedManagedOrganizations = 0;
    if (shouldSyncManagedOrgExpiry) {
        syncedManagedOrganizations = await syncManagedEnterpriseOrganizationExpiry(
            updated.id,
            updated.planEndAt
        );
    }

    if (updated.status === OrgStatus.APPROVED) {
        const sites = await prisma.site.findMany({
            where: { organizationId: id, status: 'SUCCESS' },
            include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
        });
        for (const site of sites) {
            await indexSite(site);
        }
    }

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.UPDATE,
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

export const bulkUpdateOrganizationPlan = async (
    ids: string[],
    data: {
        planType: PlanType;
        planStatus: PlanStatus;
        durationDays?: number;
        priorityOverride?: number | null;
        enterpriseMaxWorkspaces?: number | null;
        enterpriseMaxLinkedOrgs?: number | null;
        enterpriseMaxApiKeys?: number | null;
        enterpriseMaxMembers?: number | null;
    },
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
) => {
    const results = [];
    const errors: any[] = [];

    for (const id of ids) {
        try {
            const updated = await updateOrganizationPlan(id, data, auditContext);
            results.push(updated.id);
        } catch (error: any) {
            errors.push({ id, message: error.message });
        }
    }

    return { updated: results, errors };
};
