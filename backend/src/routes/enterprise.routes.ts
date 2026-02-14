/**
 * Enterprise Dashboard Routes
 * 
 * Routes for managing workspaces, members, API keys, and viewing usage.
 * All routes require user authentication with enterprise entitlements.
 */

import { Router, Response } from 'express';
import { authenticateUser, AuthRequest } from '../middleware/auth.middleware';
import {
    getUserEnterpriseAccess,
    getUserWorkspaceRole,
    canPerformWorkspaceAction,
    API_SCOPES,
    validateScopes
} from '../services/enterprise.entitlement';
import {
    createWorkspace,
    getWorkspaceById,
    getUserWorkspaces,
    updateWorkspace,
    deleteWorkspace,
    addWorkspaceMember,
    updateMemberRole,
    removeMember,
    transferOwnership,
    getWorkspaceMembers,
    createWorkspaceInvite,
    acceptWorkspaceInvite,
    getWorkspaceInvites,
    revokeWorkspaceInvite,
    unlinkOrganization,
    getLinkedOrganizations
} from '../services/workspace.service';
import {
    cancelWorkspaceLinkRequest,
    createEnterpriseOrganizationAndLink,
    createWorkspaceLinkRequest,
    listWorkspaceLinkRequests
} from '../services/enterprise-linking.service';
import {
    createApiKey,
    listApiKeys,
    getApiKeyById,
    revokeApiKey,
    rotateApiKey,
    getWorkspaceUsageLogs,
    getWorkspaceUsageStats
} from '../services/apikey.service';
import {
    AuditActionType,
    OrgType,
    WorkspaceMemberRole
} from '@prisma/client';
import { prisma } from '../db/client';
import * as auditService from '../services/audit.service';
import {
    getEnterpriseAnalyticsOverview,
    getEnterpriseAnalyticsDaily,
    getEnterpriseAnalyticsSummary,
    getEnterpriseAnalyticsHourly,
    getEnterpriseAnalyticsHeatmap,
    getEnterpriseAnalyticsCategories,
    getEnterpriseAnalyticsExportData
} from '../services/analytics.service';
import { z } from 'zod';
import * as requestService from '../services/request.service';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '../utils/passwordPolicy';
import {
    isEnterpriseLimitReachedError,
    toEnterpriseLimitResponse
} from '../services/enterprise-quota.service';

const router = Router();

// All routes require user authentication
router.use(authenticateUser);

const normalizeRange = (value: unknown, fallback: '7' | '30' | '90' = '30'): '7' | '30' | '90' => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === '7' || normalized === '7d') return '7';
    if (normalized === '30' || normalized === '30d') return '30';
    if (normalized === '90' || normalized === '90d') return '90';
    return fallback;
};

const resolveWorkspaceRole = async (
    workspaceId: string,
    userId: string
): Promise<'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER' | null> => {
    return getUserWorkspaceRole(workspaceId, userId);
};

const getAppBaseUrl = (): string => {
    return process.env.FRONTEND_URL
        || process.env.APP_URL
        || process.env.NEXT_PUBLIC_APP_URL
        || 'http://localhost:3000';
};

const handleEnterpriseLimitError = (res: Response, error: unknown): boolean => {
    if (!isEnterpriseLimitReachedError(error)) {
        return false;
    }

    res.status(409).json(toEnterpriseLimitResponse(error));
    return true;
};

type EnterpriseWorkspaceRole = 'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER';

const WORKSPACE_ROLE_PRIORITY: Record<EnterpriseWorkspaceRole, number> = {
    OWNER: 0,
    ADMIN: 1,
    EDITOR: 2,
    ANALYST: 3,
    VIEWER: 4
};

const PROFILE_EDIT_ROLES: EnterpriseWorkspaceRole[] = ['OWNER', 'ADMIN'];

const enterpriseProfileUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    website: z.string().url().optional().or(z.literal('')),
    phone: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    countryId: z.string().uuid().optional(),
    stateId: z.union([z.string().uuid(), z.string().length(0), z.null()]).optional(),
    categoryId: z.union([z.string().uuid(), z.string().length(0), z.null()]).optional(),
    about: z.string().optional(),
    logo: z.string().optional()
});

const createEnterpriseOrganizationSchema = z.object({
    orgName: z.string().min(1),
    email: z.string().email(),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE),
    website: z.string().url(),
    phone: z.string().min(1),
    address: z.string().min(1),
    countryId: z.string().uuid(),
    stateId: z.union([z.string().uuid(), z.string().length(0), z.null()]).optional(),
    categoryId: z.string().uuid(),
    type: z.nativeEnum(OrgType),
    about: z.string().optional(),
    logo: z.string().optional()
});

const createLinkRequestSchema = z.object({
    identifier: z.string().min(2),
    message: z.string().max(500).optional()
});

const resolveEnterpriseProfileContext = async (userId: string) => {
    const access = await getUserEnterpriseAccess(userId);
    if (!access.hasAccess || !access.organizationId) return null;

    const organization = await prisma.organization.findFirst({
        where: {
            id: access.organizationId,
            deletedAt: null
        },
        include: {
            country: true,
            state: true,
            category: true
        }
    });

    if (!organization) return null;

    const workspaceMemberships = await prisma.workspaceMember.findMany({
        where: {
            userId,
            workspace: {
                organizations: {
                    some: { organizationId: access.organizationId }
                }
            }
        },
        select: { role: true }
    });

    const sortedRoles = workspaceMemberships
        .map((membership) => membership.role as EnterpriseWorkspaceRole)
        .filter((role): role is EnterpriseWorkspaceRole =>
            ['OWNER', 'ADMIN', 'ANALYST', 'EDITOR', 'VIEWER'].includes(role)
        )
        .sort((a, b) => WORKSPACE_ROLE_PRIORITY[a] - WORKSPACE_ROLE_PRIORITY[b]);

    const role = sortedRoles[0] || null;
    const canEdit = role ? PROFILE_EDIT_ROLES.includes(role) : false;

    return {
        access,
        organization,
        role,
        canEdit
    };
};

const logEnterpriseAdminActionIfApplicable = async (
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

// ============================================
// Workspace CRUD
// ============================================

// List user's workspaces
router.get('/workspaces', async (req: AuthRequest, res: Response) => {
    try {
        const workspaces = await getUserWorkspaces(req.user.id as string);
        res.json({ workspaces });
    } catch (error: any) {
        console.error('[Enterprise] List workspaces error:', error);
        res.status(500).json({ message: error.message || 'Failed to list workspaces' });
    }
});

// Create workspace
router.post('/workspaces', async (req: AuthRequest, res: Response) => {
    try {
        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            return res.status(400).json({ message: 'Workspace name must be at least 2 characters' });
        }

        const workspace = await createWorkspace({
            name: name.trim(),
            ownerId: req.user.id as string
        });

        res.status(201).json({ workspace });
    } catch (error: any) {
        console.error('[Enterprise] Create workspace error:', error);
        if (handleEnterpriseLimitError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to create workspace' });
    }
});

// Get workspace details
router.get('/workspaces/:id', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await getUserWorkspaceRole(id, req.user.id as string);

        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const workspace = await getWorkspaceById(id);
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        res.json({ workspace, role });
    } catch (error: any) {
        console.error('[Enterprise] Get workspace error:', error);
        res.status(500).json({ message: error.message || 'Failed to get workspace' });
    }
});

// Update workspace
router.patch('/workspaces/:id', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { name } = req.body;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const workspace = await updateWorkspace(id, { name });
        res.json({ workspace });
    } catch (error: any) {
        console.error('[Enterprise] Update workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to update workspace' });
    }
});

