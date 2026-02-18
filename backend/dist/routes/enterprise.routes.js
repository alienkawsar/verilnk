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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const enterprise_entitlement_1 = require("../services/enterprise.entitlement");
const workspace_service_1 = require("../services/workspace.service");
const enterprise_linking_service_1 = require("../services/enterprise-linking.service");
const apikey_service_1 = require("../services/apikey.service");
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const auditService = __importStar(require("../services/audit.service"));
const analytics_service_1 = require("../services/analytics.service");
const analytics_report_export_service_1 = require("../services/analytics-report-export.service");
const zod_1 = require("zod");
const requestService = __importStar(require("../services/request.service"));
const passwordPolicy_1 = require("../utils/passwordPolicy");
const enterprise_quota_service_1 = require("../services/enterprise-quota.service");
const session_service_1 = require("../services/session.service");
const invoice_pdf_service_1 = require("../services/invoice-pdf.service");
const invoice_filename_service_1 = require("../services/invoice-filename.service");
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
const WORKSPACE_AUDIT_ROLE_VALUES = new Set(['OWNER', 'ADMIN', 'DEVELOPER', 'ANALYST', 'AUDITOR', 'EDITOR', 'VIEWER', 'FORMER_MEMBER']);
const applyNoStoreHeaders = (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
};
const extractWorkspaceIdFromDetails = (details) => {
    if (!details)
        return null;
    const workspaceIdMatch = details.match(/(?:^|\s)workspaceId=([a-zA-Z0-9-]+)/);
    if (workspaceIdMatch?.[1])
        return workspaceIdMatch[1];
    const workspaceMatch = details.match(/(?:^|\s)workspace=([a-zA-Z0-9-]+)/);
    if (workspaceMatch?.[1])
        return workspaceMatch[1];
    const actorWorkspaceMatch = details.match(/(?:^|\s)actorWorkspaceId=([a-zA-Z0-9-]+)/);
    if (actorWorkspaceMatch?.[1])
        return actorWorkspaceMatch[1];
    return null;
};
const parseAuditActorMetadata = (details, snapshot) => {
    const snapshotRecord = snapshot && typeof snapshot === 'object'
        ? snapshot
        : null;
    const snapshotActorType = typeof snapshotRecord?.actorType === 'string'
        ? snapshotRecord.actorType.toUpperCase()
        : null;
    const snapshotActorUserId = typeof snapshotRecord?.actorUserId === 'string'
        ? snapshotRecord.actorUserId
        : null;
    const snapshotActorWorkspaceRole = typeof snapshotRecord?.actorWorkspaceRole === 'string'
        ? snapshotRecord.actorWorkspaceRole.toUpperCase()
        : null;
    if (snapshotActorType || snapshotActorUserId || snapshotActorWorkspaceRole) {
        return {
            actorType: snapshotActorType === 'ADMIN' ? 'ADMIN' : snapshotActorType === 'USER' ? 'USER' : null,
            actorUserId: snapshotActorUserId,
            actorWorkspaceRole: snapshotActorWorkspaceRole && WORKSPACE_AUDIT_ROLE_VALUES.has(snapshotActorWorkspaceRole)
                ? snapshotActorWorkspaceRole
                : null
        };
    }
    if (!details) {
        return {
            actorType: null,
            actorUserId: null,
            actorWorkspaceRole: null
        };
    }
    const actorTypeMatch = details.match(/(?:^|\s)actorType=(USER|ADMIN)(?:\s|$)/);
    const actorUserIdMatch = details.match(/(?:^|\s)actorUserId=([a-zA-Z0-9-]+)(?:\s|$)/);
    const actorWorkspaceRoleMatch = details.match(/(?:^|\s)actorWorkspaceRole=([A-Z_]+)(?:\s|$)/);
    const roleValue = actorWorkspaceRoleMatch?.[1] || null;
    return {
        actorType: actorTypeMatch?.[1] || null,
        actorUserId: actorUserIdMatch?.[1] || null,
        actorWorkspaceRole: roleValue && WORKSPACE_AUDIT_ROLE_VALUES.has(roleValue) ? roleValue : null
    };
};
const normalizeWorkspaceRoleForResponse = (role) => (0, enterprise_entitlement_1.normalizeWorkspaceRole)(role) || role || null;
const resolveWorkspaceEnterpriseOrganizationId = async (workspaceId) => {
    const entitlements = await (0, enterprise_entitlement_1.getWorkspaceEntitlements)(workspaceId);
    if (!entitlements.hasAccess || entitlements.enterpriseOrgIds.length === 0) {
        return null;
    }
    return entitlements.enterpriseOrgIds[0];
};
const resolveWorkspaceRole = async (workspaceId, userId) => (0, enterprise_entitlement_1.getUserWorkspaceRole)(workspaceId, userId);
const respondWorkspaceForbidden = (res, message = "You don't have permission to do that.") => res.status(403).json({ message, code: 'WORKSPACE_FORBIDDEN' });
const respondOrgRestricted = (res) => res.status(403).json({ code: 'ORG_RESTRICTED', message: 'Organization is restricted' });
const getEnterpriseRestrictionContext = async (workspaceId) => {
    const workspaceLinks = await client_2.prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        select: { organizationId: true }
    });
    const linkedOrgIds = workspaceLinks.map((link) => link.organizationId);
    if (linkedOrgIds.length === 0) {
        return {
            enterpriseOwnerOrgId: null,
            enterpriseOwnerOrgIsRestricted: false
        };
    }
    const enterpriseOwnerOrg = await client_2.prisma.organization.findFirst({
        where: {
            id: { in: linkedOrgIds },
            deletedAt: null,
            planType: client_1.PlanType.ENTERPRISE
        },
        select: { id: true, isRestricted: true }
    });
    return {
        enterpriseOwnerOrgId: enterpriseOwnerOrg?.id || null,
        enterpriseOwnerOrgIsRestricted: Boolean(enterpriseOwnerOrg?.isRestricted)
    };
};
const isOrganizationRestricted = async (organizationId) => {
    const org = await client_2.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { isRestricted: true }
    });
    return Boolean(org?.isRestricted);
};
const enforceWorkspaceEnterpriseNotRestricted = async (req, res, next) => {
    try {
        const workspaceId = req.params.id;
        const userId = req.user?.id;
        if (!workspaceId || !userId) {
            return next();
        }
        // Only evaluate restriction for actual workspace members to avoid leaking workspace state.
        const memberRole = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(workspaceId, userId);
        if (!memberRole) {
            return next();
        }
        const restrictionContext = await getEnterpriseRestrictionContext(workspaceId);
        if (restrictionContext.enterpriseOwnerOrgIsRestricted) {
            return respondOrgRestricted(res);
        }
        return next();
    }
    catch (error) {
        console.error('[Enterprise] Workspace restriction guard error:', error);
        return res.status(500).json({ message: error.message || 'Failed to resolve workspace restriction state' });
    }
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
    DEVELOPER: 2,
    ANALYST: 3,
    AUDITOR: 4
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
const inviteRoleSchema = zod_1.z.enum(['ADMIN', 'DEVELOPER', 'ANALYST', 'AUDITOR', 'EDITOR', 'VIEWER']);
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
const updateWorkspaceMemberRoleSchema = zod_1.z.object({
    role: inviteRoleSchema
});
const workspaceAuditLogQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional(),
    action: zod_1.z.nativeEnum(client_1.AuditActionType).optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional()
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
            category: true,
            billingAccount: {
                include: {
                    invoices: {
                        orderBy: { createdAt: 'desc' },
                        take: 10
                    }
                }
            }
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
        .map((membership) => (0, enterprise_entitlement_1.normalizeWorkspaceRole)(membership.role))
        .filter((role) => Boolean(role))
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
const logEnterpriseAdminActionIfApplicable = async (req, action, entity, details, targetId, snapshot) => {
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
    const workspaceId = extractWorkspaceIdFromDetails(details);
    const providedWorkspaceId = typeof snapshot?.actorWorkspaceId === 'string'
        ? snapshot.actorWorkspaceId
        : null;
    const actorWorkspaceId = providedWorkspaceId || workspaceId;
    let actorWorkspaceRole = typeof snapshot?.actorWorkspaceRole === 'string'
        ? snapshot.actorWorkspaceRole
        : null;
    if (!actorWorkspaceRole && actorWorkspaceId) {
        const membership = await client_2.prisma.workspaceMember.findUnique({
            where: {
                workspaceId_userId: {
                    workspaceId: actorWorkspaceId,
                    userId
                }
            },
            select: { role: true }
        });
        actorWorkspaceRole = membership
            ? (0, enterprise_entitlement_1.normalizeWorkspaceRole)(membership.role)
            : 'FORMER_MEMBER';
    }
    const actorSnapshot = {
        actorType: typeof snapshot?.actorType === 'string' ? snapshot.actorType : 'USER',
        actorUserId: typeof snapshot?.actorUserId === 'string' ? snapshot.actorUserId : userId,
        actorWorkspaceId: actorWorkspaceId || null,
        actorWorkspaceRole: actorWorkspaceRole || null
    };
    await auditService.logAction({
        adminId: admin.id,
        actorRole: undefined,
        action,
        entity,
        targetId,
        details,
        snapshot: snapshot ? { ...snapshot, ...actorSnapshot } : actorSnapshot,
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
        res.json({
            workspaces: workspaces.map((workspace) => ({
                ...workspace,
                role: normalizeWorkspaceRoleForResponse(workspace.role) || workspace.role
            }))
        });
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
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.CREATE, 'Workspace', `WORKSPACE_CREATED workspaceId=${workspace.id} name="${workspace.name}"`, workspace.id);
        res.status(201).json({ workspace });
    }
    catch (error) {
        console.error('[Enterprise] Create workspace error:', error);
        if (handleEnterpriseLimitError(res, error))
            return;
        res.status(400).json({ message: error.message || 'Failed to create workspace' });
    }
});
// Workspace-level routes are blocked when the owning enterprise organization is restricted.
router.use('/workspaces/:id', enforceWorkspaceEnterpriseNotRestricted);
// Get current user's workspace membership context
router.get('/workspaces/:id/me', async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.user.id;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, userId);
        if (!role) {
            return respondWorkspaceForbidden(res, 'No access to this workspace');
        }
        const workspace = await client_2.prisma.workspace.findUnique({
            where: { id },
            select: { id: true, name: true }
        });
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }
        const normalizedRole = normalizeWorkspaceRoleForResponse(role) || role;
        const permissions = {
            canViewOverview: true,
            canViewAnalytics: (0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_analytics'),
            canViewUsage: (0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_usage_logs'),
            canViewApiKeys: (0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_api_keys'),
            canViewMembers: (0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_members'),
            canViewOrganizations: (0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_organizations'),
            canViewSecurity: (0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_compliance_logs'),
            canManageMembers: (0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_members'),
            canManageOrganizations: (0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_organizations'),
            canManageApiKeys: (0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'create_api_key')
        };
        return res.json({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            memberRole: normalizedRole,
            permissions,
            userId
        });
    }
    catch (error) {
        console.error('[Enterprise] Workspace me context error:', error);
        return res.status(500).json({ message: error.message || 'Failed to resolve workspace access' });
    }
});
// Get workspace details
router.get('/workspaces/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role) {
            return respondWorkspaceForbidden(res);
        }
        const workspace = await (0, workspace_service_1.getWorkspaceById)(id);
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }
        res.json({ workspace, role: normalizeWorkspaceRoleForResponse(role) });
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'update_workspace')) {
            return respondWorkspaceForbidden(res);
        }
        const workspace = await (0, workspace_service_1.updateWorkspace)(id, { name });
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'Workspace', `WORKSPACE_UPDATED workspaceId=${id}${typeof name === 'string' ? ` name="${name}"` : ''}`, id);
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
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'delete_workspace')) {
            return respondWorkspaceForbidden(res, 'Only the owner can delete a workspace');
        }
        if (!password.trim()) {
            return res.status(400).json({ message: 'Password is required to delete workspace' });
        }
        const actor = await client_2.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { password: true }
        });
        if (!actor) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const passwordMatches = await bcryptjs_1.default.compare(password, actor.password);
        if (!passwordMatches) {
            return res.status(401).json({ message: 'Invalid password' });
        }
        const deletionSummary = await (0, workspace_service_1.deleteWorkspace)(id);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.DELETE, 'Workspace', `WORKSPACE_DELETED workspaceId=${id} membersUnlinked=${deletionSummary.membersUnlinked} organizationsUnlinked=${deletionSummary.organizationsUnlinked} pendingInvitesCanceled=${deletionSummary.pendingInvitesCanceled} linkRequestsCanceled=${deletionSummary.linkRequestsCanceled}`, id, {
            actorType: 'USER',
            actorUserId: req.user.id,
            actorWorkspaceId: id,
            actorWorkspaceRole: (0, enterprise_entitlement_1.normalizeWorkspaceRole)(role) || role,
            cleanup: deletionSummary
        });
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_members')) {
            return respondWorkspaceForbidden(res);
        }
        const members = await (0, workspace_service_1.getWorkspaceMembers)(id);
        res.json({
            members: members.map((member) => ({
                ...member,
                role: normalizeWorkspaceRoleForResponse(member.role) || member.role
            }))
        });
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
            return respondWorkspaceForbidden(res);
        }
        const normalizedRole = (0, enterprise_entitlement_1.normalizeWorkspaceRole)(String(memberRole || '').toUpperCase());
        if (!normalizedRole || normalizedRole === 'OWNER') {
            return res.status(400).json({ message: 'Invalid role. Must be one of: ADMIN, DEVELOPER, ANALYST, AUDITOR' });
        }
        const safeRole = (0, enterprise_entitlement_1.normalizeWorkspaceRoleForStorage)(normalizedRole);
        // Lookup user by email
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../db/client')));
        const targetUser = await prisma.user.findFirst({
            where: { email: email.trim().toLowerCase() },
            select: { id: true, name: true, email: true }
        });
        if (!targetUser) {
            return res.status(404).json({ message: 'No user found with that email. They must register on VeriLnk first.' });
        }
        const member = await (0, workspace_service_1.addWorkspaceMember)(id, targetUser.id, safeRole, req.user.id);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.CREATE, 'WorkspaceMember', `WORKSPACE_MEMBER_ADDED workspaceId=${id} userId=${targetUser.id} role=${normalizedRole}`, member.id);
        res.status(201).json({
            member: {
                ...member,
                role: normalizeWorkspaceRoleForResponse(member.role) || member.role
            }
        });
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
            return respondWorkspaceForbidden(res);
        }
        const invites = await (0, workspace_service_1.getWorkspaceInvites)(id, parsedQuery.data.status ? parsedQuery.data.status : undefined);
        res.json({
            invites: invites.map((invite) => ({
                ...invite,
                role: normalizeWorkspaceRoleForResponse(invite.role) || invite.role
            }))
        });
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
            return respondWorkspaceForbidden(res);
        }
        const normalizedInviteRole = (0, enterprise_entitlement_1.normalizeWorkspaceRole)(String(inviteRole || 'AUDITOR').toUpperCase());
        const safeRole = normalizedInviteRole && normalizedInviteRole !== 'OWNER'
            ? (0, enterprise_entitlement_1.normalizeWorkspaceRoleForStorage)(normalizedInviteRole)
            : client_1.WorkspaceMemberRole.VIEWER;
        const resolvedEmail = invitedEmail || email;
        const { invite, token } = await (0, workspace_service_1.createWorkspaceInvite)(id, {
            invitedEmail: resolvedEmail,
            invitedUserId
        }, safeRole, req.user.id);
        const inviteLink = `${getAppBaseUrl()}/enterprise/invite?token=${encodeURIComponent(token)}`;
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.CREATE, 'WorkspaceInvite', `WORKSPACE_INVITE_CREATED workspaceId=${id} role=${(0, enterprise_entitlement_1.normalizeWorkspaceRole)(invite.role) || invite.role} target=${invite.invitedEmail || invite.invitedUserId || 'unknown'}`, invite.id);
        res.status(201).json({
            invite: {
                id: invite.id,
                workspaceId: invite.workspaceId,
                invitedEmail: invite.invitedEmail,
                invitedUserId: invite.invitedUserId,
                role: normalizeWorkspaceRoleForResponse(invite.role) || invite.role,
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
            return respondWorkspaceForbidden(res);
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
            return respondWorkspaceForbidden(res);
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
            return respondWorkspaceForbidden(res);
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
            return respondWorkspaceForbidden(res);
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
router.patch('/workspaces/:workspaceId/members/:memberId/role', async (req, res) => {
    try {
        const workspaceId = req.params.workspaceId;
        const memberId = req.params.memberId;
        const parsedBody = updateWorkspaceMemberRoleSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: parsedBody.error.issues[0]?.message || 'Invalid role payload'
            });
        }
        const currentRole = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(workspaceId, req.user.id);
        if (!currentRole || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(currentRole, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }
        const normalizedRole = (0, enterprise_entitlement_1.normalizeWorkspaceRole)(parsedBody.data.role);
        if (!normalizedRole || normalizedRole === 'OWNER') {
            return res.status(400).json({ message: 'Invalid role. Must be one of: ADMIN, DEVELOPER, ANALYST, AUDITOR' });
        }
        const actorRole = (0, enterprise_entitlement_1.normalizeWorkspaceRole)(currentRole) || currentRole;
        const { member, oldRole } = await (0, workspace_service_1.updateMemberRoleById)(workspaceId, memberId, (0, enterprise_entitlement_1.normalizeWorkspaceRoleForStorage)(normalizedRole));
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'WorkspaceMember', `WORKSPACE_MEMBER_ROLE_UPDATED workspaceId=${workspaceId} memberId=${memberId} userId=${member.userId} oldRole=${(0, enterprise_entitlement_1.normalizeWorkspaceRole)(oldRole) || oldRole} newRole=${normalizedRole} actorRole=${actorRole}`, member.id);
        res.json({
            member: {
                ...member,
                role: normalizeWorkspaceRoleForResponse(member.role) || member.role
            }
        });
    }
    catch (error) {
        console.error('[Enterprise] Update member role by id error:', error);
        res.status(400).json({ message: error.message || 'Failed to update member role' });
    }
});
// Legacy route: Update member role by userId
router.patch('/workspaces/:id/members/:userId', async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.params.userId;
        const { role: newRole } = req.body;
        const currentRole = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!currentRole || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(currentRole, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }
        const normalizedRole = (0, enterprise_entitlement_1.normalizeWorkspaceRole)(String(newRole || '').toUpperCase());
        if (!normalizedRole || normalizedRole === 'OWNER') {
            return res.status(400).json({ message: 'Invalid role. Must be one of: ADMIN, DEVELOPER, ANALYST, AUDITOR' });
        }
        const member = await (0, workspace_service_1.updateMemberRole)(id, userId, (0, enterprise_entitlement_1.normalizeWorkspaceRoleForStorage)(normalizedRole));
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'WorkspaceMember', `WORKSPACE_MEMBER_ROLE_UPDATED workspaceId=${id} userId=${userId} role=${normalizedRole}`, member.id);
        res.json({
            member: {
                ...member,
                role: normalizeWorkspaceRoleForResponse(member.role) || member.role
            }
        });
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
            return respondWorkspaceForbidden(res);
        }
        await (0, workspace_service_1.removeMember)(id, userId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.DELETE, 'WorkspaceMember', `WORKSPACE_MEMBER_REMOVED workspaceId=${id} userId=${userId}`, userId);
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
            return respondWorkspaceForbidden(res, 'Only the owner can transfer ownership');
        }
        await (0, workspace_service_1.transferOwnership)(id, req.user.id, newOwnerId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'Workspace', `WORKSPACE_OWNERSHIP_TRANSFERRED workspaceId=${id} fromUserId=${req.user.id} toUserId=${newOwnerId}`, id);
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_organizations')) {
            return respondWorkspaceForbidden(res);
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_organizations')) {
            return respondWorkspaceForbidden(res);
        }
        const enterpriseId = await resolveWorkspaceEnterpriseOrganizationId(id);
        if (!enterpriseId) {
            const restrictionContext = await getEnterpriseRestrictionContext(id);
            if (restrictionContext.enterpriseOwnerOrgIsRestricted) {
                return respondOrgRestricted(res);
            }
            return res.status(403).json({ message: 'Workspace is not linked to an active enterprise organization' });
        }
        const payload = createEnterpriseOrganizationSchema.parse(req.body);
        const result = await (0, enterprise_linking_service_1.createEnterpriseOrganizationAndLink)({
            workspaceId: id,
            enterpriseId,
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
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.CREATE, 'EnterpriseOrgLinkRequest', `ENTERPRISE_ORG_CREATED enterprise=${enterpriseId} workspace=${id} organization=${result.organization.id} request=${result.linkRequest.id} status=PENDING_APPROVAL`, result.organization.id);
        res.status(201).json({
            organization: result.organization,
            linkRequest: result.linkRequest
        });
    }
    catch (error) {
        console.error('[Enterprise] Create org for workspace error:', error);
        if (error?.code === 'ORG_RESTRICTED') {
            return respondOrgRestricted(res);
        }
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_organizations')) {
            return respondWorkspaceForbidden(res);
        }
        const enterpriseId = await resolveWorkspaceEnterpriseOrganizationId(id);
        if (!enterpriseId) {
            const restrictionContext = await getEnterpriseRestrictionContext(id);
            if (restrictionContext.enterpriseOwnerOrgIsRestricted) {
                return respondOrgRestricted(res);
            }
            return res.status(403).json({ message: 'Workspace is not linked to an active enterprise organization' });
        }
        const requests = await (0, enterprise_linking_service_1.listWorkspaceLinkRequests)(id, enterpriseId);
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_organizations')) {
            return respondWorkspaceForbidden(res);
        }
        const enterpriseId = await resolveWorkspaceEnterpriseOrganizationId(id);
        if (!enterpriseId) {
            const restrictionContext = await getEnterpriseRestrictionContext(id);
            if (restrictionContext.enterpriseOwnerOrgIsRestricted) {
                return respondOrgRestricted(res);
            }
            return res.status(403).json({ message: 'Workspace is not linked to an active enterprise organization' });
        }
        if ('organizationId' in payload && payload.organizationId) {
            const restricted = await isOrganizationRestricted(payload.organizationId);
            if (restricted) {
                return respondOrgRestricted(res);
            }
        }
        const request = await (0, enterprise_linking_service_1.createWorkspaceLinkRequest)({
            workspaceId: id,
            enterpriseId,
            requestedByUserId: req.user.id,
            linkMethod: 'linkMethod' in payload ? payload.linkMethod : undefined,
            identifier: 'identifier' in payload ? payload.identifier : undefined,
            organizationId: 'organizationId' in payload ? payload.organizationId : undefined,
            message: payload.message
        });
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.CREATE, 'EnterpriseOrgLinkRequest', `ENTERPRISE_LINK_REQUEST_CREATED enterprise=${enterpriseId} workspace=${id} organization=${request.organizationId}`, request.id);
        res.status(201).json({ request });
    }
    catch (error) {
        console.error('[Enterprise] Create link request error:', error);
        if (error?.code === 'ORG_RESTRICTED') {
            return respondOrgRestricted(res);
        }
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
        const linkRequestModel = client_2.prisma.enterpriseOrgLinkRequest;
        if (!linkRequestModel) {
            return res.status(500).json({ message: 'Link request model unavailable' });
        }
        const existingRequest = await linkRequestModel.findUnique({
            where: { id: requestId },
            select: { id: true, workspaceId: true, enterpriseId: true, organizationId: true }
        });
        if (!existingRequest) {
            return res.status(404).json({ message: 'Pending link request not found' });
        }
        if (!existingRequest.workspaceId) {
            return res.status(400).json({ message: 'Link request is not scoped to a workspace' });
        }
        const role = await resolveWorkspaceRole(existingRequest.workspaceId, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_organizations')) {
            return respondWorkspaceForbidden(res);
        }
        if (existingRequest.organizationId) {
            const restricted = await isOrganizationRestricted(existingRequest.organizationId);
            if (restricted) {
                return respondOrgRestricted(res);
            }
        }
        await (0, enterprise_linking_service_1.cancelWorkspaceLinkRequest)({
            requestId,
            enterpriseId: existingRequest.enterpriseId,
            requestedByUserId: req.user.id
        });
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'EnterpriseOrgLinkRequest', `ENTERPRISE_LINK_REQUEST_CANCELED enterprise=${existingRequest.enterpriseId} workspace=${existingRequest.workspaceId} request=${requestId}`, requestId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Cancel link request error:', error);
        if (error?.code === 'ORG_RESTRICTED') {
            return respondOrgRestricted(res);
        }
        res.status(400).json({ message: error.message || 'Failed to cancel link request' });
    }
});
// Unlink organization
router.delete('/workspaces/:id/organizations/:orgId', async (req, res) => {
    try {
        const id = req.params.id;
        const orgId = req.params.orgId;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_organizations')) {
            return respondWorkspaceForbidden(res);
        }
        const restricted = await isOrganizationRestricted(orgId);
        if (restricted) {
            return respondOrgRestricted(res);
        }
        await (0, workspace_service_1.unlinkOrganization)(id, orgId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.DELETE, 'WorkspaceOrganization', `ENTERPRISE_ORG_UNLINKED workspace=${id} organization=${orgId}`, orgId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Unlink org error:', error);
        if (error?.code === 'ORG_RESTRICTED') {
            return respondOrgRestricted(res);
        }
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_organizations')) {
            return respondWorkspaceForbidden(res);
        }
        const restricted = await isOrganizationRestricted(organizationId);
        if (restricted) {
            return respondOrgRestricted(res);
        }
        await (0, workspace_service_1.unlinkOrganization)(id, organizationId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.DELETE, 'WorkspaceOrganization', `ENTERPRISE_ORG_UNLINKED workspace=${id} organization=${organizationId}`, organizationId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Unlink org alias error:', error);
        if (error?.code === 'ORG_RESTRICTED') {
            return respondOrgRestricted(res);
        }
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_api_keys')) {
            return respondWorkspaceForbidden(res);
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
            return respondWorkspaceForbidden(res);
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
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.CREATE, 'ApiKey', `WORKSPACE_API_KEY_CREATED workspaceId=${id} keyId=${result.apiKey.id} scopes=${result.apiKey.scopes.join('|')}`, result.apiKey.id);
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
            return respondWorkspaceForbidden(res);
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
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.DELETE, 'ApiKey', `WORKSPACE_API_KEY_REVOKED workspaceId=${id} keyId=${keyId}`, keyId);
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'rotate_api_key')) {
            return respondWorkspaceForbidden(res);
        }
        const apiKey = await (0, apikey_service_1.getApiKeyById)(keyId);
        if (!apiKey) {
            return res.status(404).json({ message: 'API key not found' });
        }
        if (apiKey.workspaceId !== id) {
            return res.status(400).json({ message: 'API key does not belong to this workspace' });
        }
        const result = await (0, apikey_service_1.rotateApiKey)(keyId, req.user.id);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'ApiKey', `WORKSPACE_API_KEY_ROTATED workspaceId=${id} keyId=${keyId}`, keyId);
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
router.post('/workspaces/:id/api-keys/:keyId/copy', async (req, res) => {
    try {
        const id = req.params.id;
        const keyId = req.params.keyId;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'copy_api_key')) {
            return respondWorkspaceForbidden(res);
        }
        const apiKey = await (0, apikey_service_1.getApiKeyById)(keyId);
        if (!apiKey) {
            return res.status(404).json({ message: 'API key not found' });
        }
        if (apiKey.workspaceId !== id) {
            return res.status(400).json({ message: 'API key does not belong to this workspace' });
        }
        if (apiKey.isRevoked) {
            return res.status(409).json({ message: 'Cannot copy a revoked key' });
        }
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.OTHER, 'ApiKey', `API_KEY_COPIED workspaceId=${id} keyId=${keyId}`, keyId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] API key copy audit error:', error);
        res.status(400).json({ message: error.message || 'Failed to audit key copy' });
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
            return respondWorkspaceForbidden(res);
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
            return respondWorkspaceForbidden(res);
        }
        const stats = await (0, apikey_service_1.getWorkspaceUsageStats)(id, days ? parseInt(String(days), 10) : 30);
        res.json(stats);
    }
    catch (error) {
        console.error('[Enterprise] Get usage stats error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage stats' });
    }
});
router.get('/workspaces/:id/exports/usage', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await (0, enterprise_entitlement_1.getUserWorkspaceRole)(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'export_usage')) {
            return respondWorkspaceForbidden(res);
        }
        const range = normalizeRange(req.query.range, '30');
        const rangeDays = Number(range);
        const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
        const usageLogs = await client_2.prisma.apiUsageLog.findMany({
            where: {
                createdAt: { gte: since },
                apiKey: { workspaceId: id }
            },
            include: {
                apiKey: {
                    select: { id: true, name: true, prefix: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 10000
        });
        const csvLines = [
            'Timestamp,Method,Endpoint,Status,API Key,Prefix,Latency(ms),IP'
        ];
        for (const log of usageLogs) {
            const safe = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
            csvLines.push([
                safe(log.createdAt.toISOString()),
                safe(log.method),
                safe(log.endpoint),
                safe(log.statusCode),
                safe(log.apiKey?.name || ''),
                safe(log.apiKey?.prefix || ''),
                safe(log.latencyMs ?? ''),
                safe(log.ip || '')
            ].join(','));
        }
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.OTHER, 'ApiUsageExport', `USAGE_EXPORTED workspaceId=${id} format=csv range=${range}`, id);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="workspace-usage-${id}-${range}.csv"`);
        res.send(csvLines.join('\n'));
    }
    catch (error) {
        console.error('[Enterprise] Export usage error:', error);
        res.status(500).json({ message: error.message || 'Failed to export usage' });
    }
});
// ============================================
// Security & Compliance
// ============================================
router.get('/workspaces/:id/audit-logs', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_compliance_logs')) {
            return respondWorkspaceForbidden(res);
        }
        const parsedQuery = workspaceAuditLogQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return res.status(400).json({ message: 'Invalid audit log filters' });
        }
        const page = parsedQuery.data.page ?? 1;
        const limit = parsedQuery.data.limit ?? 20;
        const skip = (page - 1) * limit;
        const where = {
            OR: [
                { details: { contains: `workspaceId=${id}` } },
                { details: { contains: `workspace=${id}` } },
                { entity: 'Workspace', targetId: id }
            ]
        };
        if (parsedQuery.data.action) {
            where.action = parsedQuery.data.action;
        }
        if (parsedQuery.data.startDate || parsedQuery.data.endDate) {
            const createdAt = {};
            if (parsedQuery.data.startDate) {
                const parsedStart = new Date(parsedQuery.data.startDate);
                if (!Number.isNaN(parsedStart.getTime())) {
                    createdAt.gte = parsedStart;
                }
            }
            if (parsedQuery.data.endDate) {
                const parsedEnd = new Date(parsedQuery.data.endDate);
                if (!Number.isNaN(parsedEnd.getTime())) {
                    createdAt.lte = parsedEnd;
                }
            }
            if (Object.keys(createdAt).length > 0) {
                where.createdAt = createdAt;
            }
        }
        else {
            // Safe default: last 30 days
            where.createdAt = {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            };
        }
        const [logs, total] = await Promise.all([
            client_2.prisma.adminLog.findMany({
                where,
                include: {
                    admin: {
                        select: { id: true, firstName: true, lastName: true, email: true, role: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            client_2.prisma.adminLog.count({ where })
        ]);
        const actorMetadataByLogId = new Map(logs.map((log) => [log.id, parseAuditActorMetadata(log.details, log.snapshot)]));
        const actorUserIds = Array.from(new Set(Array.from(actorMetadataByLogId.values())
            .map((meta) => meta.actorUserId)
            .filter((value) => Boolean(value))));
        const [actorUsers, memberships] = actorUserIds.length > 0
            ? await Promise.all([
                client_2.prisma.user.findMany({
                    where: { id: { in: actorUserIds } },
                    select: { id: true, name: true, firstName: true, lastName: true, email: true }
                }),
                client_2.prisma.workspaceMember.findMany({
                    where: {
                        workspaceId: id,
                        userId: { in: actorUserIds }
                    },
                    select: { userId: true, role: true }
                })
            ])
            : [[], []];
        const actorUserById = new Map(actorUsers.map((user) => [user.id, user]));
        const membershipByUserId = new Map(memberships.map((membership) => [membership.userId, membership]));
        const logsWithActor = logs.map((log) => {
            const parsedActor = actorMetadataByLogId.get(log.id);
            const actorUserId = parsedActor?.actorUserId;
            if (actorUserId) {
                const actorUser = actorUserById.get(actorUserId);
                const membership = membershipByUserId.get(actorUserId);
                const snapshotRole = parsedActor?.actorWorkspaceRole && parsedActor.actorWorkspaceRole !== 'FORMER_MEMBER'
                    ? (0, enterprise_entitlement_1.normalizeWorkspaceRole)(parsedActor.actorWorkspaceRole) || parsedActor.actorWorkspaceRole
                    : null;
                const currentRole = membership ? (0, enterprise_entitlement_1.normalizeWorkspaceRole)(membership.role) : null;
                const actorWorkspaceRole = snapshotRole || currentRole;
                const actorLabel = actorUser
                    ? `${actorUser.firstName || ''} ${actorUser.lastName || ''}`.trim()
                        || actorUser.name
                        || actorUser.email
                    : actorUserId;
                return {
                    ...log,
                    actor: {
                        type: 'USER',
                        label: actorLabel,
                        actorUserId,
                        workspaceRole: actorWorkspaceRole,
                        isFormerMember: !actorWorkspaceRole
                    }
                };
            }
            const adminLabel = log.admin
                ? `${log.admin.firstName || ''} ${log.admin.lastName || ''}`.trim() || log.admin.email || 'Super Admin'
                : 'Super Admin';
            return {
                ...log,
                actor: {
                    type: 'ADMIN',
                    label: adminLabel,
                    adminRole: log.admin?.role || 'SUPER_ADMIN'
                }
            };
        });
        res.json({
            logs: logsWithActor,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit))
            }
        });
    }
    catch (error) {
        console.error('[Enterprise] Workspace audit logs error:', error);
        res.status(500).json({ message: error.message || 'Failed to load audit logs' });
    }
});
router.get('/workspaces/:id/exports/audit-logs', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'export_audit_logs')) {
            return respondWorkspaceForbidden(res);
        }
        const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'csv';
        const range = normalizeRange(req.query.range, '30');
        const rangeDays = Number(range);
        const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
        const where = {
            OR: [
                { details: { contains: `workspaceId=${id}` } },
                { details: { contains: `workspace=${id}` } },
                { entity: 'Workspace', targetId: id }
            ],
            createdAt: { gte: since }
        };
        const logs = await client_2.prisma.adminLog.findMany({
            where,
            include: {
                admin: {
                    select: { id: true, firstName: true, lastName: true, email: true, role: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 10000
        });
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.OTHER, 'WorkspaceAuditExport', `AUDIT_LOGS_EXPORTED workspaceId=${id} format=${format} range=${range}`, id);
        if (format === 'log') {
            const lines = logs.map((log) => {
                const actorName = log.admin
                    ? `${log.admin.firstName || ''} ${log.admin.lastName || ''}`.trim() || log.admin.email
                    : 'system';
                return `[${log.createdAt.toISOString()}] action=${log.action} entity=${log.entity || '-'} target=${log.targetId || '-'} actor="${actorName}" details="${(log.details || '').replace(/\s+/g, ' ').trim()}"`;
            });
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="workspace-audit-${id}-${range}.log"`);
            return res.send(lines.join('\n'));
        }
        const safe = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const csvLines = [
            'Timestamp,Action,Entity,Target ID,Actor Name,Actor Email,Details,IP,User Agent'
        ];
        for (const log of logs) {
            const actorName = log.admin
                ? `${log.admin.firstName || ''} ${log.admin.lastName || ''}`.trim()
                : '';
            csvLines.push([
                safe(log.createdAt.toISOString()),
                safe(log.action),
                safe(log.entity || ''),
                safe(log.targetId || ''),
                safe(actorName),
                safe(log.admin?.email || ''),
                safe(log.details || ''),
                safe(log.ipAddress || ''),
                safe(log.userAgent || '')
            ].join(','));
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="workspace-audit-${id}-${range}.csv"`);
        res.send(csvLines.join('\n'));
    }
    catch (error) {
        console.error('[Enterprise] Export audit logs error:', error);
        res.status(500).json({ message: error.message || 'Failed to export audit logs' });
    }
});
router.get('/workspaces/:id/sessions', async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_compliance_logs')) {
            return respondWorkspaceForbidden(res);
        }
        const members = await client_2.prisma.workspaceMember.findMany({
            where: { workspaceId: id },
            select: {
                userId: true,
                role: true
            }
        });
        const memberUserIds = members.map((member) => member.userId);
        const users = memberUserIds.length
            ? await client_2.prisma.user.findMany({
                where: { id: { in: memberUserIds } },
                select: { id: true, email: true, firstName: true, lastName: true, name: true }
            })
            : [];
        const userMap = new Map(users.map((user) => [user.id, user]));
        const sessions = await (0, session_service_1.listActiveSessionsForActorIds)(client_1.SessionActorType.ORG, memberUserIds);
        const memberMap = new Map(members.map((member) => [member.userId, member]));
        res.json({
            sessions: sessions.map((session) => {
                const member = memberMap.get(session.actorId);
                return {
                    ...session,
                    member: member
                        ? {
                            userId: member.userId,
                            role: normalizeWorkspaceRoleForResponse(member.role) || member.role,
                            user: userMap.get(member.userId) || null
                        }
                        : null
                };
            })
        });
    }
    catch (error) {
        console.error('[Enterprise] Workspace sessions error:', error);
        res.status(500).json({ message: error.message || 'Failed to load sessions' });
    }
});
router.post('/workspaces/:id/sessions/:sessionId/revoke', async (req, res) => {
    try {
        const id = req.params.id;
        const sessionId = req.params.sessionId;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }
        const members = await client_2.prisma.workspaceMember.findMany({
            where: { workspaceId: id },
            select: { userId: true }
        });
        const memberUserIds = members.map((member) => member.userId);
        await (0, session_service_1.revokeSessionForActorIds)(client_1.SessionActorType.ORG, memberUserIds, sessionId);
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.UPDATE, 'AuthSession', `WORKSPACE_SESSION_REVOKED workspaceId=${id} sessionId=${sessionId}`, sessionId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('[Enterprise] Revoke workspace session error:', error);
        if (error?.message === 'Session not found') {
            return res.status(404).json({ message: 'Session not found' });
        }
        res.status(400).json({ message: error.message || 'Failed to revoke session' });
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
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'view_analytics')) {
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
const exportWorkspaceAnalyticsHandler = async (req, res) => {
    try {
        const id = req.params.id;
        const role = await resolveWorkspaceRole(id, req.user.id);
        if (!role || !(0, enterprise_entitlement_1.canPerformWorkspaceAction)(role, 'export_analytics')) {
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
        }
        const range = normalizeRange(req.query.range, '30');
        const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'csv';
        const data = await (0, analytics_service_1.getEnterpriseAnalyticsExportData)(id, range);
        const generatedAt = new Date();
        const workspace = await client_2.prisma.workspace.findUnique({
            where: { id },
            select: { name: true }
        });
        const entityName = workspace?.name?.trim() || 'Workspace';
        const rangeDays = Number.parseInt(range, 10) || 30;
        const rows = data.daily.series.map((row) => ({
            date: row.date,
            views: row.views,
            clicks: row.clicks,
            ctr: row.views > 0 ? (row.clicks / row.views) * 100 : 0
        }));
        await logEnterpriseAdminActionIfApplicable(req, client_1.AuditActionType.OTHER, 'WorkspaceAnalyticsExport', `ANALYTICS_EXPORTED workspaceId=${id} format=${format} range=${range}`, id);
        if (format === 'pdf') {
            const filename = (0, analytics_report_export_service_1.buildAnalyticsReportFilename)(entityName, 'workspace', id, 'pdf', generatedAt);
            const pdfBuffer = await (0, analytics_report_export_service_1.buildAnalyticsReportPdfBuffer)({
                entityName,
                rangeLabel: `Last ${rangeDays} days`,
                generatedAt,
                totalViews: data.summary.totals.views,
                totalClicks: data.summary.totals.clicks,
                totalCtr: data.summary.totals.ctr,
                rows
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
            return;
        }
        const filename = (0, analytics_report_export_service_1.buildAnalyticsReportFilename)(entityName, 'workspace', id, 'csv', generatedAt);
        const csv = (0, analytics_report_export_service_1.buildAnalyticsReportCsv)(rows);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    }
    catch (error) {
        console.error('[Enterprise] Export analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to export analytics' });
    }
};
router.get('/workspaces/:id/analytics/export', exportWorkspaceAnalyticsHandler);
router.get('/workspaces/:id/exports/analytics', exportWorkspaceAnalyticsHandler);
// ============================================
// Enterprise Billing
// ============================================
const downloadEnterpriseInvoicePdfHandler = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const context = await resolveEnterpriseProfileContext(userId);
        if (!context) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }
        if (!context.canEdit) {
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
        }
        const invoiceId = req.params.invoiceId;
        const invoice = await client_2.prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                billingAccount: {
                    organizationId: context.organization.id
                }
            },
            include: {
                billingAccount: {
                    include: {
                        organization: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                website: true,
                                address: true,
                                planType: true
                            }
                        }
                    }
                },
                subscription: {
                    select: {
                        planType: true,
                        currentPeriodStart: true,
                        currentPeriodEnd: true
                    }
                }
            }
        });
        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }
        const metadata = (invoice.metadata && typeof invoice.metadata === 'object')
            ? invoice.metadata
            : {};
        const planName = ((typeof metadata.planType === 'string' ? metadata.planType : null)
            || invoice.subscription?.planType
            || invoice.billingAccount.organization.planType
            || 'ENTERPRISE');
        const periodStart = invoice.periodStart || invoice.subscription?.currentPeriodStart || invoice.createdAt;
        let periodEnd = invoice.periodEnd || invoice.subscription?.currentPeriodEnd || null;
        if (!periodEnd && typeof metadata.durationDays === 'number' && Number.isFinite(metadata.durationDays)) {
            const days = Math.max(0, Math.floor(Number(metadata.durationDays)));
            if (days > 0) {
                periodEnd = new Date(periodStart.getTime() + days * 24 * 60 * 60 * 1000);
            }
        }
        const discountCents = typeof metadata.discountCents === 'number' ? Math.max(0, Math.floor(metadata.discountCents)) : 0;
        const taxCents = typeof metadata.taxCents === 'number' ? Math.max(0, Math.floor(metadata.taxCents)) : 0;
        const notes = typeof metadata.notes === 'string' ? metadata.notes : null;
        const invoiceNumber = invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
        const pdfBuffer = await (0, invoice_pdf_service_1.buildInvoicePdfBuffer)({
            invoiceNumber,
            invoiceDate: invoice.createdAt,
            status: invoice.status,
            paidAt: invoice.paidAt,
            periodStart,
            periodEnd,
            planName,
            planType: planName,
            currency: invoice.currency || 'USD',
            amountCents: invoice.amountCents,
            discountCents,
            taxCents,
            billTo: {
                name: invoice.billingAccount.organization.name,
                email: invoice.billingAccount.billingEmail || invoice.billingAccount.organization.email,
                website: invoice.billingAccount.organization.website,
                address: invoice.billingAccount.organization.address
            },
            notes
        });
        const filename = (0, invoice_filename_service_1.buildInvoiceDownloadFilename)({
            organizationName: invoice.billingAccount.organization.name,
            organizationId: invoice.billingAccount.organization.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceId: invoice.id,
            invoiceDate: invoice.createdAt
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', (0, invoice_filename_service_1.buildInvoiceContentDisposition)(filename));
        res.status(200).send(pdfBuffer);
    }
    catch (error) {
        console.error('[Enterprise] Download invoice error:', error);
        res.status(500).json({ message: error.message || 'Failed to download invoice' });
    }
};
router.get('/invoices/:invoiceId/download', downloadEnterpriseInvoicePdfHandler);
router.get('/invoices/:invoiceId/pdf', downloadEnterpriseInvoicePdfHandler);
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
        applyNoStoreHeaders(res);
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
router.get('/usage/summary', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const context = await resolveEnterpriseProfileContext(userId);
        if (!context) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }
        const range = normalizeRange(req.query.range, '30');
        const rangeDays = Number.parseInt(range, 10) || 30;
        const since = new Date();
        since.setDate(since.getDate() - rangeDays);
        since.setHours(0, 0, 0, 0);
        const memberships = await client_2.prisma.workspaceMember.findMany({
            where: {
                userId,
                workspace: {
                    organizations: {
                        some: { organizationId: context.organization.id }
                    }
                }
            },
            select: {
                workspaceId: true,
                role: true
            }
        });
        const readableWorkspaceIds = Array.from(new Set(memberships
            .filter((membership) => {
            const normalizedRole = (0, enterprise_entitlement_1.normalizeWorkspaceRole)(membership.role);
            if (!normalizedRole)
                return false;
            return (0, enterprise_entitlement_1.canPerformWorkspaceAction)(normalizedRole, 'view_usage_logs')
                || (0, enterprise_entitlement_1.canPerformWorkspaceAction)(normalizedRole, 'view_analytics');
        })
            .map((membership) => membership.workspaceId)));
        if (readableWorkspaceIds.length === 0) {
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
        }
        const linkedOrgRows = await client_2.prisma.workspaceOrganization.findMany({
            where: { workspaceId: { in: readableWorkspaceIds } },
            select: { organizationId: true }
        });
        const linkedOrganizationIds = new Set(linkedOrgRows.map((row) => row.organizationId));
        linkedOrganizationIds.delete(context.organization.id);
        const linkedOrganizationCount = linkedOrganizationIds.size;
        const apiKeyCount = await client_2.prisma.apiKey.count({
            where: {
                workspaceId: { in: readableWorkspaceIds },
                revokedAt: null
            }
        });
        if (linkedOrganizationCount === 0 || apiKeyCount === 0) {
            return res.json({
                range: `${range}d`,
                totals: {
                    requests: 0,
                    success: 0,
                    errors: 0,
                    rateLimited: 0
                },
                series: [],
                meta: {
                    workspaceCount: readableWorkspaceIds.length,
                    linkedOrganizationCount,
                    apiKeyCount,
                    source: 'ApiUsageLog'
                }
            });
        }
        // Usage totals are sourced only from ApiUsageLog entries produced by enterprise workspace API keys.
        // This avoids double counting with org analytics event tables.
        const usageWhere = {
            createdAt: { gte: since },
            apiKey: {
                workspaceId: { in: readableWorkspaceIds }
            }
        };
        const [requests, success, errors, rateLimited] = await client_2.prisma.$transaction([
            client_2.prisma.apiUsageLog.count({ where: usageWhere }),
            client_2.prisma.apiUsageLog.count({
                where: {
                    ...usageWhere,
                    statusCode: { gte: 200, lt: 400 }
                }
            }),
            client_2.prisma.apiUsageLog.count({
                where: {
                    ...usageWhere,
                    statusCode: { gte: 400 }
                }
            }),
            client_2.prisma.apiUsageLog.count({
                where: {
                    ...usageWhere,
                    statusCode: 429
                }
            })
        ]);
        res.json({
            range: `${range}d`,
            totals: {
                requests,
                success,
                errors,
                rateLimited
            },
            series: [],
            meta: {
                workspaceCount: readableWorkspaceIds.length,
                linkedOrganizationCount,
                apiKeyCount,
                source: 'ApiUsageLog'
            }
        });
    }
    catch (error) {
        console.error('[Enterprise] Usage summary error:', error);
        res.status(500).json({ message: error.message || 'Failed to load enterprise usage summary' });
    }
});
// Check if user has enterprise access
router.get('/access', async (req, res) => {
    try {
        const access = await (0, enterprise_entitlement_1.getUserEnterpriseAccess)(req.user.id);
        applyNoStoreHeaders(res);
        res.json(access);
    }
    catch (error) {
        console.error('[Enterprise] Check access error:', error);
        res.status(500).json({ message: error.message || 'Failed to check access' });
    }
});
exports.default = router;
