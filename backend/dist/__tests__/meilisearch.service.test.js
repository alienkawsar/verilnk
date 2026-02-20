"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { searchMock, prismaMock } = vitest_1.vi.hoisted(() => ({
    searchMock: vitest_1.vi.fn(),
    prismaMock: {
        category: {
            findMany: vitest_1.vi.fn()
        },
        state: {
            findUnique: vitest_1.vi.fn()
        },
        country: {
            findUnique: vitest_1.vi.fn()
        },
        site: {
            findMany: vitest_1.vi.fn()
        }
    }
}));
vitest_1.vi.mock('../meilisearch/meilisearch.client', () => ({
    SITES_INDEX: 'verilnk_sites',
    meiliClient: {
        index: vitest_1.vi.fn(() => ({
            search: searchMock
        }))
    }
}));
vitest_1.vi.mock('../db/client', () => ({
    prisma: prismaMock
}));
vitest_1.vi.mock('../services/entitlement.service', () => ({
    getOrganizationEntitlements: vitest_1.vi.fn(() => ({
        canAccessOrgPage: true
    }))
}));
const meilisearch_service_1 = require("../services/meilisearch.service");
(0, vitest_1.describe)('meilisearch.service searchSites', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('returns exact matches first by orgPriorityRank, then category expansion without duplicates', async () => {
        prismaMock.category.findMany.mockResolvedValue([
            {
                id: 'cat-fin',
                name: 'Finance',
                slug: 'finance',
                sortOrder: 0,
                categoryTags: [{ tag: { slug: 'tax', name: 'Tax' } }]
            }
        ]);
        prismaMock.state.findUnique.mockResolvedValue({ code: 'CA' });
        searchMock.mockImplementation(async (query, params) => {
            if (query === 'tax portal') {
                (0, vitest_1.expect)(params.filter).toContain('countryIso = "US"');
                (0, vitest_1.expect)(params.filter).toContain('state_id = "state-1"');
                return {
                    hits: [
                        { id: 'site-b', siteId: 'site-b', orgPriorityRank: 3, _rankingScore: 0.95, createdAt: 100 },
                        { id: 'site-a', siteId: 'site-a', orgPriorityRank: 1, _rankingScore: 0.2, createdAt: 300 },
                        { id: 'site-c', siteId: 'site-c', orgPriorityRank: 1, _rankingScore: 0.8, createdAt: 200 }
                    ],
                    estimatedTotalHits: 3
                };
            }
            // Category expansion query.
            (0, vitest_1.expect)(query).toBe('');
            (0, vitest_1.expect)(params.filter).toContain('categoryId = "cat-fin"');
            return {
                hits: [
                    { id: 'site-c', siteId: 'site-c', orgPriorityRank: 1, createdAt: 200 }, // duplicate of exact
                    { id: 'site-d', siteId: 'site-d', orgPriorityRank: 2, createdAt: 210 },
                    { id: 'site-e', siteId: 'site-e', orgPriorityRank: 1, createdAt: 220 }
                ],
                estimatedTotalHits: 3
            };
        });
        const result = await (0, meilisearch_service_1.searchSites)('tax portal', { countryIso: 'US', stateId: 'state-1', isApproved: true }, { limit: 5, offset: 0 });
        (0, vitest_1.expect)(result.detectedCategory).toEqual({ id: 'cat-fin', name: 'Finance', slug: 'finance' });
        (0, vitest_1.expect)(result.scope).toEqual({ countryIso: 'US', stateCode: 'CA' });
        (0, vitest_1.expect)(result.exact?.map((item) => item.id)).toEqual(['site-c', 'site-a', 'site-b']);
        (0, vitest_1.expect)(result.categoryExpansion?.map((item) => item.id)).toEqual(['site-e', 'site-d']);
        (0, vitest_1.expect)(result.hits.map((item) => item.id)).toEqual(['site-c', 'site-a', 'site-b', 'site-e', 'site-d']);
        const uniqueIds = new Set(result.hits.map((item) => item.id));
        (0, vitest_1.expect)(uniqueIds.size).toBe(result.hits.length);
    });
});
