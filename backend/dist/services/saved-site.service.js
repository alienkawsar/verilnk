"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unsaveSiteForUser = exports.saveSiteForUser = exports.getSavedSiteIdsForUser = exports.listSavedSitesForUser = void 0;
const client_1 = require("../db/client");
const entitlement_service_1 = require("./entitlement.service");
const organization_visibility_service_1 = require("./organization-visibility.service");
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 30;
const siteInclude = {
    country: true,
    state: true,
    category: true,
    organization: true
};
const normalizeLimit = (limit) => {
    if (!Number.isFinite(limit))
        return DEFAULT_PAGE_SIZE;
    const parsed = Math.trunc(limit);
    if (parsed <= 0)
        return DEFAULT_PAGE_SIZE;
    return Math.min(parsed, MAX_PAGE_SIZE);
};
const toListItem = (row) => {
    const { site } = row;
    const organizationPublic = site.organization && !site.organization.deletedAt
        ? (0, entitlement_service_1.getOrganizationEntitlements)(site.organization).canAccessOrgPage
        : false;
    return {
        ...site,
        organizationPublic
    };
};
const listSavedSitesForUser = async (userId, options = {}) => {
    const limit = normalizeLimit(options.limit);
    const visibleSiteWhere = await (0, organization_visibility_service_1.buildVisibleSiteWhere)();
    const rows = await client_1.prisma.savedSite.findMany({
        where: {
            userId,
            site: visibleSiteWhere
        },
        include: {
            site: {
                include: siteInclude
            }
        },
        orderBy: [
            { createdAt: 'desc' },
            { id: 'desc' }
        ],
        take: limit + 1,
        ...(options.cursor
            ? {
                cursor: { id: options.cursor },
                skip: 1
            }
            : {})
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
        items: pageRows.map(toListItem),
        nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null
    };
};
exports.listSavedSitesForUser = listSavedSitesForUser;
const getSavedSiteIdsForUser = async (userId) => {
    const visibleSiteWhere = await (0, organization_visibility_service_1.buildVisibleSiteWhere)();
    const rows = await client_1.prisma.savedSite.findMany({
        where: {
            userId,
            site: visibleSiteWhere
        },
        select: {
            siteId: true
        }
    });
    return rows.map((row) => row.siteId);
};
exports.getSavedSiteIdsForUser = getSavedSiteIdsForUser;
const saveSiteForUser = async (userId, siteId) => {
    const visibleSiteWhere = await (0, organization_visibility_service_1.buildVisibleSiteWhere)({ id: siteId });
    const site = await client_1.prisma.site.findFirst({
        where: visibleSiteWhere,
        select: { id: true }
    });
    if (!site) {
        return { ok: false, reason: 'NOT_FOUND' };
    }
    await client_1.prisma.savedSite.upsert({
        where: {
            userId_siteId: {
                userId,
                siteId
            }
        },
        update: {},
        create: {
            userId,
            siteId
        }
    });
    return { ok: true };
};
exports.saveSiteForUser = saveSiteForUser;
const unsaveSiteForUser = async (userId, siteId) => {
    await client_1.prisma.savedSite.deleteMany({
        where: {
            userId,
            siteId
        }
    });
    return { ok: true };
};
exports.unsaveSiteForUser = unsaveSiteForUser;