// Delete workspace (OWNER only)
router.delete('/workspaces/:id', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'delete_workspace')) {
            return res.status(403).json({ message: 'Only the owner can delete a workspace' });
        }

        await deleteWorkspace(id);
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Delete workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to delete workspace' });
    }
});

// ============================================
// Member Management
// ============================================

// List members
router.get('/workspaces/:id/members', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const members = await getWorkspaceMembers(id);
        res.json({ members });
    } catch (error: any) {
        console.error('[Enterprise] List members error:', error);
        res.status(500).json({ message: error.message || 'Failed to list members' });
    }
});

// Add member (by email lookup)
router.post('/workspaces/:id/members', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { email, role: memberRole } = req.body;

        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ message: 'Valid email address is required' });
        }

        const currentRole = await getUserWorkspaceRole(id, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Validate role
        const validRoles: WorkspaceMemberRole[] = ['ADMIN', 'ANALYST', 'EDITOR', 'VIEWER'];
        if (!validRoles.includes(memberRole)) {
            return res.status(400).json({ message: 'Invalid role. Must be one of: ADMIN, ANALYST, EDITOR, VIEWER' });
        }

        // Lookup user by email
        const { prisma } = await import('../db/client');
        const targetUser = await prisma.user.findFirst({
            where: { email: email.trim().toLowerCase() },
            select: { id: true, name: true, email: true }
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'No user found with that email. They must register on VeriLnk first.' });
        }

        const member = await addWorkspaceMember(id, targetUser.id, memberRole, req.user.id as string);
        res.status(201).json({ member });
    } catch (error: any) {
        console.error('[Enterprise] Add member error:', error);
        if (handleEnterpriseLimitError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to add member' });
    }
});

// ============================================
// Invite Management
// ============================================

router.get('/workspaces/:id/invites', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const invites = await getWorkspaceInvites(id);
        res.json({ invites });
    } catch (error: any) {
        console.error('[Enterprise] List invites error:', error);
        res.status(500).json({ message: error.message || 'Failed to list invites' });
    }
});

router.post('/workspaces/:id/invites', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { email, role: inviteRole } = req.body as {
            email?: string;
            role?: WorkspaceMemberRole;
        };

        const currentRole = await resolveWorkspaceRole(id, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ message: 'Valid email address is required' });
        }

        const validRoles: WorkspaceMemberRole[] = ['ADMIN', 'ANALYST', 'EDITOR', 'VIEWER'];
        const safeRole: WorkspaceMemberRole = validRoles.includes(inviteRole as WorkspaceMemberRole)
            ? inviteRole as WorkspaceMemberRole
            : 'VIEWER';

        const { invite, token } = await createWorkspaceInvite(
            id,
            email,
            safeRole,
            req.user.id as string
        );

        const inviteLink = `${getAppBaseUrl()}/enterprise/invite?token=${encodeURIComponent(token)}`;
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.CREATE,
            'WorkspaceInvite',
            `Created workspace invite for ${invite.invitedEmail || invite.invitedUserId || 'unknown user'}`,
            invite.id
        );
        res.status(201).json({
            invite: {
                id: invite.id,
                invitedEmail: invite.invitedEmail,
                invitedUserId: invite.invitedUserId,
                role: invite.role,
                status: invite.status,
                expiresAt: invite.expiresAt,
                acceptedAt: invite.acceptedAt,
                createdAt: invite.createdAt
            },
            inviteLink: process.env.NODE_ENV === 'production' ? null : inviteLink
        });
    } catch (error: any) {
        console.error('[Enterprise] Create invite error:', error);
        if (handleEnterpriseLimitError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to create invite' });
    }
});

router.post('/workspaces/:id/invites/:inviteId/revoke', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const inviteId = req.params.inviteId as string;

        const currentRole = await resolveWorkspaceRole(id, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        await revokeWorkspaceInvite(id, inviteId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'WorkspaceInvite',
            `Revoked workspace invite ${inviteId}`,
            inviteId
        );
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Revoke invite error:', error);
        res.status(400).json({ message: error.message || 'Failed to revoke invite' });
    }
});

