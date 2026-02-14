import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchMock, prismaMock } = vi.hoisted(() => ({
    searchMock: vi.fn(),
    prismaMock: {
        category: {
            findMany: vi.fn()
        },
        state: {
            findUnique: vi.fn()
        },
        country: {
            findUnique: vi.fn()
        },
        site: {
            findMany: vi.fn()
        }
    }
}));

vi.mock('../meilisearch/meilisearch.client', () => ({
    SITES_INDEX: 'verilnk_sites',
    meiliClient: {
        index: vi.fn(() => ({
            search: searchMock
        }))
    }
}));

vi.mock('../db/client', () => ({
    prisma: prismaMock
}));

vi.mock('../services/entitlement.service', () => ({
    getOrganizationEntitlements: vi.fn(() => ({
        canAccessOrgPage: true
    }))
}));

import { searchSites } from '../services/meilisearch.service';

describe('meilisearch.service searchSites', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns exact matches first by orgPriorityRank, then category expansion without duplicates', async () => {
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

        searchMock.mockImplementation(async (query: string, params: any) => {
            if (query === 'tax portal') {
                expect(params.filter).toContain('countryIso = "US"');
                expect(params.filter).toContain('state_id = "state-1"');
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
            expect(query).toBe('');
            expect(params.filter).toContain('categoryId = "cat-fin"');
            return {
                hits: [
                    { id: 'site-c', siteId: 'site-c', orgPriorityRank: 1, createdAt: 200 }, // duplicate of exact
                    { id: 'site-d', siteId: 'site-d', orgPriorityRank: 2, createdAt: 210 },
                    { id: 'site-e', siteId: 'site-e', orgPriorityRank: 1, createdAt: 220 }
                ],
                estimatedTotalHits: 3
            };
        });

        const result = await searchSites(
            'tax portal',
            { countryIso: 'US', stateId: 'state-1', isApproved: true },
            { limit: 5, offset: 0 }
        );

        expect(result.detectedCategory).toEqual({ id: 'cat-fin', name: 'Finance', slug: 'finance' });
        expect(result.scope).toEqual({ countryIso: 'US', stateCode: 'CA' });

        expect(result.exact?.map((item: any) => item.id)).toEqual(['site-c', 'site-a', 'site-b']);
        expect(result.categoryExpansion?.map((item: any) => item.id)).toEqual(['site-e', 'site-d']);
        expect(result.hits.map((item: any) => item.id)).toEqual(['site-c', 'site-a', 'site-b', 'site-e', 'site-d']);

        const uniqueIds = new Set(result.hits.map((item: any) => item.id));
        expect(uniqueIds.size).toBe(result.hits.length);
    });
});
