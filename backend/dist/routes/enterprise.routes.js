"use strict";
/**
 * Enterprise Dashboard Routes
 *
 * Routes for managing workspaces, members, API keys, and viewing usage.
 * All routes require user authentication with enterprise entitlements.
 */
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
const auth_middleware_1 = require("../middleware/auth.middleware");
const enterprise_entitlement_1 = require("../services/enterprise.entitlement");
const workspace_service_1 = require("../services/workspace.service");
const enterprise_linking_service_1 = require("../services/enterprise-linking.service");
const apikey_service_1 = require("../services/apikey.service");
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const auditService = __importStar(require("../services/audit.service"));
const analytics_service_1 = require("../services/analytics.service");
const zod_1 = require("zod");
const requestService = __importStar(require("../services/request.service"));
const passwordPolicy_1 = require("../utils/passwordPolicy");
const enterprise_quota_service_1 = require("../services/enterprise-quota.service");
const router = (0, express_1.Router)();
// All routes require user authentication
router.use(auth_middleware_1.authenticateUser);
const normalizeRange = (value, fallback = '30') => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === '7' || normalized === '7d')
        return '7';
    if (normalized === '30' || normalized === '30d')
        return '30';
    if (normalized === '90' || normalized === '90d')
        return '90';
    return fallback;
};
const resolveWorkspaceRole = async (workspaceId, userId) => {
    return (0, enterprise_entitlement_1.getUserWorkspaceRole)(workspaceId, userId);
};
const getAppBaseUrl = () => {
    return process.env.FRONTEND_URL
        || process.env.APP_URL
        || process.env.NEXT_PUBLIC_APP_URL
        || 'http://localhost:3000';
};
const handleEnterpriseLimitError = (res, error) => {
    if (!(0, enterprise_quota_service_1.isEnterpriseLimitReachedError)(error)) {
        return false;
    }
    res.status(409).json((0, enterprise_quota_service_1.toEnterpriseLimitResponse)(error));
    return true;
};
const WORKSPACE_ROLE_PRIORITY = {
    OWNER: 0,
    ADMIN: 1,
    EDITOR: 2,
    ANALYST: 3,
    VIEWER: 4
};
const PROFILE_EDIT_ROLES = ['OWNER', 'ADMIN'];
const enterpriseProfileUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().email().optional(),
    website: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().min(1).optional(),
    address: zod_1.z.string().min(1).optional(),
    countryId: zod_1.z.string().uuid().optional(),
    stateId: zod_1.z.union([zod_1.z.string().uuid(), zod_1.z.string().length(0), zod_1.z.null()]).optional(),
    categoryId: zod_1.z.union([zod_1.z.string().uuid(), zod_1.z.string().length(0), zod_1.z.null()]).optional(),
    about: zod_1.z.string().optional(),
    logo: zod_1.z.string().optional()
});
const createEnterpriseOrganizationSchema = zod_1.z.object({
    orgName: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().regex(passwordPolicy_1.STRONG_PASSWORD_REGEX, passwordPolicy_1.STRONG_PASSWORD_MESSAGE),
    website: zod_1.z.string().url(),
    phone: zod_1.z.string().min(1),
    address: zod_1.z.string().min(1),
    countryId: zod_1.z.string().uuid(),
    stateId: zod_1.z.union([zod_1.z.string().uuid(), zod_1.z.string().length(0), zod_1.z.null()]).optional(),
    categoryId: zod_1.z.string().uuid(),
    type: zod_1.z.nativeEnum(client_1.OrgType),
    about: zod_1.z.string().optional(),
    logo: zod_1.z.string().optional()
});
const linkIdentifierMethodSchema = zod_1.z.enum(['EMAIL', 'DOMAIN', 'SLUG']);
const createLinkRequestSchema = zod_1.z.union([
    zod_1.z.object({
        linkMethod: zod_1.z.literal('ORG_ID'),
        organizationId: zod_1.z.string().uuid(),
        message: zod_1.z.string().max(500).optional()
    }),
    zod_1.z.object({
        linkMethod: linkIdentifierMethodSchema,
        identifier: zod_1.z.string().min(2),
        message: zod_1.z.string().max(500).optional()
    }),
    zod_1.z.object({
        identifier: zod_1.z.string().min(2),
        message: zod_1.z.string().max(500).optional()
    })
]);
const inviteRoleSchema = zod_1.z.enum(['ADMIN', 'ANALYST', 'EDITOR', 'VIEWER']);
const inviteStatusSchema = zod_1.z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']);
const createWorkspaceInviteSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    invitedEmail: zod_1.z.string().email().optional(),
    invitedUserId: zod_1.z.string().uuid().optional(),
    role: inviteRoleSchema.optional()
}).superRefine((data, ctx) => {
    const resolvedEmail = data.invitedEmail ?? data.email;
    const hasEmail = Boolean(resolvedEmail);
    const hasUserId = Boolean(data.invitedUserId);
    if ((hasEmail && hasUserId) || (!hasEmail && !hasUserId)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Provide exactly one invite target: invitedEmail or invitedUserId'
        });
    }
});
const resolveEnterpriseProfileContext = async (userId) => {
    const access = await (0, enterprise_entitlement_1.getUserEnterpriseAccess)(userId);
    if (!access.hasAccess || !access.organizationId)
        return null;
    const organization = await client_2.prisma.organization.findFirst({
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
    if (!organization)
        return null;
    const workspaceMemberships = await client_2.prisma.workspaceMember.findMany({
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
        .map((membership) => membership.role)
        .filter((role) => ['OWNER', 'ADMIN', 'ANALYST', 'EDITOR', 'VIEWER'].includes(role))
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
const logEnterpriseAdminActionIfApplicable = async (req, action, entity, details, targetId) => {
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
// ============================================
// Workspace CRUD
// ============================================
// List user's workspaces
router.get('/workspaces', async (req, res) => {
    try {
        const workspaces = await (0, workspace_service_1.getUserWorkspaces)(req.user.id);
        res.json({ workspaces });
    }
    catch (error) {
        console.error('[Enterprise] List workspaces error:', error);
        res.status(500).json({ message: error.message || 'Failed to list workspaces' });
    }
});
// Create workspace
router.post('/workspaces', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            return res.status(400).json({ message: 'Workspace name must be at least 2 characters' });
        }
        const workspace = await (0, workspace_service_1.createWorkspace)({
            name: name.trim(),
            ownerId: req.user.id
        });
        res.status(201).json({ workspace });
    }
    catch (error) {
        console.error('[Enterprise] Create workspace error:', error);
        if (handleEnterpriseLimitError(res, error))
            return;
        res.status(400).json({ message: error.message || 'Failed to create workspace' });
    }
});
// Get workspace details
router.get('/workspaces/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const workspace = await (0, workspace_service_1.getWorkspaceById)(id);
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }
        res.json({ workspace, role });
    }
    catch (error) {
        console.error('[Enterprise] Get workspace error:', error);
        res.status(500).json({ message: error.message || 'Failed to get workspace' });
    }
});
// Update workspace
router.patch('/workspaces/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { name } = req.body;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const workspace = await (0, workspace_service_1.updateWorkspace)(id, { name });
        res.json({ workspace });
    }
    catch (error) {
        console.error('[Enterprise] Update workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to update workspace' });
    }
});
// Delete workspace (OWNER only)
router.delete('/workspaces/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'delete_workspace')) {
            return res.status(403).json({ message: 'Only the owner can delete a workspace' });
        }
        await (0, workspace_service_1.deleteWorkspace)(id);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Delete workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to delete workspace' });
    }
});
// ============================================
// Member Management
// ============================================
// List members
router.get('/workspaces/:id/members', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const members = await (0, workspace_service_1.getWorkspaceMembers)(id);
        res.json({ members });
    }
    catch (error) {
        console.error('[Enterprise] List members error:', error);
        res.status(500).json({ message: error.message || 'Failed to list members' });
    }
});
// Add member (by email lookup)
router.post('/workspaces/:id/members', async (req, res) => {
    try {
        const id = req.params.id;
        const { email, role: memberRole } = req.body;
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ message: 'Valid email address is required' });
        }
        const currentRole = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!currentRole || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Validate role
        const validRoles = ['ADMIN', 'ANALYST', 'EDITOR', 'VIEWER'];
        if (!validRoles.includes(memberRole)) {
            return res.status(400).json({ message: 'Invalid role. Must be one of: ADMIN, ANALYST, EDITOR, VIEWER' });
        }
        // Lookup user by email
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../db/client')));
        const targetUser = await prisma.user.findFirst({
            where: { email: email.trim().toLowerCase() },
            select: { id: true, name: true, email: true }
        });
        if (!targetUser) {
            return res.status(404).json({ message: 'No user found with that email. They must register on VeriLnk first.' });
        }
        const member = await (0, workspace_service_1.addWorkspaceMember)(id, targetUser.id, memberRole, req.user.id);
        res.status(201).json({ member });
    }
    catch (error) {
        console.error('[Enterprise] Add member error:', error);
        if (handleEnterpriseLimitError(res, error))
            return;
        res.status(400).json({ message: error.message || 'Failed to add member' });
    }
});
// ============================================
// Invite Management
// ============================================
router.get('/workspaces/:id/invites', async (req, res) => {
    try {
        const id = req.params.id;
        const parsedQuery = zod_1.z.object({ status: inviteStatusSchema.optional() }).safeParse(req.query);
        if (!parsedQuery.success) {
            return res.status(400).json({ message: 'Invalid invite status filter' });
        }
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const invites = await (0, workspace_service_1.getWorkspaceInvites)(id, parsedQuery.data.status ? parsedQuery.data.status : undefined);
        res.json({ invites });
    }
    catch (error) {
        console.error('[Enterprise] List invites error:', error);
        res.status(500).json({ message: error.message || 'Failed to list invites' });
    }
});
router.post('/workspaces/:id/invites', async (req, res) => {
    try {
        const id = req.params.id;
        const parsedBody = createWorkspaceInviteSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: parsedBody.error.issues[0]?.message || 'Invalid invite payload'
            });
        }
        const { invitedEmail, invitedUserId, email, role: inviteRole } = parsedBody.data;
        const currentRole = await resolveWorkspaceRole(id, req.user.id);
        if (!currentRole || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const validRoles = ['ADMIN', 'ANALYST', 'EDITOR', 'VIEWER'];
        const safeRole = validRoles.includes(inviteRole)
            ? inviteRole
            : 'VIEWER';
        const resolvedEmail = invitedEmail || email;
        const { invite, token } = await (0, workspace_service_1.createWorkspaceInvite)(id, {
            invitedEmail: resolvedEmail,
            invitedUserId
        }, safeRole, req.user.id);
        const inviteLink = `${getAppBaseUrl()}/enterprise/invite?token=${encodeURIComponent(token)}`;
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.CREATE, 'WorkspaceInvite', `WORKSPACE_INVITE_CREATED workspaceId=${id} role=${invite.role} target=${invite.invitedEmail || invite.invitedUserId || 'unknown'}`, invite.id);
        res.status(201).json({
            invite: {
                id: invite.id,
                workspaceId: invite.workspaceId,
                invitedEmail: invite.invitedEmail,
                invitedUserId: invite.invitedUserId,
                role: invite.role,
                status: invite.status,
                expiresAt: invite.expiresAt,
                acceptedAt: invite.acceptedAt,
                createdBy: invite.createdBy,
                createdByUser: invite.createdByUser || null,
                createdAt: invite.createdAt
            },
            inviteLink: process.env.NODE_ENV === 'production' ? null : inviteLink
        });
    }
    catch (error) {
        console.error('[Enterprise] Create invite error:', error);
        if (handleEnterpriseLimitError(res, error))
            return;
        if (error?.message === 'User not found') {
            return res.status(404).json({ message: 'User not found' });
        }
        if (error?.message === 'Invite already pending' || error?.message === 'User already a member') {
            return res.status(409).json({ message: error.message });
        }
        res.status(400).json({ message: error.message || 'Failed to create invite' });
    }
});
router.delete('/workspaces/:id/invites/:inviteId', async (req, res) => {
    try {
        const id = req.params.id;
        const inviteId = req.params.inviteId;
        const currentRole = await resolveWorkspaceRole(id, req.user.id);
        if (!currentRole || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        await (0, workspace_service_1.cancelWorkspaceInvite)(id, inviteId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'WorkspaceInvite', `WORKSPACE_INVITE_CANCELED workspaceId=${id} inviteId=${inviteId}`, inviteId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Cancel invite error:', error);
        if (error?.message === 'Invite not found') {
            return res.status(404).json({ message: 'Invite not found' });
        }
        if (error?.message === 'Only pending invites can be canceled') {
            return res.status(409).json({ message: error.message });
        }
        res.status(400).json({ message: error.message || 'Failed to cancel invite' });
    }
});
router.post('/workspaces/:id/invites/:inviteId/revoke', async (req, res) => {
    try {
        const id = req.params.id;
        const inviteId = req.params.inviteId;
        const currentRole = await resolveWorkspaceRole(id, req.user.id);
        if (!currentRole || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        await (0, workspace_service_1.revokeWorkspaceInvite)(id, inviteId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'WorkspaceInvite', `WORKSPACE_INVITE_CANCELED workspaceId=${id} inviteId=${inviteId} mode=legacy_revoke`, inviteId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Revoke invite error:', error);
        if (error?.message === 'Invite not found') {
            return res.status(404).json({ message: 'Invite not found' });
        }
        if (error?.message === 'Only pending invites can be canceled') {
            return res.status(409).json({ message: error.message });
        }
        res.status(400).json({ message: error.message || 'Failed to revoke invite' });
    }
});
router.get('/invites', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const invites = await (0, workspace_service_1.listMyWorkspaceInvites)(userId);
        res.json({ invites });
    }
    catch (error) {
        console.error('[Enterprise] List my invites error:', error);
        if (error?.message === 'User not found') {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(400).json({ message: error.message || 'Failed to list invites' });
    }
});
router.post('/invites/accept', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ message: 'Invite token is required' });
        }
        const member = await (0, workspace_service_1.acceptWorkspaceInvite)(token, req.user.id);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'WorkspaceInvite', `WORKSPACE_INVITE_ACCEPTED workspaceId=${member.workspaceId} via=token`, member.id);
        res.json({ success: true, member });
    }
    catch (error) {
        console.error('[Enterprise] Accept invite error:', error);
        res.status(400).json({ message: error.message || 'Failed to accept invite' });
    }
});
router.post('/invites/:inviteId/accept', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const inviteId = req.params.inviteId;
        const member = await (0, workspace_service_1.acceptWorkspaceInviteById)(inviteId, userId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.APPROVE, 'WorkspaceInvite', `WORKSPACE_INVITE_ACCEPTED workspaceId=${member.workspaceId} inviteId=${inviteId} via=in_app`, inviteId);
        res.json({ success: true, member });
    }
    catch (error) {
        console.error('[Enterprise] Accept invite by id error:', error);
        if (error?.message === 'Invite not found') {
            return res.status(404).json({ message: error.message });
        }
        if (error?.message === 'Invite does not belong to this user') {
            return res.status(403).json({ message: 'Access denied' });
        }
        if (error.message === 'Invite has already been processed') {
            return res.status(409).json({ message: error.message });
        }
        if (error.message === 'Invite has expired') {
            return res.status(409).json({ message: error.message });
        }
        res.status(400).json({ message: error.message || 'Failed to accept invite' });
    }
});
router.post('/invites/:inviteId/decline', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const inviteId = req.params.inviteId;
        await (0, workspace_service_1.declineWorkspaceInviteById)(inviteId, userId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.REJECT, 'WorkspaceInvite', `WORKSPACE_INVITE_DECLINED inviteId=${inviteId}`, inviteId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Decline invite error:', error);
        if (error?.message === 'Invite not found') {
            return res.status(404).json({ message: error.message });
        }
        if (error?.message === 'Invite does not belong to this user') {
            return res.status(403).json({ message: 'Access denied' });
        }
        if (error.message === 'Invite has already been processed') {
            return res.status(409).json({ message: error.message });
        }
        if (error.message === 'Invite has expired') {
            return res.status(409).json({ message: error.message });
        }
        res.status(400).json({ message: error.message || 'Failed to decline invite' });
    }
});
// Update member role
router.patch('/workspaces/:id/members/:userId', async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.params.userId;
        const { role: newRole } = req.body;
        const currentRole = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!currentRole || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const member = await (0, workspace_service_1.updateMemberRole)(id, userId, newRole);
        res.json({ member });
    }
    catch (error) {
        console.error('[Enterprise] Update member error:', error);
        res.status(400).json({ message: error.message || 'Failed to update member' });
    }
});
// Remove member
router.delete('/workspaces/:id/members/:userId', async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.params.userId;
        const currentRole = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!currentRole || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(currentRole, 'manage_members')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        await (0, workspace_service_1.removeMember)(id, userId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Remove member error:', error);
        res.status(400).json({ message: error.message || 'Failed to remove member' });
    }
});
// Transfer ownership (OWNER only)
router.post('/workspaces/:id/transfer', async (req, res) => {
    try {
        const id = req.params.id;
        const { newOwnerId } = req.body;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'transfer_ownership')) {
            return res.status(403).json({ message: 'Only the owner can transfer ownership' });
        }
        await (0, workspace_service_1.transferOwnership)(id, req.user.id, newOwnerId);
        res.json({ success: true });
    }
    catch (error) {
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
router.get('/workspaces/:id/organizations', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const organizations = await (0, workspace_service_1.getLinkedOrganizations)(id);
        res.json({ organizations });
    }
    catch (error) {
        console.error('[Enterprise] List linked orgs error:', error);
        res.status(500).json({ message: error.message || 'Failed to list organizations' });
    }
});
const createWorkspaceOrganizationHandler = async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'link_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const enterpriseAccess = await (0, enterprise_entitlement_1.getUserEnterpriseAccess)(req.user.id);
        if (!enterpriseAccess.hasAccess || !enterpriseAccess.organizationId) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }
        const payload = createEnterpriseOrganizationSchema.parse(req.body);
        const result = await (0, enterprise_linking_service_1.createEnterpriseOrganizationAndLink)({
            workspaceId: id,
            enterpriseId: enterpriseAccess.organizationId,
            createdByUserId: req.user.id,
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
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.CREATE, 'EnterpriseOrgLinkRequest', `ENTERPRISE_ORG_CREATED enterprise=${enterpriseAccess.organizationId} workspace=${id} organization=${result.organization.id} request=${result.linkRequest.id} status=PENDING_APPROVAL`, result.organization.id);
        res.status(201).json({
            organization: result.organization,
            linkRequest: result.linkRequest
        });
    }
    catch (error) {
        console.error('[Enterprise] Create org for workspace error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.issues });
        }
        if (handleEnterpriseLimitError(res, error))
            return;
        res.status(400).json({ message: error.message || 'Failed to create organization' });
    }
};
// Create organization under enterprise via org signup pipeline (PENDING approval)
router.post('/workspaces/:id/organizations/create', createWorkspaceOrganizationHandler);
// Backwards-compatible alias
router.post('/workspaces/:id/organizations', createWorkspaceOrganizationHandler);
// List enterprise link requests for workspace
router.get('/workspaces/:id/link-requests', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'link_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const enterpriseAccess = await (0, enterprise_entitlement_1.getUserEnterpriseAccess)(req.user.id);
        if (!enterpriseAccess.hasAccess || !enterpriseAccess.organizationId) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }
        const requests = await (0, enterprise_linking_service_1.listWorkspaceLinkRequests)(id, enterpriseAccess.organizationId);
        res.json({ requests });
    }
    catch (error) {
        console.error('[Enterprise] List link requests error:', error);
        res.status(500).json({ message: error.message || 'Failed to list link requests' });
    }
});
// Request linking an existing organization (consent required from target org)
router.post('/workspaces/:id/link-requests', async (req, res) => {
    try {
        const id = req.params.id;
        const payload = createLinkRequestSchema.parse(req.body);
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'link_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const enterpriseAccess = await (0, enterprise_entitlement_1.getUserEnterpriseAccess)(req.user.id);
        if (!enterpriseAccess.hasAccess || !enterpriseAccess.organizationId) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }
        const request = await (0, enterprise_linking_service_1.createWorkspaceLinkRequest)({
            workspaceId: id,
            enterpriseId: enterpriseAccess.organizationId,
            requestedByUserId: req.user.id,
            linkMethod: 'linkMethod' in payload ? payload.linkMethod : undefined,
            identifier: 'identifier' in payload ? payload.identifier : undefined,
            organizationId: 'organizationId' in payload ? payload.organizationId : undefined,
            message: payload.message
        });
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.CREATE, 'EnterpriseOrgLinkRequest', `ENTERPRISE_LINK_REQUEST_CREATED enterprise=${enterpriseAccess.organizationId} workspace=${id} organization=${request.organizationId}`, request.id);
        res.status(201).json({ request });
    }
    catch (error) {
        console.error('[Enterprise] Create link request error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.issues });
        }
        if (handleEnterpriseLimitError(res, error))
            return;
        res.status(400).json({ message: error.message || 'Failed to create link request' });
    }
});
// Cancel pending link request
router.post('/link-requests/:id/cancel', async (req, res) => {
    try {
        const requestId = req.params.id;
        const enterpriseAccess = await (0, enterprise_entitlement_1.getUserEnterpriseAccess)(req.user.id);
        if (!enterpriseAccess.hasAccess || !enterpriseAccess.organizationId) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }
        await (0, enterprise_linking_service_1.cancelWorkspaceLinkRequest)({
            requestId,
            enterpriseId: enterpriseAccess.organizationId,
            requestedByUserId: req.user.id
        });
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'EnterpriseOrgLinkRequest', `ENTERPRISE_LINK_REQUEST_CANCELED enterprise=${enterpriseAccess.organizationId} request=${requestId}`, requestId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Cancel link request error:', error);
        res.status(400).json({ message: error.message || 'Failed to cancel link request' });
    }
});
// Unlink organization
router.delete('/workspaces/:id/organizations/:orgId', async (req, res) => {
    try {
        const id = req.params.id;
        const orgId = req.params.orgId;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'unlink_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        await (0, workspace_service_1.unlinkOrganization)(id, orgId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.DELETE, 'WorkspaceOrganization', `ENTERPRISE_ORG_UNLINKED workspace=${id} organization=${orgId}`, orgId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Unlink org error:', error);
        res.status(400).json({ message: error.message || 'Failed to unlink organization' });
    }
});
// Alias: Unlink organization
router.post('/workspaces/:id/organizations/unlink', async (req, res) => {
    try {
        const id = req.params.id;
        const { organizationId } = req.body;
        if (!organizationId) {
            return res.status(400).json({ message: 'organizationId is required' });
        }
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'unlink_org')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        await (0, workspace_service_1.unlinkOrganization)(id, organizationId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.DELETE, 'WorkspaceOrganization', `ENTERPRISE_ORG_UNLINKED workspace=${id} organization=${organizationId}`, organizationId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Unlink org alias error:', error);
        res.status(400).json({ message: error.message || 'Failed to unlink organization' });
    }
});
// ============================================
// API Key Management
// ============================================
// List API keys
router.get('/workspaces/:id/api-keys', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const apiKeys = await (0, apikey_service_1.listApiKeys)(id);
        res.json({ apiKeys });
    }
    catch (error) {
        console.error('[Enterprise] List API keys error:', error);
        res.status(500).json({ message: error.message || 'Failed to list API keys' });
    }
});
// Create API key
router.post('/workspaces/:id/api-keys', async (req, res) => {
    try {
        const id = req.params.id;
        const { name, scopes, expiresAt } = req.body;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'create_api_key')) {
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
                availableScopes: Object.keys(enterprise_entitlement_1.API_SCOPES)
            });
        }
        const scopeValidation = (0, enterprise_entitlement_1.validateScopes)(scopes);
        if (!scopeValidation.valid) {
            return res.status(400).json({
                message: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
                availableScopes: Object.keys(enterprise_entitlement_1.API_SCOPES)
            });
        }
        const result = await (0, apikey_service_1.createApiKey)({
            workspaceId: id,
            name: name.trim(),
            scopes,
            createdById: req.user.id,
            expiresAt: expiresAt ? new Date(expiresAt) : null
        });
        // IMPORTANT: plainTextKey is only returned once!
        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    }
    catch (error) {
        console.error('[Enterprise] Create API key error:', error);
        if (handleEnterpriseLimitError(res, error))
            return;
        res.status(400).json({ message: error.message || 'Failed to create API key' });
    }
});
// Get available scopes
router.get('/api-scopes', async (req, res) => {
    res.json({ scopes: enterprise_entitlement_1.API_SCOPES });
});
// Revoke API key
router.delete('/workspaces/:id/api-keys/:keyId', async (req, res) => {
    try {
        const id = req.params.id;
        const keyId = req.params.keyId;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'revoke_api_key')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        // Verify key belongs to workspace
        const apiKey = await (0, apikey_service_1.getApiKeyById)(keyId);
        if (!apiKey) {
            return res.status(404).json({ message: 'API key not found' });
        }
        if (apiKey.workspaceId !== id) {
            return res.status(400).json({ message: 'API key does not belong to this workspace' });
        }
        await (0, apikey_service_1.revokeApiKey)(keyId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Revoke API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to revoke API key' });
    }
});
// Rotate API key
router.post('/workspaces/:id/api-keys/:keyId/rotate', async (req, res) => {
    try {
        const id = req.params.id;
        const keyId = req.params.keyId;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'create_api_key')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const apiKey = await (0, apikey_service_1.getApiKeyById)(keyId);
        if (!apiKey) {
            return res.status(404).json({ message: 'API key not found' });
        }
        if (apiKey.workspaceId !== id) {
            return res.status(400).json({ message: 'API key does not belong to this workspace' });
        }
        const result = await (0, apikey_service_1.rotateApiKey)(keyId, req.user.id);
        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    }
    catch (error) {
        console.error('[Enterprise] Rotate API key error:', error);
        res.status(400).json({ message: error.message || 'Failed to rotate API key' });
    }
});
// ============================================
// Usage Logs
// ============================================
// Get usage logs
router.get('/workspaces/:id/usage-logs', async (req, res) => {
    try {
        const id = req.params.id;
        const { limit, offset, apiKeyId } = req.query;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_usage_logs')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const result = await (0, apikey_service_1.getWorkspaceUsageLogs)(id, {
            limit: limit ? parseInt(String(limit), 10) : undefined,
            offset: offset ? parseInt(String(offset), 10) : undefined,
            apiKeyId: apiKeyId ? String(apiKeyId) : undefined
        });
        res.json(result);
    }
    catch (error) {
        console.error('[Enterprise] Get usage logs error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage logs' });
    }
});
// Get usage statistics
router.get('/workspaces/:id/usage-stats', async (req, res) => {
    try {
        const id = req.params.id;
        const { days } = req.query;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_usage_logs')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const stats = await (0, apikey_service_1.getWorkspaceUsageStats)(id, days ? parseInt(String(days), 10) : 30);
        res.json(stats);
    }
    catch (error) {
        console.error('[Enterprise] Get usage stats error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage stats' });
    }
});
// ============================================
// Multi-Org Analytics
// ============================================
// Get aggregated analytics across linked organizations
router.get('/workspaces/:id/analytics', async (req, res) => {
    try {
        const id = req.params.id;
        const { range } = req.query;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const analytics = await (0, analytics_service_1.getEnterpriseAnalyticsOverview)(id, normalizeRange(range, '30'));
        res.json(analytics);
    }
    catch (error) {
        console.error('[Enterprise] Get analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get analytics' });
    }
});
router.get('/workspaces/:id/analytics/daily', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const range = normalizeRange(req.query.range, '30');
        const data = await (0, analytics_service_1.getEnterpriseAnalyticsDaily)(id, range);
        res.json(data);
    }
    catch (error) {
        console.error('[Enterprise] Daily analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get daily analytics' });
    }
});
router.get('/workspaces/:id/analytics/summary', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const range = normalizeRange(req.query.range, '30');
        const data = await (0, analytics_service_1.getEnterpriseAnalyticsSummary)(id, range);
        res.json(data);
    }
    catch (error) {
        console.error('[Enterprise] Summary analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get summary analytics' });
    }
});
router.get('/workspaces/:id/analytics/hourly', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const range = normalizeRange(req.query.range, '30');
        const data = await (0, analytics_service_1.getEnterpriseAnalyticsHourly)(id, range);
        res.json(data);
    }
    catch (error) {
        console.error('[Enterprise] Hourly analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get hourly analytics' });
    }
});
router.get('/workspaces/:id/analytics/heatmap', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const range = normalizeRange(req.query.range, '30');
        const data = await (0, analytics_service_1.getEnterpriseAnalyticsHeatmap)(id, range);
        res.json(data);
    }
    catch (error) {
        console.error('[Enterprise] Heatmap analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get heatmap analytics' });
    }
});
router.get('/workspaces/:id/analytics/categories', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const range = normalizeRange(req.query.range, '30');
        const data = await (0, analytics_service_1.getEnterpriseAnalyticsCategories)(id, range);
        res.json(data);
    }
    catch (error) {
        console.error('[Enterprise] Category analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get category analytics' });
    }
});
router.get('/workspaces/:id/analytics/export', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_analytics')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const range = normalizeRange(req.query.range, '30');
        const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'csv';
        const data = await (0, analytics_service_1.getEnterpriseAnalyticsExportData)(id, range);
        if (format === 'pdf') {
            const PDFDocument = (await Promise.resolve().then(() => __importStar(require('pdfkit')))).default;
            const doc = new PDFDocument({ margin: 48 });
            const chunks = [];
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
    }
    catch (error) {
        console.error('[Enterprise] Export analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to export analytics' });
    }
});
// ============================================
// Enterprise Profile / Settings
// ============================================
router.get('/profile', async (req, res) => {
    try {
        const userId = req.user?.id;
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
    }
    catch (error) {
        console.error('[Enterprise] Get profile error:', error);
        res.status(500).json({ message: error.message || 'Failed to fetch enterprise profile' });
    }
});
router.patch('/profile', async (req, res) => {
    try {
        const userId = req.user?.id;
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
            const isInternalLogo = otherUpdates.logo.startsWith(backendUrl)
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
                type: 'ORG_WEBSITE_UPDATE',
                payload: { website },
                requesterId: userId,
                organizationId: currentOrg.id
            });
        }
        const cleanUpdates = { ...otherUpdates };
        if (cleanUpdates.stateId === '')
            cleanUpdates.stateId = null;
        if (cleanUpdates.categoryId === '')
            delete cleanUpdates.categoryId;
        if (Object.keys(cleanUpdates).length > 0) {
            await client_2.prisma.organization.update({
                where: { id: currentOrg.id },
                data: cleanUpdates
            });
            const siteUpdates = {};
            if (cleanUpdates.name)
                siteUpdates.name = cleanUpdates.name;
            if (cleanUpdates.countryId)
                siteUpdates.countryId = cleanUpdates.countryId;
            if (cleanUpdates.stateId !== undefined)
                siteUpdates.stateId = cleanUpdates.stateId;
            if (cleanUpdates.categoryId)
                siteUpdates.categoryId = cleanUpdates.categoryId;
            if (Object.keys(siteUpdates).length > 0) {
                await client_2.prisma.site.updateMany({
                    where: { organizationId: currentOrg.id },
                    data: siteUpdates
                });
            }
        }
        const updatedOrganization = await client_2.prisma.organization.findUnique({
            where: { id: currentOrg.id },
            include: {
                country: true,
                state: true,
                category: true
            }
        });
        if (updatedOrganization?.status === 'APPROVED') {
            const sites = await client_2.prisma.site.findMany({
                where: {
                    organizationId: currentOrg.id,
                    status: 'SUCCESS'
                },
                include: {
                    country: true,
                    state: true,
                    category: true,
                    organization: true
                }
            });
            const { indexSite } = await Promise.resolve().then(() => __importStar(require('../services/meilisearch.service')));
            for (const site of sites) {
                await indexSite(site);
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
router.get('/access', async (req, res) => {
    try {
        const access = await (0, enterprise_entitlement_1.getUserEnterpriseAccess)(req.user.id);
        res.json(access);
    }
    catch (error) {
        console.error('[Enterprise] Check access error:', error);
        res.status(500).json({ message: error.message || 'Failed to check access' });
    }
});
exports.default = router;