router.post('/invites/accept', async (req: AuthRequest, res: Response) => {
    try {
        const { token } = req.body as { token?: string };
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ message: 'Invite token is required' });
        }

        const member = await acceptWorkspaceInvite(token, req.user.id as string);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'WorkspaceInvite',
            `Accepted workspace invite for workspace ${member.workspaceId}`,
            member.id
        );
        res.json({ success: true, member });
    } catch (error: any) {
        console.error('[Enterprise] Accept invite error:', error);
        res.status(400).json({ message: error.message || 'Failed to accept invite' });
    }
});

// Update member role
router.patch('/workspaces/:id/members/:userId', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const userId = req.params.userId as string;
        const { role: newRole } = req.body;

        const currentRole = await getUserWorkspaceRole(id, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const member = await updateMemberRole(id, userId, newRole);
        res.json({ member });
    } catch (error: any) {
        console.error('[Enterprise] Update member error:', error);
        res.status(400).json({ message: error.message || 'Failed to update member' });
    }
});

// Remove member
router.delete('/workspaces/:id/members/:userId', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const userId = req.params.userId as string;

        const currentRole = await getUserWorkspaceRole(id, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        await removeMember(id, userId);
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Remove member error:', error);
        res.status(400).json({ message: error.message || 'Failed to remove member' });
    }
});

// Transfer ownership (OWNER only)
router.post('/workspaces/:id/transfer', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { newOwnerId } = req.body;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'transfer_ownership')) {
            return res.status(403).json({ message: 'Only the owner can transfer ownership' });
        }

        await transferOwnership(id, req.user.id as string, newOwnerId);
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Transfer ownership error:', error);
        res.status(400).json({ message: error.message || 'Failed to transfer ownership' });
    }
});

// ============================================
// Organization Linking
// ============================================

/**
 * Security note:
 * Previous implementation allowed global organization discovery and direct linking
 * by raw organizationId from enterprise workspaces. That enabled linking without
 * target-organization consent. The flow below is consent-based only.
 */

// List linked organizations
router.get('/workspaces/:id/organizations', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const organizations = await getLinkedOrganizations(id);
        res.json({ organizations });
    } catch (error: any) {
        console.error('[Enterprise] List linked orgs error:', error);
        res.status(500).json({ message: error.message || 'Failed to list organizations' });
    }
});

const createWorkspaceOrganizationHandler = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'link_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const enterpriseAccess = await getUserEnterpriseAccess(req.user.id as string);
        if (!enterpriseAccess.hasAccess || !enterpriseAccess.organizationId) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }

        const payload = createEnterpriseOrganizationSchema.parse(req.body);
        const result = await createEnterpriseOrganizationAndLink({
            workspaceId: id,
            enterpriseId: enterpriseAccess.organizationId,
            createdByUserId: req.user.id as string,
            orgName: payload.orgName,
            email: payload.email,
            password: payload.password,
            website: payload.website,
            phone: payload.phone,
            address: payload.address,
            countryId: payload.countryId,
            stateId: payload.stateId || null,
            categoryId: payload.categoryId,
            type: payload.type,
            about: payload.about,
            logo: payload.logo
        });

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.CREATE,
            'EnterpriseOrgLinkRequest',
            `ENTERPRISE_ORG_CREATED enterprise=${enterpriseAccess.organizationId} workspace=${id} organization=${result.organization.id} request=${result.linkRequest.id} status=PENDING_APPROVAL`,
            result.organization.id
        );

        res.status(201).json({
            organization: result.organization,
            linkRequest: result.linkRequest
        });
    } catch (error: any) {
        console.error('[Enterprise] Create org for workspace error:', error);
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.issues });
        }
        if (handleEnterpriseLimitError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to create organization' });
    }
};

