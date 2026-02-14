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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const client_2 = require("../db/client");
const auditService = __importStar(require("../services/audit.service"));
const enterprise_linking_service_1 = require("../services/enterprise-linking.service");
const enterprise_quota_service_1 = require("../services/enterprise-quota.service");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateUser);
const resolveOrganizationIdForUser = async (userId) => {
    const user = await client_2.prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true }
    });
    return user?.organizationId || null;
};
const logOrgLinkAudit = async (req, action, entity, details, targetId) => {
    const userId = req.user?.id;
    if (!userId)
        return;
    let admin = await client_2.prisma.admin.findUnique({
        where: { id: userId },
        select: { id: true, role: true }
    });
    if (!admin && process.env.COMPLIANCE_SYSTEM_ADMIN_ID) {
        admin = await client_2.prisma.admin.findUnique({
            where: { id: process.env.COMPLIANCE_SYSTEM_ADMIN_ID },
            select: { id: true, role: true }
        });
    }
    if (!admin) {
        admin = await client_2.prisma.admin.findFirst({
            where: { role: 'SUPER_ADMIN' },
            select: { id: true, role: true },
            orderBy: { createdAt: 'asc' }
        });
    }
    if (!admin) {
        admin = await client_2.prisma.admin.findFirst({
            select: { id: true, role: true },
            orderBy: { createdAt: 'asc' }
        });
    }
    if (!admin)
        return;
    const actorDetails = admin.id === userId ? details : `${details} | actorUserId=${userId}`;
    await auditService.logAction({
        adminId: admin.id,
        actorRole: admin.role,
        action,
        entity,
        targetId,
        details: actorDetails,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
    });
};
router.get('/link-requests', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const organizationId = await resolveOrganizationIdForUser(userId);
        if (!organizationId) {
            return res.status(403).json({ message: 'Organization account required' });
        }
        const requests = await (0, enterprise_linking_service_1.listOrganizationPendingLinkRequests)(organizationId);
        res.json({ requests });
    }
    catch (error) {
        console.error('[Org Link Requests] List error:', error);
        res.status(500).json({ message: error.message || 'Failed to list link requests' });
    }
});
router.post('/link-requests/:requestId/approve', async (req, res) => {
    try {
        const requestId = Array.isArray(req.params.requestId)
            ? req.params.requestId[0]
            : req.params.requestId;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const organizationId = await resolveOrganizationIdForUser(userId);
        if (!organizationId) {
            return res.status(403).json({ message: 'Organization account required' });
        }
        const result = await (0, enterprise_linking_service_1.approveOrganizationLinkRequest)({
            requestId,
            organizationId,
            decisionByOrgUserId: userId
        });
        await logOrgLinkAudit(req, client_1.AuditActionType.APPROVE, 'EnterpriseOrgLinkRequest', `ENTERPRISE_LINK_REQUEST_APPROVED organization=${organizationId} request=${requestId} workspace=${result.link.workspaceId}`, requestId);
        res.json({ success: true, request: result.request, link: result.link });
    }
    catch (error) {
        console.error('[Org Link Requests] Approve error:', error);
        if ((0, enterprise_quota_service_1.isEnterpriseLimitReachedError)(error)) {
            res.status(409).json((0, enterprise_quota_service_1.toEnterpriseLimitResponse)(error));
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to approve link request' });
    }
});
router.post('/link-requests/:requestId/deny', async (req, res) => {
    try {
        const requestId = Array.isArray(req.params.requestId)
            ? req.params.requestId[0]
            : req.params.requestId;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const organizationId = await resolveOrganizationIdForUser(userId);
        if (!organizationId) {
            return res.status(403).json({ message: 'Organization account required' });
        }
        const request = await (0, enterprise_linking_service_1.denyOrganizationLinkRequest)({
            requestId,
            organizationId,
            decisionByOrgUserId: userId
        });
        await logOrgLinkAudit(req, client_1.AuditActionType.REJECT, 'EnterpriseOrgLinkRequest', `ENTERPRISE_LINK_REQUEST_DENIED organization=${organizationId} request=${requestId}`, requestId);
        res.json({ success: true, request });
    }
    catch (error) {
        console.error('[Org Link Requests] Deny error:', error);
        res.status(400).json({ message: error.message || 'Failed to deny link request' });
    }
});
exports.default = router;
