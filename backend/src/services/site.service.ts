import { prisma } from '../db/client';
import { Site, VerificationStatus, Prisma, OrgStatus, AuditActionType, Organization } from '@prisma/client';
import { autoVerifySite } from './verification.service';
import { indexSite, removeSiteFromIndex } from './meilisearch.service';
import { checkAndExpirePriorities } from './organization.service';

// Helper to extract hostname
const extractHostname = (url: string): string => {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
};

export const getAllSites = async (
    countryId?: string,
    stateId?: string,
    categoryId?: string,
    status?: VerificationStatus,
    search?: string,
    organizationId?: string,
    type?: 'independent' | 'organization'
): Promise<(Site & { organization: Organization | null })[]> => {
    await checkAndExpirePriorities().catch(console.error);

    const where: Prisma.SiteWhereInput = {
        // Exclude sites that belong to an organization that is NOT approved.
        NOT: {
            organization: {
                status: {
                    not: OrgStatus.APPROVED
                }
            }
        },
        deletedAt: null,
        OR: [
            { organizationId: null },
            { organization: { deletedAt: null } }
        ]
    };
    if (countryId) where.countryId = countryId;
    if (stateId) where.stateId = stateId;
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (organizationId) where.organizationId = organizationId;

    if (search) {
        where.name = {
            contains: search,
            mode: 'insensitive'
        };
    }

    if (type === 'independent') {
        where.organizationId = null;
    } else if (type === 'organization') {
        where.organizationId = { not: null };
    }

    const sites = await prisma.site.findMany({
        where,
        include: {
            country: true,
            state: true,
            category: true,
            organization: true // Include organization to verify status if needed in frontend
        },
        // Remove DB orderBy, we will Sort in JS
    });

    return sites.sort((a, b) => {
        const priorityRankMap: Record<string, number> = { HIGH: 1, MEDIUM: 2, NORMAL: 3, LOW: 4 };
        const rankA = a.organization ? (priorityRankMap[a.organization.priority] ?? 3) : 3;
        const rankB = b.organization ? (priorityRankMap[b.organization.priority] ?? 3) : 3;

        if (rankA !== rankB) {
            return rankA - rankB;
        }

        const createdA = a.createdAt?.getTime?.() || 0;
        const createdB = b.createdAt?.getTime?.() || 0;
        if (createdA !== createdB) {
            return createdB - createdA;
        }

        return a.name.localeCompare(b.name);
    });
};

export const getSiteById = async (id: string): Promise<Site | null> => {
    return prisma.site.findUnique({
        where: { id },
        include: {
            country: true,
            state: true,
            category: true,
            organization: true,
            verificationLogs: {
                orderBy: { checkedAt: 'desc' },
                take: 5,
            },
        },
    });
};

export const createSite = async (data: {
    name: string;
    url: string;
    countryId: string;
    stateId?: string;
    categoryId: string;
    status?: VerificationStatus;
    organizationId?: string; // Optional if coming from manual creation
},
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<Site> => {
    const existingSite = await prisma.site.findUnique({
        where: { url: data.url },
    });

    if (existingSite) {
        throw new Error('Site with this URL already exists');
    }

    // Domain Uniqueness Check (approximate without column)
    const hostname = extractHostname(data.url);
    const potentialDuplicates = await prisma.site.findMany({
        where: {
            url: {
                contains: hostname,
            },
        },
    });

    // Precise check in memory
    const isDuplicate = potentialDuplicates.some(site => extractHostname(site.url) === hostname);
    if (isDuplicate) {
        throw new Error(`A site with domain "${hostname}" already exists`);
    }

    const newSite = await prisma.site.create({
        data: {
            name: data.name,
            url: data.url,
            countryId: data.countryId,
            stateId: data.stateId,
            categoryId: data.categoryId,
            status: data.status || VerificationStatus.PENDING,
            organizationId: data.organizationId // Ensure this is passed if needed
        },
        include: {
            country: true,
            state: true,
            category: true,
            organization: true,
            siteTags: { include: { tag: true } }
        }
    });

    // Indexing Rule: Only index if Site is SUCCESS AND Org is APPROVED
    // If organization is not included or not APPROVED, do not index.
    const isOrgApproved = newSite.organization ? newSite.organization.status === 'APPROVED' : true; // Default true if no org (legacy?) or enforce logic
    const isOrgDeleted = (newSite.organization as any)?.deletedAt ? true : false;

    if (newSite.status === VerificationStatus.SUCCESS && isOrgApproved && !isOrgDeleted) {
        await indexSite(newSite);
    }

    // Audit Log
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.CREATE,
            entity: 'Site',
            targetId: newSite.id,
            details: `Created site ${newSite.name} (${newSite.url})`,
            snapshot: newSite,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }

    return newSite;
};