// Create organization under enterprise via org signup pipeline (PENDING approval)
router.post('/workspaces/:id/organizations/create', createWorkspaceOrganizationHandler);
// Backwards-compatible alias
router.post('/workspaces/:id/organizations', createWorkspaceOrganizationHandler);

// List enterprise link requests for workspace
router.get('/workspaces/:id/link-requests', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'link_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const enterpriseAccess = await getUserEnterpriseAccess(req.user.id as string);
        if (!enterpriseAccess.hasAccess || !enterpriseAccess.organizationId) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }

        const requests = await listWorkspaceLinkRequests(id, enterpriseAccess.organizationId);
        res.json({ requests });
    } catch (error: any) {
        console.error('[Enterprise] List link requests error:', error);
        res.status(500).json({ message: error.message || 'Failed to list link requests' });
    }
});

// Request linking an existing organization (consent required from target org)
router.post('/workspaces/:id/link-requests', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const payload = createLinkRequestSchema.parse(req.body);

        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'link_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const enterpriseAccess = await getUserEnterpriseAccess(req.user.id as string);
        if (!enterpriseAccess.hasAccess || !enterpriseAccess.organizationId) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }

        const request = await createWorkspaceLinkRequest({
            workspaceId: id,
            enterpriseId: enterpriseAccess.organizationId,
            requestedByUserId: req.user.id as string,
            identifier: payload.identifier,
            message: payload.message
        });

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.CREATE,
            'EnterpriseOrgLinkRequest',
            `ENTERPRISE_LINK_REQUEST_CREATED enterprise=${enterpriseAccess.organizationId} workspace=${id} organization=${request.organizationId}`,
            request.id
        );
        res.status(201).json({ request });
    } catch (error: any) {
        console.error('[Enterprise] Create link request error:', error);
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.issues });
        }
        if (handleEnterpriseLimitError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to create link request' });
    }
});

// Cancel pending link request
router.post('/link-requests/:id/cancel', async (req: AuthRequest, res: Response) => {
    try {
        const requestId = req.params.id as string;

        const enterpriseAccess = await getUserEnterpriseAccess(req.user.id as string);
        if (!enterpriseAccess.hasAccess || !enterpriseAccess.organizationId) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }

        await cancelWorkspaceLinkRequest({
            requestId,
            enterpriseId: enterpriseAccess.organizationId,
            requestedByUserId: req.user.id as string
        });

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'EnterpriseOrgLinkRequest',
            `ENTERPRISE_LINK_REQUEST_CANCELED enterprise=${enterpriseAccess.organizationId} request=${requestId}`,
            requestId
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Cancel link request error:', error);
        res.status(400).json({ message: error.message || 'Failed to cancel link request' });
    }
});

// Unlink organization
router.delete('/workspaces/:id/organizations/:orgId', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const orgId = req.params.orgId as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'unlink_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        await unlinkOrganization(id, orgId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.DELETE,
            'WorkspaceOrganization',
            `ENTERPRISE_ORG_UNLINKED workspace=${id} organization=${orgId}`,
            orgId
        );
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Unlink org error:', error);
        res.status(400).json({ message: error.message || 'Failed to unlink organization' });
    }
});

// Alias: Unlink organization
router.post('/workspaces/:id/organizations/unlink', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { organizationId } = req.body as { organizationId?: string };

        if (!organizationId) {
            return res.status(400).json({ message: 'organizationId is required' });
        }

        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'unlink_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        await unlinkOrganization(id, organizationId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.DELETE,
            'WorkspaceOrganization',
            `ENTERPRISE_ORG_UNLINKED workspace=${id} organization=${organizationId}`,
            organizationId
        );
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Unlink org alias error:', error);
        res.status(400).json({ message: error.message || 'Failed to unlink organization' });
    }
});

// ============================================
// API Key Management
// ============================================

// List API keys
router.get('/workspaces/:id/api-keys', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const apiKeys = await listApiKeys(id);
        res.json({ apiKeys });
    } catch (error: any) {
        console.error('[Enterprise] List API keys error:', error);
        res.status(500).json({ message: error.message || 'Failed to list API keys' });
    }
});

