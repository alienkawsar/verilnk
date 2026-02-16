import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        workspaceOrganization: {
            findMany: vi.fn()
        },
        enterpriseOrgLinkRequest: {
            findMany: vi.fn()
        },
        orgAnalytics: {
            groupBy: vi.fn(),
            aggregate: vi.fn()
        },
        orgAnalyticsEvent: {
            findMany: vi.fn()
        },
        organization: {
            findMany: vi.fn()
        }
    }
}));

vi.mock('../db/client', () => ({
    prisma: prismaMock
}));

import {
    getWorkspaceLinkedOrgIds,
    getEnterpriseAnalyticsDaily,
    getEnterpriseAnalyticsSummary,
    getEnterpriseAnalyticsHourly,
    getEnterpriseAnalyticsCategories
} from '../services/analytics.service';

describe('enterprise analytics service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.enterpriseOrgLinkRequest.findMany.mockResolvedValue([]);
    });

    it('filters invalid organizationIds from link-intents without throwing', async () => {
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([]);
        prismaMock.enterpriseOrgLinkRequest.findMany.mockResolvedValue([
            { organizationId: null },
            { organizationId: '' },
            { organizationId: 'org-1' }
        ]);

        const result = await getWorkspaceLinkedOrgIds('ws-1');

        expect(result).toEqual(['org-1']);
    });

    it('falls back to workspace links when link-intent lookup fails', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([
            { organizationId: 'org-1' }
        ]);
        prismaMock.enterpriseOrgLinkRequest.findMany.mockRejectedValue(
            new Error('intent query failed')
        );

        const result = await getWorkspaceLinkedOrgIds('ws-1');

        expect(result).toEqual(['org-1']);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('queries daily analytics across all linked organizations', async () => {
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([
            { organizationId: 'org-1' },
            { organizationId: 'org-2' }
        ]);
        prismaMock.orgAnalyticsEvent.findMany.mockResolvedValue([
            {
                organizationId: 'org-1',
                eventType: 'view',
                createdAt: new Date('2026-02-01T00:15:00.000Z')
            },
            {
                organizationId: 'org-2',
                eventType: 'click',
                createdAt: new Date('2026-02-01T09:00:00.000Z')
            },
            {
                organizationId: 'org-2',
                eventType: 'view',
                createdAt: new Date('2026-02-02T12:00:00.000Z')
            }
        ]);

        const result = await getEnterpriseAnalyticsDaily('ws-1', '30');

        expect(prismaMock.orgAnalyticsEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                organizationId: { in: ['org-1', 'org-2'] }
            })
        }));
        expect(result.series).toEqual([
            { date: '2026-02-01', views: 1, clicks: 1 },
            { date: '2026-02-02', views: 1, clicks: 0 }
        ]);
    });

    it('groups hourly events correctly from OrgAnalyticsEvent', async () => {
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([
            { organizationId: 'org-1' }
        ]);
        prismaMock.orgAnalyticsEvent.findMany.mockResolvedValue([
            { eventType: 'view', createdAt: new Date('2026-02-02T10:10:00.000Z') },
            { eventType: 'click', createdAt: new Date('2026-02-02T10:45:00.000Z') },
            { eventType: 'view', createdAt: new Date('2026-02-02T11:01:00.000Z') }
        ]);

        const result = await getEnterpriseAnalyticsHourly('ws-1', '7');

        expect(result.hourly).toEqual([
            { hour: '2026-02-02T10:00:00.000Z', views: 1, clicks: 1 },
            { hour: '2026-02-02T11:00:00.000Z', views: 1, clicks: 0 }
        ]);
    });

    it('groups category analytics by Site->Category via OrgAnalyticsEvent', async () => {
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([
            { organizationId: 'org-1' }
        ]);
        prismaMock.orgAnalyticsEvent.findMany.mockResolvedValue([
            {
                eventType: 'view',
                createdAt: new Date('2026-02-05T09:00:00.000Z'),
                site: { category: { id: 'cat-1', slug: 'finance', name: 'Finance' } }
            },
            {
                eventType: 'click',
                createdAt: new Date('2026-02-05T09:30:00.000Z'),
                site: { category: { id: 'cat-1', slug: 'finance', name: 'Finance' } }
            },
            {
                eventType: 'view',
                createdAt: new Date('2026-02-06T09:30:00.000Z'),
                site: { category: { id: 'cat-2', slug: 'health', name: 'Health' } }
            }
        ]);

        const result = await getEnterpriseAnalyticsCategories('ws-1', '30');

        expect(result.topCategoriesByClicks[0]).toEqual(
            expect.objectContaining({ categoryId: 'cat-1', clicks: 1 })
        );
        expect(result.topCategoriesByViews[0]).toEqual(
            expect.objectContaining({ categoryId: 'cat-1', views: 1 })
        );
        expect(result.trends.length).toBeGreaterThan(0);
    });

    it('returns empty payloads when workspace has no linked organizations', async () => {
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([]);

        const [summary, daily, hourly, categories] = await Promise.all([
            getEnterpriseAnalyticsSummary('ws-empty', '30'),
            getEnterpriseAnalyticsDaily('ws-empty', '30'),
            getEnterpriseAnalyticsHourly('ws-empty', '30'),
            getEnterpriseAnalyticsCategories('ws-empty', '30')
        ]);

        expect(summary.totals).toEqual({ views: 0, clicks: 0, ctr: 0 });
        expect(summary.topOrgs).toEqual([]);
        expect(daily.series).toEqual([]);
        expect(hourly.hourly).toEqual([]);
        expect(categories.topCategories).toEqual([]);
        expect(categories.trends).toEqual([]);
    });
});