export const updateSite = async (
    id: string,
    data: {
        name?: string;
        url?: string;
        countryId?: string;
        stateId?: string;
        categoryId?: string;
        status?: VerificationStatus;
    },
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<Site> => {
    if (data.url) {
        const existingSite = await prisma.site.findUnique({
            where: { url: data.url },
        });
        if (existingSite && existingSite.id !== id) {
            throw new Error('URL already in use by another site');
        }

        // Domain Uniqueness Check for Update
        const hostname = extractHostname(data.url);
        const potentialDuplicates = await prisma.site.findMany({
            where: {
                url: { contains: hostname },
                NOT: { id }, // Exclude self
            },
        });

        const isDuplicate = potentialDuplicates.some(site => extractHostname(site.url) === hostname);
        if (isDuplicate) {
            throw new Error(`A site with domain "${hostname}" already exists`);
        }
    }

    const updatedSite = await prisma.site.update({
        where: { id },
        data,
        include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } } // Include for indexing
    });

    // Sync with Meilisearch ONLY if Approved
    if (updatedSite.status === VerificationStatus.SUCCESS && !(updatedSite as any).deletedAt && !(updatedSite.organization as any)?.deletedAt) {
        await indexSite(updatedSite);
    } else {
        await removeSiteFromIndex(id);
    }

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.UPDATE,
            entity: 'Site',
            targetId: id,
            details: `Updated site ${updatedSite.name} (${updatedSite.url})`,
            snapshot: updatedSite,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }

    return updatedSite;
};

import * as auditService from './audit.service';

export const updateSiteStatus = async (
    id: string,
    status: VerificationStatus,
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<Site> => {
    // Add log entry
    await prisma.verificationLog.create({
        data: {
            siteId: id,
            status,
            adminId: auditContext?.adminId // verificationLog tracks admin too
        },
    });

    const updatedSite = await prisma.site.update({
        where: { id },
        data: { status },
        include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
    });

    // Sync with Meilisearch
    if (status === VerificationStatus.SUCCESS && !(updatedSite as any).deletedAt && !(updatedSite.organization as any)?.deletedAt) {
        await indexSite(updatedSite);
    } else {
        await removeSiteFromIndex(id);
    }

    if (auditContext) {
        let action: any = AuditActionType.UPDATE;
        if (status === VerificationStatus.SUCCESS) action = AuditActionType.APPROVE;
        if (status === VerificationStatus.FAILED) action = AuditActionType.REJECT;
        if (status === VerificationStatus.FLAGGED) action = AuditActionType.SUSPEND;

        auditService.logAction({
            adminId: auditContext.adminId,
            action,
            entity: 'Site',
            targetId: id,
            details: `Site status updated to ${status}`,
            snapshot: { status },
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }

    return updatedSite;
};

export const deleteSite = async (
    id: string,
    auditContext?: { adminId: string; ip?: string; userAgent?: string }
): Promise<Site> => {
    const site = await prisma.site.findUnique({ where: { id } });
    if (!site) throw new Error('Site not found');

    try {
        await prisma.verificationLog.deleteMany({ where: { siteId: id } });
        await prisma.report.deleteMany({ where: { siteId: id } });
    } catch (error) {
        console.error('Error cleaning up site relations:', error);
    }

    const deletedSite = await prisma.site.delete({ where: { id } });
    await removeSiteFromIndex(id);

    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: AuditActionType.DELETE,
            entity: 'Site',
            targetId: id,
            details: `Deleted site ${site.name} (${site.url})`,
            snapshot: site,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }

    return deletedSite;
}

export const deleteSites = async (ids: string[]): Promise<{ count: number }> => {
    // 1. Validate IDs exist (Optional, deleteMany ignores missing, but good for reporting)
    // For bulk delete, explicit validation of each is often skipped for performance, 
    // but if strict validation is needed:
    // const count = await prisma.site.count({ where: { id: { in: ids } } });
    // if (count !== ids.length) throw new Error('Some sites not found');

    // 2. Perform Transactional Delete
    // We need to delete from DB and Index.
    // DB first.
    const result = await prisma.site.deleteMany({
        where: {
            id: {
                in: ids
            }
        }
    });

    // 3. Cleanup Index (Best effort)
    // Meilisearch deleteDocuments takes an array of strings (primary keys)
    try {
        const { meiliClient, SITES_INDEX } = require('./meilisearch.service'); // circular dep avoidance or standard import
        // Using the service utility if available or direct client
        // Let's use the service if possible, or direct client from module
        // We can iteratively call verify/remove or add a bulk remove to meilisearch service.
        // For now, simpler to map removeSiteFromIndex if it's just a few, 
        // OR ideally add removeSitesFromIndex(ids) to MeiliService.
        // Let's assume sequential for now or just ignore consistency for this step 
        // until we add bulk method to meili service.

        // Actually, let's just trigger individual removals concurrently (up to a limit)
        // or let's rely on re-index. But better to try removing.
        ids.forEach(id => removeSiteFromIndex(id).catch(console.error));

    } catch (e) {
        console.error('Failed to clear search index for bulk delete', e);
    }

    return { count: result.count };
};