// Create API key
router.post('/workspaces/:id/api-keys', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { name, scopes, expiresAt } = req.body;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'create_api_key')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            return res.status(400).json({ message: 'API key name must be at least 2 characters' });
        }

        // Validate scopes
        if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
            return res.status(400).json({
                message: 'At least one scope is required',
                availableScopes: Object.keys(API_SCOPES)
            });
        }

        const scopeValidation = validateScopes(scopes);
        if (!scopeValidation.valid) {
            return res.status(400).json({
                message: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
                availableScopes: Object.keys(API_SCOPES)
            });
        }

        const result = await createApiKey({
            workspaceId: id,
            name: name.trim(),
            scopes,
            createdById: req.user.id as string,
            expiresAt: expiresAt ? new Date(expiresAt) : null
        });

        // IMPORTANT: plainTextKey is only returned once!
        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    } catch (error: any) {
        console.error('[Enterprise] Create API key error:', error);
        if (handleEnterpriseLimitError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to create API key' });
    }
});

// Get available scopes
router.get('/api-scopes', async (req: AuthRequest, res: Response) => {
    res.json({ scopes: API_SCOPES });
});

// Revoke API key
router.delete('/workspaces/:id/api-keys/:keyId', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const keyId = req.params.keyId as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'revoke_api_key')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Verify key belongs to workspace
        const apiKey = await getApiKeyById(keyId);
        if (!apiKey) {
            return res.status(404).json({ message: 'API key not found' });
        }
        if (apiKey.workspaceId !== id) {
            return res.status(400).json({ message: 'API key does not belong to this workspace' });
        }

        await revokeApiKey(keyId);
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Revoke API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to revoke API key' });
    }
});

// Rotate API key
router.post('/workspaces/:id/api-keys/:keyId/rotate', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const keyId = req.params.keyId as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'create_api_key')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const apiKey = await getApiKeyById(keyId);
        if (!apiKey) {
            return res.status(404).json({ message: 'API key not found' });
        }
        if (apiKey.workspaceId !== id) {
            return res.status(400).json({ message: 'API key does not belong to this workspace' });
        }

        const result = await rotateApiKey(keyId, req.user.id as string);

        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    } catch (error: any) {
        console.error('[Enterprise] Rotate API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to rotate API key' });
    }
});

// ============================================
// Usage Logs
// ============================================

// Get usage logs
router.get('/workspaces/:id/usage-logs', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { limit, offset, apiKeyId } = req.query;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_usage_logs')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const result = await getWorkspaceUsageLogs(id, {
            limit: limit ? parseInt(String(limit), 10) : undefined,
            offset: offset ? parseInt(String(offset), 10) : undefined,
            apiKeyId: apiKeyId ? String(apiKeyId) : undefined
        });

        res.json(result);
    } catch (error: any) {
        console.error('[Enterprise] Get usage logs error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage logs' });
    }
});

// Get usage statistics
router.get('/workspaces/:id/usage-stats', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { days } = req.query;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_usage_logs')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const stats = await getWorkspaceUsageStats(id, days ? parseInt(String(days), 10) : 30);
        res.json(stats);
    } catch (error: any) {
        console.error('[Enterprise] Get usage stats error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage stats' });
    }
});

// ============================================
// Multi-Org Analytics
// ============================================

// Get aggregated analytics across linked organizations
router.get('/workspaces/:id/analytics', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { range } = req.query;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const analytics = await getEnterpriseAnalyticsOverview(
            id,
            normalizeRange(range, '30')
        );
        res.json(analytics);
    } catch (error: any) {
        console.error('[Enterprise] Get analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get analytics' });
    }
});

