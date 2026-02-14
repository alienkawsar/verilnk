import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, listRequestsMock, approveMock, denyMock, logActionMock } = vi.hoisted(() => ({
    prismaMock: {
        user: {
            findUnique: vi.fn()
        },
        admin: {
            findUnique: vi.fn(),
            findFirst: vi.fn()
        }
    },
    listRequestsMock: vi.fn(),
    approveMock: vi.fn(),
    denyMock: vi.fn(),
    logActionMock: vi.fn()
}));

vi.mock('../middleware/auth.middleware', () => ({
    authenticateUser: (req: any, _res: any, next: any) => {
        req.user = { id: 'org-user-1' };
        next();
    }
}));

vi.mock('../db/client', () => ({
    prisma: prismaMock
}));

vi.mock('../services/enterprise-linking.service', () => ({
    listOrganizationPendingLinkRequests: listRequestsMock,
    approveOrganizationLinkRequest: approveMock,
    denyOrganizationLinkRequest: denyMock
}));

vi.mock('../services/audit.service', () => ({
    logAction: logActionMock
}));

import orgLinkRequestRoutes from '../routes/org.link-requests.routes';

describe('org link request routes', () => {
    const app = express();
    app.use(express.json());
    app.use('/', orgLinkRequestRoutes);

    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.user.findUnique.mockResolvedValue({ organizationId: 'org-1' });
        prismaMock.admin.findUnique.mockResolvedValue(null);
        prismaMock.admin.findFirst.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' });
    });

    it('approves request and writes audit log entry', async () => {
        approveMock.mockResolvedValue({
            request: { id: 'req-1', status: 'APPROVED' },
            link: { workspaceId: 'ws-1', organizationId: 'org-1' }
        });

        const res = await request(app).post('/link-requests/req-1/approve').send({});

        expect(res.status).toBe(200);
        expect(approveMock).toHaveBeenCalledWith({
            requestId: 'req-1',
            organizationId: 'org-1',
            decisionByOrgUserId: 'org-user-1'
        });
        expect(logActionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                entity: 'EnterpriseOrgLinkRequest',
                details: expect.stringContaining('ENTERPRISE_LINK_REQUEST_APPROVED')
            })
        );
    });

    it('denies request and writes audit log entry', async () => {
        denyMock.mockResolvedValue({
            id: 'req-2',
            status: 'DENIED'
        });

        const res = await request(app).post('/link-requests/req-2/deny').send({});

        expect(res.status).toBe(200);
        expect(denyMock).toHaveBeenCalledWith({
            requestId: 'req-2',
            organizationId: 'org-1',
            decisionByOrgUserId: 'org-user-1'
        });
        expect(logActionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                entity: 'EnterpriseOrgLinkRequest',
                details: expect.stringContaining('ENTERPRISE_LINK_REQUEST_DENIED')
            })
        );
    });

    it('returns 409 when approval exceeds enterprise linked organization quota', async () => {
        const { EnterpriseLimitReachedError } = await import('../services/enterprise-quota.service');
        approveMock.mockRejectedValue(
            new EnterpriseLimitReachedError('LINKED_ORGS', 5, 5)
        );

        const res = await request(app).post('/link-requests/req-3/approve').send({});

        expect(res.status).toBe(409);
        expect(res.body).toEqual(
            expect.objectContaining({
                error: 'LIMIT_REACHED',
                resource: 'LINKED_ORGS',
                limit: 5,
                current: 5
            })
        );
    });
});
