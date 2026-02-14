import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanStatus, PlanType } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        organization: {
            findUnique: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn()
        },
        enterpriseOrgLinkRequest: {
            findMany: vi.fn()
        },
        site: {
            findMany: vi.fn()
        }
    }
}));

vi.mock('../db/client', () => ({
    prisma: prismaMock
}));

vi.mock('../services/meilisearch.service', () => ({
    indexSite: vi.fn(),
    removeSiteFromIndex: vi.fn(),
    reindexOrganizationSites: vi.fn()
}));

import { updateOrganizationPlan } from '../services/organization.service';

describe('enterprise managed organization expiry sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.$queryRaw.mockResolvedValue([
            {
                enterpriseMaxWorkspaces: null,
                enterpriseMaxLinkedOrgs: null,
                enterpriseMaxApiKeys: null,
                enterpriseMaxMembers: null
            }
        ]);
        prismaMock.$executeRaw.mockResolvedValue(1);
    });

    it('syncs planEndAt only to enterprise-created managed organizations', async () => {
        prismaMock.organization.findUnique.mockResolvedValue({
            id: 'enterprise-org-1',
            name: 'Enterprise One',
            planType: PlanType.ENTERPRISE
        });
        prismaMock.organization.update.mockResolvedValue({
            id: 'enterprise-org-1',
            planType: PlanType.ENTERPRISE,
            planEndAt: new Date('2026-03-01T00:00:00.000Z'),
            status: 'PENDING'
        });
        prismaMock.enterpriseOrgLinkRequest.findMany.mockResolvedValue([
            { organizationId: 'managed-org-1' },
            { organizationId: 'managed-org-1' },
            { organizationId: 'managed-org-2' },
            { organizationId: 'enterprise-org-1' }
        ]);
        prismaMock.organization.updateMany.mockResolvedValue({ count: 2 });

        await updateOrganizationPlan('enterprise-org-1', {
            planType: PlanType.ENTERPRISE,
            planStatus: PlanStatus.ACTIVE,
            durationDays: 30
        });

        expect(prismaMock.enterpriseOrgLinkRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    enterpriseId: 'enterprise-org-1',
                    intentType: 'CREATE_UNDER_ENTERPRISE',
                    status: { in: ['PENDING_APPROVAL', 'APPROVED'] }
                })
            })
        );
        expect(prismaMock.organization.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: { in: ['managed-org-1', 'managed-org-2'] }
                }),
                data: expect.objectContaining({
                    planEndAt: new Date('2026-03-01T00:00:00.000Z')
                })
            })
        );
    });

    it('does not sync managed organizations when updated org is not enterprise plan', async () => {
        prismaMock.organization.findUnique.mockResolvedValue({
            id: 'business-org-1',
            name: 'Business One',
            planType: PlanType.BUSINESS
        });
        prismaMock.organization.update.mockResolvedValue({
            id: 'business-org-1',
            planType: PlanType.BUSINESS,
            planEndAt: new Date('2026-02-20T00:00:00.000Z'),
            status: 'PENDING'
        });

        await updateOrganizationPlan('business-org-1', {
            planType: PlanType.BUSINESS,
            planStatus: PlanStatus.ACTIVE,
            durationDays: 7
        });

        expect(prismaMock.enterpriseOrgLinkRequest.findMany).not.toHaveBeenCalled();
        expect(prismaMock.organization.updateMany).not.toHaveBeenCalled();
    });
});
