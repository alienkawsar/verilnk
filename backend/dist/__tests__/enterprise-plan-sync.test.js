"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const { prismaMock } = vitest_1.vi.hoisted(() => ({
    prismaMock: {
        $queryRaw: vitest_1.vi.fn(),
        $executeRaw: vitest_1.vi.fn(),
        organization: {
            findUnique: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(),
            updateMany: vitest_1.vi.fn()
        },
        enterpriseOrgLinkRequest: {
            findMany: vitest_1.vi.fn()
        },
        site: {
            findMany: vitest_1.vi.fn()
        }
    }
}));
vitest_1.vi.mock('../db/client', () => ({
    prisma: prismaMock
}));
vitest_1.vi.mock('../services/meilisearch.service', () => ({
    indexSite: vitest_1.vi.fn(),
    removeSiteFromIndex: vitest_1.vi.fn(),
    reindexOrganizationSites: vitest_1.vi.fn()
}));
const organization_service_1 = require("../services/organization.service");
(0, vitest_1.describe)('enterprise managed organization expiry sync', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
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
    (0, vitest_1.it)('syncs planEndAt only to enterprise-created managed organizations', async () => {
        prismaMock.organization.findUnique.mockResolvedValue({
            id: 'enterprise-org-1',
            name: 'Enterprise One',
            planType: client_1.PlanType.ENTERPRISE
        });
        prismaMock.organization.update.mockResolvedValue({
            id: 'enterprise-org-1',
            planType: client_1.PlanType.ENTERPRISE,
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
        await (0, organization_service_1.updateOrganizationPlan)('enterprise-org-1', {
            planType: client_1.PlanType.ENTERPRISE,
            planStatus: client_1.PlanStatus.ACTIVE,
            durationDays: 30
        });
        (0, vitest_1.expect)(prismaMock.enterpriseOrgLinkRequest.findMany).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: vitest_1.expect.objectContaining({
                enterpriseId: 'enterprise-org-1',
                intentType: 'CREATE_UNDER_ENTERPRISE',
                status: { in: ['PENDING_APPROVAL', 'APPROVED'] }
            })
        }));
        (0, vitest_1.expect)(prismaMock.organization.updateMany).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: vitest_1.expect.objectContaining({
                id: { in: ['managed-org-1', 'managed-org-2'] }
            }),
            data: vitest_1.expect.objectContaining({
                planEndAt: new Date('2026-03-01T00:00:00.000Z')
            })
        }));
    });
    (0, vitest_1.it)('does not sync managed organizations when updated org is not enterprise plan', async () => {
        prismaMock.organization.findUnique.mockResolvedValue({
            id: 'business-org-1',
            name: 'Business One',
            planType: client_1.PlanType.BUSINESS
        });
        prismaMock.organization.update.mockResolvedValue({
            id: 'business-org-1',
            planType: client_1.PlanType.BUSINESS,
            planEndAt: new Date('2026-02-20T00:00:00.000Z'),
            status: 'PENDING'
        });
        await (0, organization_service_1.updateOrganizationPlan)('business-org-1', {
            planType: client_1.PlanType.BUSINESS,
            planStatus: client_1.PlanStatus.ACTIVE,
            durationDays: 7
        });
        (0, vitest_1.expect)(prismaMock.enterpriseOrgLinkRequest.findMany).not.toHaveBeenCalled();
        (0, vitest_1.expect)(prismaMock.organization.updateMany).not.toHaveBeenCalled();
    });
});