router.get('/workspaces/:id/analytics/daily', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const range = normalizeRange(req.query.range, '30');
        const data = await getEnterpriseAnalyticsDaily(id, range);
        res.json(data);
    } catch (error: any) {
        console.error('[Enterprise] Daily analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get daily analytics' });
    }
});

router.get('/workspaces/:id/analytics/summary', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const range = normalizeRange(req.query.range, '30');
        const data = await getEnterpriseAnalyticsSummary(id, range);
        res.json(data);
    } catch (error: any) {
        console.error('[Enterprise] Summary analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get summary analytics' });
    }
});

router.get('/workspaces/:id/analytics/hourly', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const range = normalizeRange(req.query.range, '30');
        const data = await getEnterpriseAnalyticsHourly(id, range);
        res.json(data);
    } catch (error: any) {
        console.error('[Enterprise] Hourly analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get hourly analytics' });
    }
});

router.get('/workspaces/:id/analytics/heatmap', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const range = normalizeRange(req.query.range, '30');
        const data = await getEnterpriseAnalyticsHeatmap(id, range);
        res.json(data);
    } catch (error: any) {
        console.error('[Enterprise] Heatmap analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get heatmap analytics' });
    }
});

router.get('/workspaces/:id/analytics/categories', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const range = normalizeRange(req.query.range, '30');
        const data = await getEnterpriseAnalyticsCategories(id, range);
        res.json(data);
    } catch (error: any) {
        console.error('[Enterprise] Category analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get category analytics' });
    }
});

router.get('/workspaces/:id/analytics/export', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const range = normalizeRange(req.query.range, '30');
        const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'csv';
        const data = await getEnterpriseAnalyticsExportData(id, range);

        if (format === 'pdf') {
            const PDFDocument = (await import('pdfkit')).default;
            const doc = new PDFDocument({ margin: 48 });
            const chunks: Buffer[] = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => {
                const buffer = Buffer.concat(chunks);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="workspace-analytics-${id}-${range}.pdf"`);
                res.setHeader('Content-Length', buffer.length);
                res.send(buffer);
            });

            doc.fontSize(22).font('Helvetica-Bold').text('VeriLnk Workspace Analytics', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`Workspace: ${id}`, { align: 'center' });
            doc.text(`Range: Last ${range} days`, { align: 'center' });
            doc.text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
            doc.moveDown(1.5);

            doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text('Summary');
            doc.moveDown(0.3);
            doc.fontSize(11).font('Helvetica');
            doc.text(`Total Views: ${data.summary.totals.views.toLocaleString()}`);
            doc.text(`Total Clicks: ${data.summary.totals.clicks.toLocaleString()}`);
            doc.text(`CTR: ${data.summary.totals.ctr.toFixed(2)}%`);
            doc.moveDown(1);

            doc.fontSize(14).font('Helvetica-Bold').text('Daily Totals');
            doc.moveDown(0.3);
            doc.fontSize(10).font('Helvetica');
            const rows = data.daily.series.slice(-31);
            rows.forEach((item) => {
                doc.text(`${item.date}  |  views ${item.views}  |  clicks ${item.clicks}`);
            });

            doc.end();
            return;
        }

        let csv = 'Date,Views,Clicks\n';
        for (const row of data.daily.series) {
            csv += `${row.date},${row.views},${row.clicks}\n`;
        }
        csv += '\n';
        csv += `Total Views,${data.summary.totals.views}\n`;
        csv += `Total Clicks,${data.summary.totals.clicks}\n`;
        csv += `CTR,${data.summary.totals.ctr}\n`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="workspace-analytics-${id}-${range}.csv"`);
        res.send(csv);
    } catch (error: any) {
        console.error('[Enterprise] Export analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to export analytics' });
    }
});

// ============================================
// Enterprise Profile / Settings
// ============================================

router.get('/profile', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const context = await resolveEnterpriseProfileContext(userId);
        if (!context) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }

        res.json({
            organization: context.organization,
            role: context.role,
            canEdit: context.canEdit,
            entitlements: context.access.entitlements || null
        });
    } catch (error: any) {
        console.error('[Enterprise] Get profile error:', error);
        res.status(500).json({ message: error.message || 'Failed to fetch enterprise profile' });
    }
});

