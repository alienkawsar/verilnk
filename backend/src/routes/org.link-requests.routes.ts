import { Router, Response } from 'express';
import { AuditActionType } from '@prisma/client';
import { authenticateUser, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../db/client';
import * as auditService from '../services/audit.service';
import {
    approveOrganizationLinkRequest,
    denyOrganizationLinkRequest,
    listOrganizationPendingLinkRequests
} from '../services/enterprise-linking.service';
import {
    isEnterpriseLimitReachedError,
    toEnterpriseLimitResponse
} from '../services/enterprise-quota.service';

const router = Router();

router.use(authenticateUser);

const resolveOrganizationIdForUser = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true }
    });
    return user?.organizationId || null;
};

const logOrgLinkAudit = async (
    req: AuthRequest,
    action: AuditActionType,
    entity: string,
    details: string,
    targetId?: string
) => {
    const userId = req.user?.id as string | undefined;
    if (!userId) return;

    let admin = await prisma.admin.findUnique({
        where: { id: userId },
        select: { id: true, role: true }
    });

    if (!admin && process.env.COMPLIANCE_SYSTEM_ADMIN_ID) {
        admin = await prisma.admin.findUnique({
            where: { id: process.env.COMPLIANCE_SYSTEM_ADMIN_ID },
            select: { id: true, role: true }
        });
    }

    if (!admin) {
        admin = await prisma.admin.findFirst({
            where: { role: 'SUPER_ADMIN' },
            select: { id: true, role: true },
            orderBy: { createdAt: 'asc' }
        });
    }

    if (!admin) {
        admin = await prisma.admin.findFirst({
            select: { id: true, role: true },
            orderBy: { createdAt: 'asc' }
        });
    }

    if (!admin) return;

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

router.get('/link-requests', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const organizationId = await resolveOrganizationIdForUser(userId);
        if (!organizationId) {
            return res.status(403).json({ message: 'Organization account required' });
        }

        const requests = await listOrganizationPendingLinkRequests(organizationId);
        res.json({ requests });
    } catch (error: any) {
        console.error('[Org Link Requests] List error:', error);
        res.status(500).json({ message: error.message || 'Failed to list link requests' });
    }
});

router.post('/link-requests/:requestId/approve', async (req: AuthRequest, res: Response) => {
    try {
        const requestId = Array.isArray(req.params.requestId)
            ? req.params.requestId[0]
            : req.params.requestId;
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const organizationId = await resolveOrganizationIdForUser(userId);
        if (!organizationId) {
            return res.status(403).json({ message: 'Organization account required' });
        }

        const result = await approveOrganizationLinkRequest({
            requestId,
            organizationId,
            decisionByOrgUserId: userId
        });

        await logOrgLinkAudit(
            req,
            AuditActionType.APPROVE,
            'EnterpriseOrgLinkRequest',
            `ENTERPRISE_LINK_REQUEST_APPROVED organization=${organizationId} request=${requestId} workspace=${result.link.workspaceId}`,
            requestId
        );

        res.json({ success: true, request: result.request, link: result.link });
    } catch (error: any) {
        console.error('[Org Link Requests] Approve error:', error);
        if (isEnterpriseLimitReachedError(error)) {
            res.status(409).json(toEnterpriseLimitResponse(error));
            return;
        }
        res.status(400).json({ message: error.message || 'Failed to approve link request' });
    }
});

router.post('/link-requests/:requestId/deny', async (req: AuthRequest, res: Response) => {
    try {
        const requestId = Array.isArray(req.params.requestId)
            ? req.params.requestId[0]
            : req.params.requestId;
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const organizationId = await resolveOrganizationIdForUser(userId);
        if (!organizationId) {
            return res.status(403).json({ message: 'Organization account required' });
        }

        const request = await denyOrganizationLinkRequest({
            requestId,
            organizationId,
            decisionByOrgUserId: userId
        });

        await logOrgLinkAudit(
            req,
            AuditActionType.REJECT,
            'EnterpriseOrgLinkRequest',
            `ENTERPRISE_LINK_REQUEST_DENIED organization=${organizationId} request=${requestId}`,
            requestId
        );

        res.json({ success: true, request });
    } catch (error: any) {
        console.error('[Org Link Requests] Deny error:', error);
        res.status(400).json({ message: error.message || 'Failed to deny link request' });
    }
});

export default router;
