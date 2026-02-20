"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { reindexOrganizationSitesMock, prismaMock } = vitest_1.vi.hoisted(() => ({
    reindexOrganizationSitesMock: vitest_1.vi.fn(),
    prismaMock: {
        organization: {
            update: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn()
        },
        $transaction: vitest_1.vi.fn()
    }
}));
vitest_1.vi.mock('../db/client', () => ({
    prisma: prismaMock
}));
vitest_1.vi.mock('../services/meilisearch.service', () => ({
    indexSite: vitest_1.vi.fn(),
    removeSiteFromIndex: vitest_1.vi.fn(),
    reindexOrganizationSites: reindexOrganizationSitesMock
}));
const organization_service_1 = require("../services/organization.service");
(0, vitest_1.describe)('organization priority reindex', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('reindexes linked org sites when single organization priority changes', async () => {
        prismaMock.organization.update.mockResolvedValue({
            id: 'org-1',
            status: 'APPROVED'
        });
        reindexOrganizationSitesMock.mockResolvedValue({ organizationId: 'org-1', indexed: 2, removed: 0 });
        await (0, organization_service_1.updateOrganizationPriority)('org-1', 'HIGH');
        (0, vitest_1.expect)(prismaMock.organization.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: { id: 'org-1' },
            data: vitest_1.expect.objectContaining({ priority: 'HIGH' })
        }));
        (0, vitest_1.expect)(reindexOrganizationSitesMock).toHaveBeenCalledWith('org-1');
    });
    (0, vitest_1.it)('uses transaction for bulk priority update and reports reindex failures', async () => {
        prismaMock.$transaction.mockImplementation(async (callback) => callback({
            organization: {
                updateMany: vitest_1.vi.fn().mockResolvedValue({ count: 2 })
            }
        }));
        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);
        reindexOrganizationSitesMock.mockImplementation(async (orgId) => {
            if (orgId === 'org-2') {
                throw new Error('Meili unavailable');
            }
        });
        const result = await (0, organization_service_1.bulkUpdateOrganizationPriority)(['org-1', 'org-2'], 'LOW');
        (0, vitest_1.expect)(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(reindexOrganizationSitesMock).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(result.reindex.attempted).toBe(2);
        (0, vitest_1.expect)(result.reindex.failed).toBe(1);
        (0, vitest_1.expect)(result.reindex.failures[0]).toEqual(vitest_1.expect.objectContaining({ orgId: 'org-2', message: 'Meili unavailable' }));
    });
});
