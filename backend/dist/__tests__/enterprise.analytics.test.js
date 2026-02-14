"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { prismaMock } = vitest_1.vi.hoisted(() => ({
    prismaMock: {
        workspaceOrganization: {
            findMany: vitest_1.vi.fn()
        },
        orgAnalytics: {
            groupBy: vitest_1.vi.fn(),
            aggregate: vitest_1.vi.fn()
        },
        orgAnalyticsEvent: {
            findMany: vitest_1.vi.fn()
        },
        organization: {
            findMany: vitest_1.vi.fn()
        }
    }
}));
vitest_1.vi.mock('../db/client', () => ({
    prisma: prismaMock
}));
const analytics_service_1 = require("../services/analytics.service");
(0, vitest_1.describe)('enterprise analytics service', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('queries daily analytics across all linked organizations', async () => {
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([
            { organizationId: 'org-1' },
            { organizationId: 'org-2' }
        ]);
        prismaMock.orgAnalytics.groupBy.mockResolvedValue([
            {
                date: new Date('2026-02-01T00:00:00.000Z'),
                _sum: { views: 120, clicks: 40 }
            }
        ]);
        const result = await (0, analytics_service_1.getEnterpriseAnalyticsDaily)('ws-1', '30');
        (0, vitest_1.expect)(prismaMock.orgAnalytics.groupBy).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: vitest_1.expect.objectContaining({
                organizationId: { in: ['org-1', 'org-2'] }
            })
        }));
        (0, vitest_1.expect)(result.series).toEqual([
            { date: '2026-02-01', views: 120, clicks: 40 }
        ]);
    });
    (0, vitest_1.it)('groups hourly events correctly from OrgAnalyticsEvent', async () => {
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([
            { organizationId: 'org-1' }
        ]);
        prismaMock.orgAnalyticsEvent.findMany.mockResolvedValue([
            { eventType: 'view', createdAt: new Date('2026-02-02T10:10:00.000Z') },
            { eventType: 'click', createdAt: new Date('2026-02-02T10:45:00.000Z') },
            { eventType: 'view', createdAt: new Date('2026-02-02T11:01:00.000Z') }
        ]);
        const result = await (0, analytics_service_1.getEnterpriseAnalyticsHourly)('ws-1', '7');
        (0, vitest_1.expect)(result.hourly).toEqual([
            { hour: '2026-02-02T10:00:00.000Z', views: 1, clicks: 1 },
            { hour: '2026-02-02T11:00:00.000Z', views: 1, clicks: 0 }
        ]);
    });
    (0, vitest_1.it)('groups category analytics by Site->Category via OrgAnalyticsEvent', async () => {
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
        const result = await (0, analytics_service_1.getEnterpriseAnalyticsCategories)('ws-1', '30');
        (0, vitest_1.expect)(result.topCategoriesByClicks[0]).toEqual(vitest_1.expect.objectContaining({ categoryId: 'cat-1', clicks: 1 }));
        (0, vitest_1.expect)(result.topCategoriesByViews[0]).toEqual(vitest_1.expect.objectContaining({ categoryId: 'cat-1', views: 1 }));
        (0, vitest_1.expect)(result.trends.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('returns empty payloads when workspace has no linked organizations', async () => {
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([]);
        const [summary, daily, hourly, categories] = await Promise.all([
            (0, analytics_service_1.getEnterpriseAnalyticsSummary)('ws-empty', '30'),
            (0, analytics_service_1.getEnterpriseAnalyticsDaily)('ws-empty', '30'),
            (0, analytics_service_1.getEnterpriseAnalyticsHourly)('ws-empty', '30'),
            (0, analytics_service_1.getEnterpriseAnalyticsCategories)('ws-empty', '30')
        ]);
        (0, vitest_1.expect)(summary.totals).toEqual({ views: 0, clicks: 0, ctr: 0 });
        (0, vitest_1.expect)(summary.topOrgs).toEqual([]);
        (0, vitest_1.expect)(daily.series).toEqual([]);
        (0, vitest_1.expect)(hourly.hourly).toEqual([]);
        (0, vitest_1.expect)(categories.topCategories).toEqual([]);
        (0, vitest_1.expect)(categories.trends).toEqual([]);
    });
});
