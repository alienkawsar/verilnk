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
exports.deleteSites = exports.deleteSite = exports.updateSiteStatus = exports.updateSite = exports.createSite = exports.getSiteById = exports.getAllSites = void 0;
const client_1 = require("../db/client");
const client_2 = require("@prisma/client");
const meilisearch_service_1 = require("./meilisearch.service");
const organization_service_1 = require("./organization.service");
const organization_visibility_service_1 = require("./organization-visibility.service");
// Helper to extract hostname
const extractHostname = (url) => {
    try {
        return new URL(url).hostname;
    }
    catch {
        return url;
    }
};
const getAllSites = async (countryId, stateId, categoryId, status, search, organizationId, type) => {
    await (0, organization_service_1.checkAndExpirePriorities)().catch(console.error);
    const baseWhere = {};
    if (countryId)
        baseWhere.countryId = countryId;
    if (stateId)
        baseWhere.stateId = stateId;
    if (categoryId)
        baseWhere.categoryId = categoryId;
    if (status)
        baseWhere.status = status;
    if (organizationId)
        baseWhere.organizationId = organizationId;
    if (search) {
        baseWhere.name = {
            contains: search,
            mode: 'insensitive'
        };
    }
    if (type === 'independent') {
        baseWhere.organizationId = null;
    }
    else if (type === 'organization') {
        baseWhere.organizationId = { not: null };
    }
    const where = await (0, organization_visibility_service_1.buildVisibleSiteWhere)(baseWhere);
    const sites = await client_1.prisma.site.findMany({
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
        const priorityRankMap = { HIGH: 1, MEDIUM: 2, NORMAL: 3, LOW: 4 };
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
exports.getAllSites = getAllSites;
const getSiteById = async (id) => {
    const site = await client_1.prisma.site.findUnique({
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
    if (!site)
        return null;
    if (site.deletedAt)
        return null;
    if (site.organizationId) {
        const restricted = await (0, organization_visibility_service_1.isOrganizationEffectivelyRestricted)(site.organizationId);
        if (restricted)
            return null;
    }
    return site;
};
exports.getSiteById = getSiteById;
const createSite = async (data, auditContext) => {
    const existingSite = await client_1.prisma.site.findUnique({
        where: { url: data.url },
    });
    if (existingSite) {
        throw new Error('Site with this URL already exists');
    }
    // Domain Uniqueness Check (approximate without column)
    const hostname = extractHostname(data.url);
    const potentialDuplicates = await client_1.prisma.site.findMany({
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
    const newSite = await client_1.prisma.site.create({
        data: {
            name: data.name,
            url: data.url,
            countryId: data.countryId,
            stateId: data.stateId,
            categoryId: data.categoryId,
            status: data.status || client_2.VerificationStatus.PENDING,
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
    const isOrgDeleted = newSite.organization?.deletedAt ? true : false;
    if (newSite.status === client_2.VerificationStatus.SUCCESS && isOrgApproved && !isOrgDeleted) {
        await (0, meilisearch_service_1.indexSite)(newSite);
    }
    // Audit Log
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.CREATE,
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
exports.createSite = createSite;
const updateSite = async (id, data, auditContext) => {
    if (data.url) {
        const existingSite = await client_1.prisma.site.findUnique({
            where: { url: data.url },
        });
        if (existingSite && existingSite.id !== id) {
            throw new Error('URL already in use by another site');
        }
        // Domain Uniqueness Check for Update
        const hostname = extractHostname(data.url);
        const potentialDuplicates = await client_1.prisma.site.findMany({
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
    const updatedSite = await client_1.prisma.site.update({
        where: { id },
        data,
        include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } } // Include for indexing
    });
    // Sync with Meilisearch ONLY if Approved
    if (updatedSite.status === client_2.VerificationStatus.SUCCESS && !updatedSite.deletedAt && !updatedSite.organization?.deletedAt) {
        await (0, meilisearch_service_1.indexSite)(updatedSite);
    }
    else {
        await (0, meilisearch_service_1.removeSiteFromIndex)(id);
    }
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.UPDATE,
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
exports.updateSite = updateSite;
const auditService = __importStar(require("./audit.service"));
const updateSiteStatus = async (id, status, auditContext) => {
    // Add log entry
    await client_1.prisma.verificationLog.create({
        data: {
            siteId: id,
            status,
            adminId: auditContext?.adminId // verificationLog tracks admin too
        },
    });
    const updatedSite = await client_1.prisma.site.update({
        where: { id },
        data: { status },
        include: { country: true, state: true, category: true, organization: true, siteTags: { include: { tag: true } } }
    });
    // Sync with Meilisearch
    if (status === client_2.VerificationStatus.SUCCESS && !updatedSite.deletedAt && !updatedSite.organization?.deletedAt) {
        await (0, meilisearch_service_1.indexSite)(updatedSite);
    }
    else {
        await (0, meilisearch_service_1.removeSiteFromIndex)(id);
    }
    if (auditContext) {
        let action = client_2.AuditActionType.UPDATE;
        if (status === client_2.VerificationStatus.SUCCESS)
            action = client_2.AuditActionType.APPROVE;
        if (status === client_2.VerificationStatus.FAILED)
            action = client_2.AuditActionType.REJECT;
        if (status === client_2.VerificationStatus.FLAGGED)
            action = client_2.AuditActionType.SUSPEND;
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
exports.updateSiteStatus = updateSiteStatus;
const deleteSite = async (id, auditContext) => {
    const site = await client_1.prisma.site.findUnique({ where: { id } });
    if (!site)
        throw new Error('Site not found');
    try {
        await client_1.prisma.verificationLog.deleteMany({ where: { siteId: id } });
        await client_1.prisma.report.deleteMany({ where: { siteId: id } });
    }
    catch (error) {
        console.error('Error cleaning up site relations:', error);
    }
    const deletedSite = await client_1.prisma.site.delete({ where: { id } });
    await (0, meilisearch_service_1.removeSiteFromIndex)(id);
    if (auditContext) {
        auditService.logAction({
            adminId: auditContext.adminId,
            action: client_2.AuditActionType.DELETE,
            entity: 'Site',
            targetId: id,
            details: `Deleted site ${site.name} (${site.url})`,
            snapshot: site,
            ipAddress: auditContext.ip,
            userAgent: auditContext.userAgent
        });
    }
    return deletedSite;
};
exports.deleteSite = deleteSite;
const deleteSites = async (ids) => {
    // 1. Validate IDs exist (Optional, deleteMany ignores missing, but good for reporting)
    // For bulk delete, explicit validation of each is often skipped for performance, 
    // but if strict validation is needed:
    // const count = await prisma.site.count({ where: { id: { in: ids } } });
    // if (count !== ids.length) throw new Error('Some sites not found');
    // 2. Perform Transactional Delete
    // We need to delete from DB and Index.
    // DB first.
    const result = await client_1.prisma.site.deleteMany({
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
        ids.forEach(id => (0, meilisearch_service_1.removeSiteFromIndex)(id).catch(console.error));
    }
    catch (e) {
        console.error('Failed to clear search index for bulk delete', e);
    }
    return { count: result.count };
};
exports.deleteSites = deleteSites;
