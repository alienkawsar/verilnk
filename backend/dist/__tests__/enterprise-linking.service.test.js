"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const { prismaMock, signupOrganizationMock } = vitest_1.vi.hoisted(() => ({
    prismaMock: {
        workspaceOrganization: {
            findUnique: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            create: vitest_1.vi.fn()
        },
        organization: {
            findFirst: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            findUnique: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn()
        },
        apiKey: {
            count: vitest_1.vi.fn()
        },
        workspaceMember: {
            count: vitest_1.vi.fn()
        },
        invite: {
            count: vitest_1.vi.fn()
        },
        enterpriseOrgLinkRequest: {
            findFirst: vitest_1.vi.fn(),
            findMany: vitest_1.vi.fn(),
            create: vitest_1.vi.fn(),
            update: vitest_1.vi.fn()
        },
        workspace: {
            findUnique: vitest_1.vi.fn()
        },
        user: {
            findUnique: vitest_1.vi.fn()
        },
        admin: {
            findUnique: vitest_1.vi.fn()
        },
        $transaction: vitest_1.vi.fn(),
        $queryRaw: vitest_1.vi.fn()
    },
    signupOrganizationMock: vitest_1.vi.fn()
}));
vitest_1.vi.mock('../db/client', () => ({
    prisma: prismaMock
}));
vitest_1.vi.mock('../services/organization.service', () => ({
    signupOrganization: signupOrganizationMock
}));
const enterprise_linking_service_1 = require("../services/enterprise-linking.service");
(0, vitest_1.describe)('enterprise linking consent flow', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([{ workspaceId: 'ws-1' }]);
        prismaMock.apiKey.count.mockResolvedValue(0);
        prismaMock.workspaceMember.count.mockResolvedValue(0);
        prismaMock.invite.count.mockResolvedValue(0);
        prismaMock.$queryRaw.mockResolvedValue([{ count: 0 }]);
        prismaMock.enterpriseOrgLinkRequest.findMany.mockResolvedValue([]);
    });
    (0, vitest_1.it)('creates organization via signup pipeline and stores pending approval link intent', async () => {
        prismaMock.workspaceOrganization.findUnique.mockResolvedValue({ id: 'scope-ok' });
        prismaMock.organization.findUnique.mockResolvedValue({
            id: 'org-enterprise',
            planEndAt: new Date('2026-12-31T00:00:00.000Z')
        });
        signupOrganizationMock.mockResolvedValue({
            org: { id: 'org-new', status: 'PENDING' },
            site: { id: 'site-new', status: 'PENDING' }
        });
        prismaMock.organization.update.mockResolvedValue({
            id: 'org-new',
            status: 'PENDING',
            planType: 'BUSINESS',
            priority: 'HIGH'
        });
        prismaMock.enterpriseOrgLinkRequest.create.mockResolvedValue({
            id: 'req-pending-approval',
            organizationId: 'org-new',
            workspaceId: 'ws-1',
            enterpriseId: 'org-enterprise',
            status: 'PENDING_APPROVAL'
        });
        const result = await (0, enterprise_linking_service_1.createEnterpriseOrganizationAndLink)({
            workspaceId: 'ws-1',
            enterpriseId: 'org-enterprise',
            createdByUserId: 'user-1',
            orgName: 'New Org',
            email: 'owner@new-org.test',
            password: 'StrongPass!234',
            website: 'https://new-org.test',
            phone: '+15550001111',
            address: 'HQ',
            countryId: 'country-1',
            categoryId: 'cat-1',
            type: 'PUBLIC'
        });
        (0, vitest_1.expect)(signupOrganizationMock).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(signupOrganizationMock).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            orgName: 'New Org',
            email: 'owner@new-org.test',
            countryId: 'country-1',
            categoryId: 'cat-1',
            phone: '+15550001111',
            address: 'HQ',
            type: 'PUBLIC'
        }));
        (0, vitest_1.expect)(prismaMock.organization.update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: { id: 'org-new' },
            data: vitest_1.expect.objectContaining({
                planType: 'BUSINESS',
                planStatus: 'ACTIVE',
                priority: 'HIGH'
            })
        }));
        (0, vitest_1.expect)(prismaMock.enterpriseOrgLinkRequest.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            data: vitest_1.expect.objectContaining({
                status: 'PENDING_APPROVAL',
                intentType: 'CREATE_UNDER_ENTERPRISE',
                workspaceId: 'ws-1',
                enterpriseId: 'org-enterprise',
                organizationId: 'org-new'
            })
        }));
        (0, vitest_1.expect)(prismaMock.workspaceOrganization.create).not.toHaveBeenCalled();
        (0, vitest_1.expect)(result.linkRequest.status).toBe('PENDING_APPROVAL');
    });
    (0, vitest_1.it)('creates a PENDING link request and does not link organization directly', async () => {
        prismaMock.workspaceOrganization.findUnique
            .mockResolvedValueOnce({ id: 'scope-ok' })
            .mockResolvedValueOnce(null);
        prismaMock.organization.findFirst.mockResolvedValue({
            id: 'org-target',
            name: 'Target Org',
            slug: 'target-org',
            email: 'owner@target.org',
            website: 'https://target.org'
        });
        prismaMock.organization.findMany.mockResolvedValue([]);
        prismaMock.enterpriseOrgLinkRequest.findFirst.mockResolvedValue(null);
        prismaMock.enterpriseOrgLinkRequest.create.mockResolvedValue({
            id: 'req-1',
            enterpriseId: 'org-enterprise',
            workspaceId: 'ws-1',
            organizationId: 'org-target',
            status: 'PENDING'
        });
        const request = await (0, enterprise_linking_service_1.createWorkspaceLinkRequest)({
            workspaceId: 'ws-1',
            enterpriseId: 'org-enterprise',
            requestedByUserId: 'user-1',
            identifier: 'owner@target.org'
        });
        (0, vitest_1.expect)(request.status).toBe('PENDING');
        (0, vitest_1.expect)(prismaMock.enterpriseOrgLinkRequest.create).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(prismaMock.workspaceOrganization.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('creates a PENDING link request when using organization ID method', async () => {
        const orgId = '550e8400-e29b-41d4-a716-446655440000';
        prismaMock.workspaceOrganization.findUnique
            .mockResolvedValueOnce({ id: 'scope-ok' })
            .mockResolvedValueOnce(null);
        prismaMock.organization.findFirst.mockResolvedValue({
            id: 'org-target',
            name: 'Target Org',
            slug: 'target-org',
            email: 'owner@target.org',
            website: 'https://target.org'
        });
        prismaMock.enterpriseOrgLinkRequest.findFirst.mockResolvedValue(null);
        prismaMock.enterpriseOrgLinkRequest.create.mockResolvedValue({
            id: 'req-org-id',
            enterpriseId: 'org-enterprise',
            workspaceId: 'ws-1',
            organizationId: 'org-target',
            status: 'PENDING'
        });
        const request = await (0, enterprise_linking_service_1.createWorkspaceLinkRequest)({
            workspaceId: 'ws-1',
            enterpriseId: 'org-enterprise',
            requestedByUserId: 'user-1',
            linkMethod: 'ORG_ID',
            organizationId: orgId
        });
        (0, vitest_1.expect)(request.status).toBe('PENDING');
        (0, vitest_1.expect)(prismaMock.organization.findFirst).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            where: vitest_1.expect.objectContaining({ id: orgId })
        }));
        (0, vitest_1.expect)(prismaMock.workspaceOrganization.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('creates workspace link when organization approves request', async () => {
        prismaMock.$transaction.mockImplementation(async (callback) => callback({
            enterpriseOrgLinkRequest: {
                findFirst: vitest_1.vi.fn().mockResolvedValue({
                    id: 'req-approve',
                    workspaceId: 'ws-1',
                    enterpriseId: 'org-enterprise',
                    organizationId: 'org-target',
                    status: 'PENDING',
                    requestedByUserId: 'enterprise-user-1'
                }),
                update: vitest_1.vi.fn().mockResolvedValue({
                    id: 'req-approve',
                    status: 'APPROVED'
                })
            },
            workspace: {
                findUnique: vitest_1.vi.fn().mockResolvedValue({
                    id: 'ws-1',
                    status: client_1.WorkspaceStatus.ACTIVE
                })
            },
            workspaceOrganization: {
                findUnique: vitest_1.vi.fn().mockResolvedValue(null),
                create: vitest_1.vi.fn().mockResolvedValue({
                    id: 'link-1',
                    workspaceId: 'ws-1',
                    organizationId: 'org-target'
                })
            }
        }));
        const result = await (0, enterprise_linking_service_1.approveOrganizationLinkRequest)({
            requestId: 'req-approve',
            organizationId: 'org-target',
            decisionByOrgUserId: 'org-user-1'
        });
        (0, vitest_1.expect)(result.request.status).toBe('APPROVED');
        (0, vitest_1.expect)(result.link.workspaceId).toBe('ws-1');
        (0, vitest_1.expect)(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('denied request does not create workspace link', async () => {
        prismaMock.enterpriseOrgLinkRequest.findFirst.mockResolvedValue({
            id: 'req-deny',
            organizationId: 'org-target',
            status: 'PENDING'
        });
        prismaMock.enterpriseOrgLinkRequest.update.mockResolvedValue({
            id: 'req-deny',
            status: 'DENIED'
        });
        const result = await (0, enterprise_linking_service_1.denyOrganizationLinkRequest)({
            requestId: 'req-deny',
            organizationId: 'org-target',
            decisionByOrgUserId: 'org-user-1'
        });
        (0, vitest_1.expect)(result.status).toBe('DENIED');
        (0, vitest_1.expect)(prismaMock.workspaceOrganization.create).not.toHaveBeenCalled();
    });
});
