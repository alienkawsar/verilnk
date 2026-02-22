import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    prismaMock,
    buildVisibleSiteWhereMock,
    getOrganizationEntitlementsMock
} = vi.hoisted(() => ({
    prismaMock: {
        savedSite: {
            findMany: vi.fn(),
            upsert: vi.fn(),
            deleteMany: vi.fn()
        },
        site: {
            findFirst: vi.fn()
        }
    },
    buildVisibleSiteWhereMock: vi.fn(),
    getOrganizationEntitlementsMock: vi.fn()
}));

vi.mock('../db/client', () => ({
    prisma: prismaMock
}));

vi.mock('../services/organization-visibility.service', () => ({
    buildVisibleSiteWhere: buildVisibleSiteWhereMock
}));

vi.mock('../services/entitlement.service', () => ({
    getOrganizationEntitlements: getOrganizationEntitlementsMock
}));

import {
    getSavedSiteIdsForUser,
    listSavedSitesForUser,
    saveSiteForUser,
    unsaveSiteForUser
} from '../services/saved-site.service';

describe('saved-site service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        buildVisibleSiteWhereMock.mockResolvedValue({});
        getOrganizationEntitlementsMock.mockReturnValue({ canAccessOrgPage: true });
    });

    it('returns NOT_FOUND when saving unknown site', async () => {
        prismaMock.site.findFirst.mockResolvedValue(null);

        const result = await saveSiteForUser('user-1', 'site-1');

        expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
        expect(prismaMock.savedSite.upsert).not.toHaveBeenCalled();
    });

    it('upserts saved site idempotently', async () => {
        prismaMock.site.findFirst.mockResolvedValue({ id: 'site-1' });
        prismaMock.savedSite.upsert.mockResolvedValue({ id: 'saved-1' });

        const result = await saveSiteForUser('user-1', 'site-1');

        expect(result).toEqual({ ok: true });
        expect(prismaMock.savedSite.upsert).toHaveBeenCalledWith({
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

    it('deletes saved site rows idempotently', async () => {
        prismaMock.savedSite.deleteMany.mockResolvedValue({ count: 0 });

        const result = await unsaveSiteForUser('user-1', 'site-1');

        expect(result).toEqual({ ok: true });
        expect(prismaMock.savedSite.deleteMany).toHaveBeenCalledWith({
            where: {
                userId: 'user-1',
                siteId: 'site-1'
            }
        });
    });

    it('lists saved site ids for hydration', async () => {
        prismaMock.savedSite.findMany.mockResolvedValue([{ siteId: 'site-a' }, { siteId: 'site-b' }]);

        const result = await getSavedSiteIdsForUser('user-1');

        expect(result).toEqual(['site-a', 'site-b']);
        expect(prismaMock.savedSite.findMany).toHaveBeenCalledWith({
            where: {
                userId: 'user-1',
                site: {}
            },
            select: {
                siteId: true
            }
        });
    });

    it('returns paginated saved site list with next cursor', async () => {
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

        const result = await listSavedSitesForUser('user-1', { limit: 1 });

        expect(result.nextCursor).toBe('saved-1');
        expect(result.items).toHaveLength(1);
        expect(result.items[0].id).toBe('site-1');
        expect(result.items[0].organizationPublic).toBe(true);
    });
});
