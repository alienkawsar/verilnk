import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceStatus } from '@prisma/client';

const { prismaMock, signupOrganizationMock } = vi.hoisted(() => ({
    prismaMock: {
        workspaceOrganization: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn()
        },
        organization: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn()
        },
        apiKey: {
            count: vi.fn()
        },
        workspaceMember: {
            count: vi.fn()
        },
        enterpriseOrgLinkRequest: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn()
        },
        workspace: {
            findUnique: vi.fn()
        },
        user: {
            findUnique: vi.fn()
        },
        admin: {
            findUnique: vi.fn()
        },
        $transaction: vi.fn(),
        $queryRaw: vi.fn()
    },
    signupOrganizationMock: vi.fn()
}));

vi.mock('../db/client', () => ({
    prisma: prismaMock
}));

vi.mock('../services/organization.service', () => ({
    signupOrganization: signupOrganizationMock
}));

import {
    approveOrganizationLinkRequest,
    createEnterpriseOrganizationAndLink,
    createWorkspaceLinkRequest,
    denyOrganizationLinkRequest
} from '../services/enterprise-linking.service';

describe('enterprise linking consent flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.workspaceOrganization.findMany.mockResolvedValue([{ workspaceId: 'ws-1' }]);
        prismaMock.apiKey.count.mockResolvedValue(0);
        prismaMock.workspaceMember.count.mockResolvedValue(0);
        prismaMock.$queryRaw.mockResolvedValue([{ count: 0 }]);
        prismaMock.enterpriseOrgLinkRequest.findMany.mockResolvedValue([]);
    });

    it('creates organization via signup pipeline and stores pending approval link intent', async () => {
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

        const result = await createEnterpriseOrganizationAndLink({
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

        expect(signupOrganizationMock).toHaveBeenCalledTimes(1);
        expect(signupOrganizationMock).toHaveBeenCalledWith(
            expect.objectContaining({
                orgName: 'New Org',
                email: 'owner@new-org.test',
                countryId: 'country-1',
                categoryId: 'cat-1',
                phone: '+15550001111',
                address: 'HQ',
                type: 'PUBLIC'
            })
        );
        expect(prismaMock.organization.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'org-new' },
                data: expect.objectContaining({
                    planType: 'BUSINESS',
                    planStatus: 'ACTIVE',
                    priority: 'HIGH'
                })
            })
        );
        expect(prismaMock.enterpriseOrgLinkRequest.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: 'PENDING_APPROVAL',
                    intentType: 'CREATE_UNDER_ENTERPRISE',
                    workspaceId: 'ws-1',
                    enterpriseId: 'org-enterprise',
                    organizationId: 'org-new'
                })
            })
        );
        expect(prismaMock.workspaceOrganization.create).not.toHaveBeenCalled();
        expect(result.linkRequest.status).toBe('PENDING_APPROVAL');
    });

    it('creates a PENDING link request and does not link organization directly', async () => {
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

        const request = await createWorkspaceLinkRequest({
            workspaceId: 'ws-1',
            enterpriseId: 'org-enterprise',
            requestedByUserId: 'user-1',
            identifier: 'owner@target.org'
        });

        expect(request.status).toBe('PENDING');
        expect(prismaMock.enterpriseOrgLinkRequest.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.workspaceOrganization.create).not.toHaveBeenCalled();
    });

    it('creates workspace link when organization approves request', async () => {
        prismaMock.$transaction.mockImplementation(async (callback: any) =>
            callback({
                enterpriseOrgLinkRequest: {
                    findFirst: vi.fn().mockResolvedValue({
                        id: 'req-approve',
                        workspaceId: 'ws-1',
                        organizationId: 'org-target',
                        requestedByUserId: 'enterprise-user-1'
                    }),
                    update: vi.fn().mockResolvedValue({
                        id: 'req-approve',
                        status: 'APPROVED'
                    })
                },
                workspace: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'ws-1',
                        status: WorkspaceStatus.ACTIVE
                    })
                },
                workspaceOrganization: {
                    findUnique: vi.fn().mockResolvedValue(null),
                    create: vi.fn().mockResolvedValue({
                        id: 'link-1',
                        workspaceId: 'ws-1',
                        organizationId: 'org-target'
                    })
                }
            })
        );

        const result = await approveOrganizationLinkRequest({
            requestId: 'req-approve',
            organizationId: 'org-target',
            decisionByOrgUserId: 'org-user-1'
        });

        expect(result.request.status).toBe('APPROVED');
        expect(result.link.workspaceId).toBe('ws-1');
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('denied request does not create workspace link', async () => {
        prismaMock.enterpriseOrgLinkRequest.findFirst.mockResolvedValue({
            id: 'req-deny',
            organizationId: 'org-target',
            status: 'PENDING'
        });
        prismaMock.enterpriseOrgLinkRequest.update.mockResolvedValue({
            id: 'req-deny',
            status: 'DENIED'
        });

        const result = await denyOrganizationLinkRequest({
            requestId: 'req-deny',
            organizationId: 'org-target',
            decisionByOrgUserId: 'org-user-1'
        });

        expect(result.status).toBe('DENIED');
        expect(prismaMock.workspaceOrganization.create).not.toHaveBeenCalled();
    });
});
