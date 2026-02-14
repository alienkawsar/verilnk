import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reindexOrganizationSitesMock, prismaMock } = vi.hoisted(() => ({
    reindexOrganizationSitesMock: vi.fn(),
    prismaMock: {
        organization: {
            update: vi.fn(),
            findMany: vi.fn()
        },
        $transaction: vi.fn()
    }
}));

vi.mock('../db/client', () => ({
    prisma: prismaMock
}));

vi.mock('../services/meilisearch.service', () => ({
    indexSite: vi.fn(),
    removeSiteFromIndex: vi.fn(),
    reindexOrganizationSites: reindexOrganizationSitesMock
}));

import {
    bulkUpdateOrganizationPriority,
    updateOrganizationPriority
} from '../services/organization.service';

describe('organization priority reindex', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reindexes linked org sites when single organization priority changes', async () => {
        prismaMock.organization.update.mockResolvedValue({
            id: 'org-1',
            status: 'APPROVED'
        });
        reindexOrganizationSitesMock.mockResolvedValue({ organizationId: 'org-1', indexed: 2, removed: 0 });

        await updateOrganizationPriority('org-1', 'HIGH');

        expect(prismaMock.organization.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'org-1' },
                data: expect.objectContaining({ priority: 'HIGH' })
            })
        );
        expect(reindexOrganizationSitesMock).toHaveBeenCalledWith('org-1');
    });

    it('uses transaction for bulk priority update and reports reindex failures', async () => {
        prismaMock.$transaction.mockImplementation(async (callback: any) =>
            callback({
                organization: {
                    updateMany: vi.fn().mockResolvedValue({ count: 2 })
                }
            })
        );

        prismaMock.organization.findMany.mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);

        reindexOrganizationSitesMock.mockImplementation(async (orgId: string) => {
            if (orgId === 'org-2') {
                throw new Error('Meili unavailable');
            }
        });

        const result = await bulkUpdateOrganizationPriority(['org-1', 'org-2'], 'LOW');

        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        expect(reindexOrganizationSitesMock).toHaveBeenCalledTimes(2);
        expect(result.reindex.attempted).toBe(2);
        expect(result.reindex.failed).toBe(1);
        expect(result.reindex.failures[0]).toEqual(
            expect.objectContaining({ orgId: 'org-2', message: 'Meili unavailable' })
        );
    });
});
