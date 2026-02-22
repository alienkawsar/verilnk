import { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { getOrganizationEntitlements } from './entitlement.service';
import { buildVisibleSiteWhere } from './organization-visibility.service';

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 30;

const siteInclude = {
    country: true,
    state: true,
    category: true,
    organization: true
} satisfies Prisma.SiteInclude;

type SiteWithRelations = Prisma.SiteGetPayload<{ include: typeof siteInclude }>;
type SavedSiteRow = Prisma.SavedSiteGetPayload<{
    include: {
        site: {
            include: typeof siteInclude;
        };
    };
}>;

export interface SavedSiteListItem extends SiteWithRelations {
    organizationPublic: boolean;
}

export interface SavedSiteListResult {
    items: SavedSiteListItem[];
    nextCursor: string | null;
}

const normalizeLimit = (limit?: number) => {
    if (!Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
    const parsed = Math.trunc(limit as number);
    if (parsed <= 0) return DEFAULT_PAGE_SIZE;
    return Math.min(parsed, MAX_PAGE_SIZE);
};

const toListItem = (row: SavedSiteRow): SavedSiteListItem => {
    const { site } = row;
    const organizationPublic = site.organization && !site.organization.deletedAt
        ? getOrganizationEntitlements(site.organization).canAccessOrgPage
        : false;

    return {
        ...site,
        organizationPublic
    };
};

export const listSavedSitesForUser = async (
    userId: string,
    options: { cursor?: string; limit?: number } = {}
): Promise<SavedSiteListResult> => {
    const limit = normalizeLimit(options.limit);
    const visibleSiteWhere = await buildVisibleSiteWhere();

    const rows = await prisma.savedSite.findMany({
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

export const getSavedSiteIdsForUser = async (userId: string): Promise<string[]> => {
    const visibleSiteWhere = await buildVisibleSiteWhere();
    const rows = await prisma.savedSite.findMany({
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

export const saveSiteForUser = async (
    userId: string,
    siteId: string
): Promise<{ ok: true } | { ok: false; reason: 'NOT_FOUND' }> => {
    const visibleSiteWhere = await buildVisibleSiteWhere({ id: siteId });
    const site = await prisma.site.findFirst({
        where: visibleSiteWhere,
        select: { id: true }
    });

    if (!site) {
        return { ok: false, reason: 'NOT_FOUND' };
    }

    await prisma.savedSite.upsert({
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

export const unsaveSiteForUser = async (userId: string, siteId: string): Promise<{ ok: true }> => {
    await prisma.savedSite.deleteMany({
        where: {
            userId,
            siteId
        }
    });

    return { ok: true };
};
