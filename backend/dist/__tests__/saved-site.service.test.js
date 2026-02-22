"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { prismaMock, buildVisibleSiteWhereMock, getOrganizationEntitlementsMock } = vitest_1.vi.hoisted(() => ({
    prismaMock: {
        savedSite: {
            findMany: vitest_1.vi.fn(),
            upsert: vitest_1.vi.fn(),
            deleteMany: vitest_1.vi.fn()
        },
        site: {
            findFirst: vitest_1.vi.fn()
        }
    },
    buildVisibleSiteWhereMock: vitest_1.vi.fn(),
    getOrganizationEntitlementsMock: vitest_1.vi.fn()
}));
vitest_1.vi.mock('../db/client', () => ({
    prisma: prismaMock
}));
vitest_1.vi.mock('../services/organization-visibility.service', () => ({
    buildVisibleSiteWhere: buildVisibleSiteWhereMock
}));
vitest_1.vi.mock('../services/entitlement.service', () => ({
    getOrganizationEntitlements: getOrganizationEntitlementsMock
}));
const saved_site_service_1 = require("../services/saved-site.service");
(0, vitest_1.describe)('saved-site service', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        buildVisibleSiteWhereMock.mockResolvedValue({});
        getOrganizationEntitlementsMock.mockReturnValue({ canAccessOrgPage: true });
    });
    (0, vitest_1.it)('returns NOT_FOUND when saving unknown site', async () => {
        prismaMock.site.findFirst.mockResolvedValue(null);
        const result = await (0, saved_site_service_1.saveSiteForUser)('user-1', 'site-1');
        (0, vitest_1.expect)(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
        (0, vitest_1.expect)(prismaMock.savedSite.upsert).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('upserts saved site idempotently', async () => {
        prismaMock.site.findFirst.mockResolvedValue({ id: 'site-1' });
        prismaMock.savedSite.upsert.mockResolvedValue({ id: 'saved-1' });
        const result = await (0, saved_site_service_1.saveSiteForUser)('user-1', 'site-1');
        (0, vitest_1.expect)(result).toEqual({ ok: true });
        (0, vitest_1.expect)(prismaMock.savedSite.upsert).toHaveBeenCalledWith({
            where: {
                userId_siteId: {
                    userId: 'user-1',
                    siteId: 'site-1'
                }
            },
            update: {},
            create: {
                userId: 'user-1',
                siteId: 'site-1'
            }
        });
    });
    (0, vitest_1.it)('deletes saved site rows idempotently', async () => {
        prismaMock.savedSite.deleteMany.mockResolvedValue({ count: 0 });
        const result = await (0, saved_site_service_1.unsaveSiteForUser)('user-1', 'site-1');
        (0, vitest_1.expect)(result).toEqual({ ok: true });
        (0, vitest_1.expect)(prismaMock.savedSite.deleteMany).toHaveBeenCalledWith({
            where: {
                userId: 'user-1',
                siteId: 'site-1'
            }
        });
    });
    (0, vitest_1.it)('lists saved site ids for hydration', async () => {
        prismaMock.savedSite.findMany.mockResolvedValue([{ siteId: 'site-a' }, { siteId: 'site-b' }]);
        const result = await (0, saved_site_service_1.getSavedSiteIdsForUser)('user-1');
        (0, vitest_1.expect)(result).toEqual(['site-a', 'site-b']);
        (0, vitest_1.expect)(prismaMock.savedSite.findMany).toHaveBeenCalledWith({
            where: {
                userId: 'user-1',
                site: {}
            },
            select: {
                siteId: true
            }
        });
    });
    (0, vitest_1.it)('returns paginated saved site list with next cursor', async () => {
        prismaMock.savedSite.findMany.mockResolvedValue([
            {
                id: 'saved-1',
                site: {
                    id: 'site-1',
                    name: 'Site One',
                    url: 'https://one.test',
                    organization: {
                        id: 'org-1',
                        deletedAt: null
                    }
                }
            },
            {
                id: 'saved-2',
                site: {
                    id: 'site-2',
                    name: 'Site Two',
                    url: 'https://two.test',
                    organization: null
                }
            }
        ]);
        const result = await (0, saved_site_service_1.listSavedSitesForUser)('user-1', { limit: 1 });
        (0, vitest_1.expect)(result.nextCursor).toBe('saved-1');
        (0, vitest_1.expect)(result.items).toHaveLength(1);
        (0, vitest_1.expect)(result.items[0].id).toBe('site-1');
        (0, vitest_1.expect)(result.items[0].organizationPublic).toBe(true);
    });
});
