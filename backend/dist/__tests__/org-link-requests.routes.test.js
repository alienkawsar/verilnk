"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const { prismaMock, listRequestsMock, approveMock, denyMock, logActionMock } = vitest_1.vi.hoisted(() => ({
    prismaMock: {
        user: {
            findUnique: vitest_1.vi.fn()
        },
        admin: {
            findUnique: vitest_1.vi.fn(),
            findFirst: vitest_1.vi.fn()
        }
    },
    listRequestsMock: vitest_1.vi.fn(),
    approveMock: vitest_1.vi.fn(),
    denyMock: vitest_1.vi.fn(),
    logActionMock: vitest_1.vi.fn()
}));
vitest_1.vi.mock('../middleware/auth.middleware', () => ({
    authenticateUser: (req, _res, next) => {
        req.user = { id: 'org-user-1' };
        next();
    }
}));
vitest_1.vi.mock('../db/client', () => ({
    prisma: prismaMock
}));
vitest_1.vi.mock('../services/enterprise-linking.service', () => ({
    listOrganizationPendingLinkRequests: listRequestsMock,
    approveOrganizationLinkRequest: approveMock,
    denyOrganizationLinkRequest: denyMock
}));
vitest_1.vi.mock('../services/audit.service', () => ({
    logAction: logActionMock
}));
const org_link_requests_routes_1 = __importDefault(require("../routes/org.link-requests.routes"));
(0, vitest_1.describe)('org link request routes', () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use('/', org_link_requests_routes_1.default);
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        prismaMock.user.findUnique.mockResolvedValue({ organizationId: 'org-1' });
        prismaMock.admin.findUnique.mockResolvedValue(null);
        prismaMock.admin.findFirst.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' });
    });
    (0, vitest_1.it)('approves request and writes audit log entry', async () => {
        approveMock.mockResolvedValue({
            request: { id: 'req-1', status: 'APPROVED' },
            link: { workspaceId: 'ws-1', organizationId: 'org-1' }
        });
        const res = await (0, supertest_1.default)(app).post('/link-requests/req-1/approve').send({});
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(approveMock).toHaveBeenCalledWith({
            requestId: 'req-1',
            organizationId: 'org-1',
            decisionByOrgUserId: 'org-user-1'
        });
        (0, vitest_1.expect)(logActionMock).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            entity: 'EnterpriseOrgLinkRequest',
            details: vitest_1.expect.stringContaining('ENTERPRISE_LINK_REQUEST_APPROVED')
        }));
    });
    (0, vitest_1.it)('denies request and writes audit log entry', async () => {
        denyMock.mockResolvedValue({
            id: 'req-2',
            status: 'DENIED'
        });
        const res = await (0, supertest_1.default)(app).post('/link-requests/req-2/deny').send({});
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(denyMock).toHaveBeenCalledWith({
            requestId: 'req-2',
            organizationId: 'org-1',
            decisionByOrgUserId: 'org-user-1'
        });
        (0, vitest_1.expect)(logActionMock).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            entity: 'EnterpriseOrgLinkRequest',
            details: vitest_1.expect.stringContaining('ENTERPRISE_LINK_REQUEST_DENIED')
        }));
    });
    (0, vitest_1.it)('returns 409 when approval exceeds enterprise linked organization quota', async () => {
        const { EnterpriseLimitReachedError } = await Promise.resolve().then(() => __importStar(require('../services/enterprise-quota.service')));
        approveMock.mockRejectedValue(new EnterpriseLimitReachedError('LINKED_ORGS', 5, 5));
        const res = await (0, supertest_1.default)(app).post('/link-requests/req-3/approve').send({});
        (0, vitest_1.expect)(res.status).toBe(409);
        (0, vitest_1.expect)(res.body).toEqual(vitest_1.expect.objectContaining({
            error: 'LIMIT_REACHED',
            resource: 'LINKED_ORGS',
            limit: 5,
            current: 5
        }));
    });
});