router.patch('/profile', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const context = await resolveEnterpriseProfileContext(userId);
        if (!context) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }

        if (!context.role || !context.canEdit) {
            return res.status(403).json({
                message: 'Only OWNER or ADMIN can edit enterprise profile'
            });
        }

        const payload = enterpriseProfileUpdateSchema.parse(req.body);
        if (Object.keys(payload).length === 0) {
            return res.status(400).json({ message: 'No fields provided to update' });
        }

        const currentOrg = context.organization;
        const { website, ...otherUpdates } = payload;

        if (otherUpdates.logo && otherUpdates.logo !== currentOrg.logo) {
            const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
            const isInternalLogo =
                otherUpdates.logo.startsWith(backendUrl)
                || otherUpdates.logo.startsWith('/uploads')
                || otherUpdates.logo.startsWith('http://localhost:8000');

            if (!isInternalLogo) {
                return res.status(403).json({
                    message: 'Enterprise logo must use uploaded media URLs only'
                });
            }
        }

        if (website && website !== currentOrg.website) {
            await requestService.createRequest({
                type: 'ORG_WEBSITE_UPDATE' as any,
                payload: { website },
                requesterId: userId,
                organizationId: currentOrg.id
            });
        }

        const cleanUpdates: Record<string, any> = { ...otherUpdates };
        if (cleanUpdates.stateId === '') cleanUpdates.stateId = null;
        if (cleanUpdates.categoryId === '') delete cleanUpdates.categoryId;

        if (Object.keys(cleanUpdates).length > 0) {
            await prisma.organization.update({
                where: { id: currentOrg.id },
                data: cleanUpdates
            });

            const siteUpdates: Record<string, any> = {};
            if (cleanUpdates.name) siteUpdates.name = cleanUpdates.name;
            if (cleanUpdates.countryId) siteUpdates.countryId = cleanUpdates.countryId;
            if (cleanUpdates.stateId !== undefined) siteUpdates.stateId = cleanUpdates.stateId;
            if (cleanUpdates.categoryId) siteUpdates.categoryId = cleanUpdates.categoryId;

            if (Object.keys(siteUpdates).length > 0) {
                await prisma.site.updateMany({
                    where: { organizationId: currentOrg.id },
                    data: siteUpdates
                });
            }
        }

        const updatedOrganization = await prisma.organization.findUnique({
            where: { id: currentOrg.id },
            include: {
                country: true,
                state: true,
                category: true
            }
        });

        if (updatedOrganization?.status === 'APPROVED') {
            const sites = await prisma.site.findMany({
                where: {
                    organizationId: currentOrg.id,
                    status: 'SUCCESS' as any
                },
                include: {
                    country: true,
                    state: true,
                    category: true,
                    organization: true
                }
            });
            const { indexSite } = await import('../services/meilisearch.service');
            for (const site of sites) {
                await indexSite(site as any);
            }
        }

        res.json({
            message: 'Enterprise profile updated',
            warning: website && website !== currentOrg.website
                ? 'Website update submitted for review'
                : undefined,
            organization: updatedOrganization,
            role: context.role,
            canEdit: context.canEdit
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.issues });
        }
        console.error('[Enterprise] Update profile error:', error);
        res.status(500).json({ message: error.message || 'Failed to update enterprise profile' });
    }
});

// ============================================
// Enterprise Access Check
// ============================================

// Check if user has enterprise access
router.get('/access', async (req: AuthRequest, res: Response) => {
    try {
        const access = await getUserEnterpriseAccess(req.user.id as string);
        res.json(access);
    } catch (error: any) {
        console.error('[Enterprise] Check access error:', error);
        res.status(500).json({ message: error.message || 'Failed to check access' });
    }
});

export default router;
