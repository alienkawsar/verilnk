/**
 * Enterprise Dashboard Routes
 * 
 * Routes for managing workspaces, members, API keys, and viewing usage.
 * All routes require user authentication with enterprise entitlements.
 */

import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { authenticateUser, AuthRequest } from '../middleware/auth.middleware';
import {
    getUserEnterpriseAccess,
    getWorkspaceEntitlements,
    getUserWorkspaceRole,
    canPerformWorkspaceAction,
    API_SCOPES,
    normalizeWorkspaceRole,
    normalizeWorkspaceRoleForStorage,
    validateScopes,
    type WorkspaceRoleCanonical,
    type WorkspaceRoleInput
} from '../services/enterprise.entitlement';
import {
    createWorkspace,
    getWorkspaceById,
    getUserWorkspaces,
    updateWorkspace,
    deleteWorkspace,
    addWorkspaceMember,
    updateMemberRole,
    updateMemberRoleById,
    removeMember,
    transferOwnership,
    getWorkspaceMembers,
    createWorkspaceInvite,
    acceptWorkspaceInvite,
    acceptWorkspaceInviteById,
    declineWorkspaceInviteById,
    getWorkspaceInvites,
    revokeWorkspaceInvite,
    cancelWorkspaceInvite,
    listMyWorkspaceInvites,
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
    InviteStatus,
    OrgType,
    PlanType,
    Prisma,
    SessionActorType,
    WorkspaceMemberRole,
    WorkspaceStatus
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
import {
    buildAnalyticsReportCsv,
    buildAnalyticsReportFilename,
    buildAnalyticsReportPdfBuffer
} from '../services/analytics-report-export.service';
import { z } from 'zod';
import * as requestService from '../services/request.service';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '../utils/passwordPolicy';
import {
    isEnterpriseLimitReachedError,
    toEnterpriseLimitResponse
} from '../services/enterprise-quota.service';
import {
    listActiveSessionsForActorIds,
    revokeSessionForActorIds
} from '../services/session.service';
import { buildInvoicePdfBuffer } from '../services/invoice-pdf.service';
import { buildInvoiceContentDisposition, buildInvoiceDownloadFilename } from '../services/invoice-filename.service';
import {
    assertEnterpriseCompliance,
    getEnterpriseCompliancePolicy,
    isEnterpriseComplianceError,
    toEnterpriseComplianceErrorResponse,
    updateEnterpriseCompliancePolicy
} from '../services/enterprise-compliance.service';
import {
    assertWorkspaceLifecycleAccess,
    isWorkspaceLifecycleError,
    toWorkspaceLifecycleErrorResponse
} from '../services/workspace-lifecycle.service';
import {
    computePlanLifecycleState,
    isEnterpriseManagedSyncedOrganization
} from '../services/plan-lifecycle.service';

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

const WORKSPACE_AUDIT_ROLE_VALUES = new Set(['OWNER', 'ADMIN', 'DEVELOPER', 'ANALYST', 'AUDITOR', 'EDITOR', 'VIEWER', 'FORMER_MEMBER']);

type WorkspaceAuditActorType = 'USER' | 'ADMIN';

type ParsedAuditActorMetadata = {
    actorType: WorkspaceAuditActorType | null;
    actorUserId: string | null;
    actorWorkspaceRole: string | null;
};

const applyNoStoreHeaders = (res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
};

const extractWorkspaceIdFromDetails = (details: string | null | undefined): string | null => {
    if (!details) return null;
    const workspaceIdMatch = details.match(/(?:^|\s)workspaceId=([a-zA-Z0-9-]+)/);
    if (workspaceIdMatch?.[1]) return workspaceIdMatch[1];
    const workspaceMatch = details.match(/(?:^|\s)workspace=([a-zA-Z0-9-]+)/);
    if (workspaceMatch?.[1]) return workspaceMatch[1];
    const actorWorkspaceMatch = details.match(/(?:^|\s)actorWorkspaceId=([a-zA-Z0-9-]+)/);
    if (actorWorkspaceMatch?.[1]) return actorWorkspaceMatch[1];
    return null;
};

const parseAuditActorMetadata = (
    details: string | null | undefined,
    snapshot: unknown
): ParsedAuditActorMetadata => {
    const snapshotRecord = snapshot && typeof snapshot === 'object'
        ? snapshot as Record<string, unknown>
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
        actorType: (actorTypeMatch?.[1] as WorkspaceAuditActorType | undefined) || null,
        actorUserId: actorUserIdMatch?.[1] || null,
        actorWorkspaceRole: roleValue && WORKSPACE_AUDIT_ROLE_VALUES.has(roleValue) ? roleValue : null
    };
};

const normalizeWorkspaceRoleForResponse = (role: WorkspaceRoleInput | WorkspaceMemberRole | null | undefined) =>
    normalizeWorkspaceRole(role) || role || null;

const resolveWorkspaceEnterpriseOrganizationId = async (workspaceId: string): Promise<string | null> => {
    const entitlements = await getWorkspaceEntitlements(workspaceId);
    if (!entitlements.hasAccess || entitlements.enterpriseOrgIds.length === 0) {
        return null;
    }
    return entitlements.enterpriseOrgIds[0];
};

const resolveWorkspaceRole = async (
    workspaceId: string,
    userId: string
): Promise<WorkspaceRoleInput | null> => getUserWorkspaceRole(workspaceId, userId);

const respondWorkspaceForbidden = (res: Response, message: string = "You don't have permission to do that.") =>
    res.status(403).json({ message, code: 'WORKSPACE_FORBIDDEN' });

const respondOrgRestricted = (res: Response) =>
    res.status(403).json({ code: 'ORG_RESTRICTED', message: 'Organization is restricted' });

const normalizeComplianceActorRole = (role: string | null | undefined): string => {
    const normalized = String(role || '').trim().toUpperCase();
    if (!normalized) return 'UNKNOWN';
    if (normalized === 'EDITOR') return 'DEVELOPER';
    if (normalized === 'VIEWER') return 'AUDITOR';
    return normalized;
};

const handleComplianceError = (res: Response, error: unknown): boolean => {
    if (!isEnterpriseComplianceError(error)) {
        return false;
    }

    res.status(error.status).json(toEnterpriseComplianceErrorResponse(error));
    return true;
};

const handleWorkspaceLifecycleError = (res: Response, error: unknown): boolean => {
    if (!isWorkspaceLifecycleError(error)) {
        return false;
    }

    res.status(error.status).json(toWorkspaceLifecycleErrorResponse(error));
    return true;
};

const getEnterpriseRestrictionContext = async (workspaceId: string): Promise<{
    enterpriseOwnerOrgId: string | null;
    enterpriseOwnerOrgIsRestricted: boolean;
}> => {
    const workspaceLinks = await prisma.workspaceOrganization.findMany({
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

    const enterpriseOwnerOrg = await prisma.organization.findFirst({
        where: {
            id: { in: linkedOrgIds },
            deletedAt: null,
            planType: PlanType.ENTERPRISE
        },
        select: { id: true, isRestricted: true }
    });

    return {
        enterpriseOwnerOrgId: enterpriseOwnerOrg?.id || null,
        enterpriseOwnerOrgIsRestricted: Boolean(enterpriseOwnerOrg?.isRestricted)
    };
};

const resolveWorkspaceEnterpriseIdForCompliance = async (workspaceId: string): Promise<string | null> => {
    const directEnterpriseId = await resolveWorkspaceEnterpriseOrganizationId(workspaceId);
    if (directEnterpriseId) return directEnterpriseId;

    const restrictionContext = await getEnterpriseRestrictionContext(workspaceId);
    return restrictionContext.enterpriseOwnerOrgId;
};

const assertComplianceForWorkspaceAction = async (input: {
    workspaceId: string;
    action:
        | 'WORKSPACE_DELETE'
        | 'WORKSPACE_SUSPEND'
        | 'WORKSPACE_ARCHIVE'
        | 'WORKSPACE_RESTORE'
        | 'ORGANIZATION_LINK'
        | 'ORGANIZATION_UNLINK'
        | 'MEMBER_ROLE_CHANGE'
        | 'API_KEY_LIFECYCLE'
        | 'COMPLIANCE_AUDIT_VIEW'
        | 'COMPLIANCE_AUDIT_EXPORT';
    actorRole: string | null | undefined;
}) => {
    const enterpriseId = await resolveWorkspaceEnterpriseIdForCompliance(input.workspaceId);
    if (!enterpriseId) {
        return null;
    }

    return assertEnterpriseCompliance({
        enterpriseId,
        action: input.action,
        actorRole: normalizeComplianceActorRole(input.actorRole)
    });
};

const isOrganizationRestricted = async (organizationId: string): Promise<boolean> => {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { isRestricted: true }
    });
    return Boolean(org?.isRestricted);
};

const enforceWorkspaceEnterpriseNotRestricted = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.params.id as string | undefined;
        const userId = req.user?.id as string | undefined;
        if (!workspaceId || !userId) {
            return next();
        }

        // Only evaluate restriction for actual workspace members to avoid leaking workspace state.
        const memberRole = await getUserWorkspaceRole(workspaceId, userId);
        if (!memberRole) {
            return next();
        }

        const restrictionContext = await getEnterpriseRestrictionContext(workspaceId);
        if (restrictionContext.enterpriseOwnerOrgIsRestricted) {
            return respondOrgRestricted(res);
        }

        return next();
    } catch (error: any) {
        console.error('[Enterprise] Workspace restriction guard error:', error);
        return res.status(500).json({ message: error.message || 'Failed to resolve workspace restriction state' });
    }
};

const enforceWorkspaceLifecycleGuard = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.params.id as string | undefined;
        const userId = req.user?.id as string | undefined;
        if (!workspaceId || !userId) {
            return next();
        }

        const memberRole = await getUserWorkspaceRole(workspaceId, userId);
        if (!memberRole) {
            return next();
        }

        const isReadRequest = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
        const isRestoreRequest = req.method === 'POST' && req.path === '/restore';

        await assertWorkspaceLifecycleAccess({
            workspaceId,
            actorRole: normalizeWorkspaceRole(memberRole) || memberRole,
            mode: isReadRequest ? 'READ' : 'ADMIN',
            allowArchivedAdminRecovery: isRestoreRequest
        });

        return next();
    } catch (error: any) {
        if (handleWorkspaceLifecycleError(res, error)) return;
        console.error('[Enterprise] Workspace lifecycle guard error:', error);
        return res.status(500).json({ message: error.message || 'Failed to resolve workspace lifecycle state' });
    }
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

type EnterpriseWorkspaceRole = WorkspaceRoleCanonical;

const WORKSPACE_ROLE_PRIORITY: Record<EnterpriseWorkspaceRole, number> = {
    OWNER: 0,
    ADMIN: 1,
    DEVELOPER: 2,
    ANALYST: 3,
    AUDITOR: 4
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

const linkIdentifierMethodSchema = z.enum(['EMAIL', 'DOMAIN', 'SLUG']);

const createLinkRequestSchema = z.union([
    z.object({
        linkMethod: z.literal('ORG_ID'),
        organizationId: z.string().uuid(),
        message: z.string().max(500).optional()
    }),
    z.object({
        linkMethod: linkIdentifierMethodSchema,
        identifier: z.string().min(2),
        message: z.string().max(500).optional()
    }),
    z.object({
        identifier: z.string().min(2),
        message: z.string().max(500).optional()
    })
]);

const inviteRoleSchema = z.enum(['ADMIN', 'DEVELOPER', 'ANALYST', 'AUDITOR', 'EDITOR', 'VIEWER']);
const inviteStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']);

const createWorkspaceInviteSchema = z.object({
    email: z.string().email().optional(),
    invitedEmail: z.string().email().optional(),
    invitedUserId: z.string().uuid().optional(),
    role: inviteRoleSchema.optional()
}).superRefine((data, ctx) => {
    const resolvedEmail = data.invitedEmail ?? data.email;
    const hasEmail = Boolean(resolvedEmail);
    const hasUserId = Boolean(data.invitedUserId);

    if ((hasEmail && hasUserId) || (!hasEmail && !hasUserId)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide exactly one invite target: invitedEmail or invitedUserId'
        });
    }
});

const updateWorkspaceMemberRoleSchema = z.object({
    role: inviteRoleSchema
});

const workspaceAuditLogQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    action: z.nativeEnum(AuditActionType).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
});

const enterpriseCompliancePolicyUpdateSchema = z.object({
    logRetentionDays: z.coerce.number().int().min(7).max(3650).optional(),
    requireStrongPasswords: z.boolean().optional()
}).refine(
    (value) => typeof value.logRetentionDays === 'number' || typeof value.requireStrongPasswords === 'boolean',
    { message: 'At least one policy field is required' }
);

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
        .map((membership) => normalizeWorkspaceRole(membership.role))
        .filter((role): role is EnterpriseWorkspaceRole => Boolean(role))
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
    targetId?: string,
    snapshot?: Record<string, unknown>
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

    const workspaceId = extractWorkspaceIdFromDetails(details);
    const providedWorkspaceId = typeof snapshot?.actorWorkspaceId === 'string'
        ? snapshot.actorWorkspaceId
        : null;
    const actorWorkspaceId = providedWorkspaceId || workspaceId;

    let actorWorkspaceRole = typeof snapshot?.actorWorkspaceRole === 'string'
        ? snapshot.actorWorkspaceRole
        : null;

    if (!actorWorkspaceRole && actorWorkspaceId) {
        const membership = await prisma.workspaceMember.findUnique({
            where: {
                workspaceId_userId: {
                    workspaceId: actorWorkspaceId,
                    userId
                }
            },
            select: { role: true }
        });
        actorWorkspaceRole = membership
            ? normalizeWorkspaceRole(membership.role)
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
router.get('/workspaces', async (req: AuthRequest, res: Response) => {
    try {
        const workspaces = await getUserWorkspaces(req.user.id as string);
        res.json({
            workspaces: workspaces.map((workspace: any) => ({
                ...workspace,
                role: normalizeWorkspaceRoleForResponse(workspace.role) || workspace.role
            }))
        });
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

        const access = await getUserEnterpriseAccess(req.user.id as string);
        if (access.organizationId) {
            await assertEnterpriseCompliance({
                enterpriseId: access.organizationId,
                action: 'WORKSPACE_CREATE',
                actorRole: normalizeComplianceActorRole((req.user as any)?.role || 'OWNER')
            });
        }

        const workspace = await createWorkspace({
            name: name.trim(),
            ownerId: req.user.id as string
        });

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.CREATE,
            'Workspace',
            `WORKSPACE_CREATED workspaceId=${workspace.id} name="${workspace.name}"`,
            workspace.id
        );

        res.status(201).json({ workspace });
    } catch (error: any) {
        console.error('[Enterprise] Create workspace error:', error);
        if (handleComplianceError(res, error)) return;
        if (handleEnterpriseLimitError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to create workspace' });
    }
});

// Workspace-level routes are blocked when the owning enterprise organization is restricted.
router.use('/workspaces/:id', enforceWorkspaceEnterpriseNotRestricted);
router.use('/workspaces/:id', enforceWorkspaceLifecycleGuard);

// Get current user's workspace membership context
router.get('/workspaces/:id/me', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const userId = req.user.id as string;
        const role = await getUserWorkspaceRole(id, userId);

        if (!role) {
            return respondWorkspaceForbidden(res, 'No access to this workspace');
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id },
            select: { id: true, name: true }
        });
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        const normalizedRole = normalizeWorkspaceRoleForResponse(role) || role;
        const permissions = {
            canViewOverview: true,
            canViewAnalytics: canPerformWorkspaceAction(role, 'view_analytics'),
            canViewUsage: canPerformWorkspaceAction(role, 'view_usage_logs'),
            canViewApiKeys: canPerformWorkspaceAction(role, 'view_api_keys'),
            canViewMembers: canPerformWorkspaceAction(role, 'view_members'),
            canViewOrganizations: canPerformWorkspaceAction(role, 'view_organizations'),
            canViewSecurity: canPerformWorkspaceAction(role, 'view_compliance_logs'),
            canManageMembers: canPerformWorkspaceAction(role, 'manage_members'),
            canManageOrganizations: canPerformWorkspaceAction(role, 'manage_organizations'),
            canManageApiKeys: canPerformWorkspaceAction(role, 'create_api_key')
        };

        return res.json({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            memberRole: normalizedRole,
            permissions,
            userId
        });
    } catch (error: any) {
        console.error('[Enterprise] Workspace me context error:', error);
        return res.status(500).json({ message: error.message || 'Failed to resolve workspace access' });
    }
});

// Get workspace details
router.get('/workspaces/:id', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await getUserWorkspaceRole(id, req.user.id as string);

        if (!role) {
            return respondWorkspaceForbidden(res);
        }

        const workspace = await getWorkspaceById(id);
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        res.json({ workspace, role: normalizeWorkspaceRoleForResponse(role) });
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
        if (!role || !canPerformWorkspaceAction(role, 'update_workspace')) {
            return respondWorkspaceForbidden(res);
        }

        const workspace = await updateWorkspace(id, { name });
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'Workspace',
            `WORKSPACE_UPDATED workspaceId=${id}${typeof name === 'string' ? ` name="${name}"` : ''}`,
            id
        );
        res.json({ workspace });
    } catch (error: any) {
        console.error('[Enterprise] Update workspace error:', error);
        res.status(400).json({ message: error.message || 'Failed to update workspace' });
    }
});

router.post('/workspaces/:id/suspend', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'update_workspace')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'WORKSPACE_SUSPEND',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const workspace = await getWorkspaceById(id);
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (workspace.status === WorkspaceStatus.SUSPENDED) {
            return res.status(409).json({ message: 'Workspace is already suspended' });
        }
        if (workspace.status === WorkspaceStatus.ARCHIVED) {
            return res.status(409).json({ message: 'Archived workspaces cannot be suspended' });
        }
        if (workspace.status === WorkspaceStatus.DELETED) {
            return res.status(410).json({ message: 'Workspace is deleted' });
        }

        const updated = await updateWorkspace(id, { status: WorkspaceStatus.SUSPENDED });
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.SUSPEND,
            'Workspace',
            `WORKSPACE_SUSPENDED workspaceId=${id}`,
            id
        );

        return res.json({ workspace: updated });
    } catch (error: any) {
        console.error('[Enterprise] Suspend workspace error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to suspend workspace' });
    }
});

router.post('/workspaces/:id/unsuspend', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'update_workspace')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'WORKSPACE_SUSPEND',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const workspace = await getWorkspaceById(id);
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (workspace.status !== WorkspaceStatus.SUSPENDED) {
            return res.status(409).json({ message: 'Workspace is not suspended' });
        }

        const updated = await updateWorkspace(id, { status: WorkspaceStatus.ACTIVE });
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'Workspace',
            `WORKSPACE_UNSUSPENDED workspaceId=${id}`,
            id
        );

        return res.json({ workspace: updated });
    } catch (error: any) {
        console.error('[Enterprise] Unsuspend workspace error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to unsuspend workspace' });
    }
});

router.post('/workspaces/:id/archive', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'update_workspace')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'WORKSPACE_ARCHIVE',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const workspace = await getWorkspaceById(id);
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (workspace.status === WorkspaceStatus.ARCHIVED) {
            return res.status(409).json({ message: 'Workspace is already archived' });
        }
        if (workspace.status === WorkspaceStatus.DELETED) {
            return res.status(410).json({ message: 'Workspace is deleted' });
        }

        const updated = await updateWorkspace(id, { status: WorkspaceStatus.ARCHIVED });
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'Workspace',
            `WORKSPACE_ARCHIVED workspaceId=${id}`,
            id
        );

        return res.json({ workspace: updated });
    } catch (error: any) {
        console.error('[Enterprise] Archive workspace error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to archive workspace' });
    }
});

router.post('/workspaces/:id/restore', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'update_workspace')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'WORKSPACE_RESTORE',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const workspace = await getWorkspaceById(id);
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (workspace.status !== WorkspaceStatus.ARCHIVED) {
            return res.status(409).json({ message: 'Only archived workspaces can be restored' });
        }

        const updated = await updateWorkspace(id, { status: WorkspaceStatus.ACTIVE });
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'Workspace',
            `WORKSPACE_RESTORED workspaceId=${id}`,
            id
        );

        return res.json({ workspace: updated });
    } catch (error: any) {
        console.error('[Enterprise] Restore workspace error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to restore workspace' });
    }
});

// Delete workspace (OWNER only)
router.delete('/workspaces/:id', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const password = typeof req.body?.password === 'string' ? req.body.password : '';

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'delete_workspace')) {
            return respondWorkspaceForbidden(res, 'Only the owner can delete a workspace');
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'WORKSPACE_DELETE',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        if (!password.trim()) {
            return res.status(400).json({ message: 'Password is required to delete workspace' });
        }

        const actor = await prisma.user.findUnique({
            where: { id: req.user.id as string },
            select: { password: true }
        });
        if (!actor) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const passwordMatches = await bcrypt.compare(password, actor.password);
        if (!passwordMatches) {
            return res.status(401).json({ message: 'Invalid password' });
        }

        const deletionSummary = await deleteWorkspace(id);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.DELETE,
            'Workspace',
            `WORKSPACE_DELETED workspaceId=${id} membersUnlinked=${deletionSummary.membersUnlinked} organizationsUnlinked=${deletionSummary.organizationsUnlinked} pendingInvitesCanceled=${deletionSummary.pendingInvitesCanceled} linkRequestsCanceled=${deletionSummary.linkRequestsCanceled}`,
            id,
            {
                actorType: 'USER',
                actorUserId: req.user.id as string,
                actorWorkspaceId: id,
                actorWorkspaceRole: normalizeWorkspaceRole(role) || role,
                cleanup: deletionSummary
            }
        );
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Delete workspace error:', error);
        if (handleComplianceError(res, error)) return;
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
        if (!role || !canPerformWorkspaceAction(role, 'view_members')) {
            return respondWorkspaceForbidden(res);
        }

        const members = await getWorkspaceMembers(id);
        res.json({
            members: members.map((member) => ({
                ...member,
                role: normalizeWorkspaceRoleForResponse(member.role) || member.role
            }))
        });
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
            return respondWorkspaceForbidden(res);
        }

        const normalizedRole = normalizeWorkspaceRole(String(memberRole || '').toUpperCase() as WorkspaceRoleInput);
        if (!normalizedRole || normalizedRole === 'OWNER') {
            return res.status(400).json({ message: 'Invalid role. Must be one of: ADMIN, DEVELOPER, ANALYST, AUDITOR' });
        }
        const safeRole = normalizeWorkspaceRoleForStorage(normalizedRole);

        // Lookup user by email
        const { prisma } = await import('../db/client');
        const targetUser = await prisma.user.findFirst({
            where: { email: email.trim().toLowerCase() },
            select: { id: true, name: true, email: true }
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'No user found with that email. They must register on VeriLnk first.' });
        }

        const member = await addWorkspaceMember(id, targetUser.id, safeRole, req.user.id as string);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.CREATE,
            'WorkspaceMember',
            `WORKSPACE_MEMBER_ADDED workspaceId=${id} userId=${targetUser.id} role=${normalizedRole}`,
            member.id
        );
        res.status(201).json({
            member: {
                ...member,
                role: normalizeWorkspaceRoleForResponse(member.role) || member.role
            }
        });
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
        const parsedQuery = z.object({ status: inviteStatusSchema.optional() }).safeParse(req.query);
        if (!parsedQuery.success) {
            return res.status(400).json({ message: 'Invalid invite status filter' });
        }

        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }

        const invites = await getWorkspaceInvites(
            id,
            parsedQuery.data.status ? parsedQuery.data.status as InviteStatus : undefined
        );
        res.json({
            invites: invites.map((invite) => ({
                ...invite,
                role: normalizeWorkspaceRoleForResponse(invite.role) || invite.role
            }))
        });
    } catch (error: any) {
        console.error('[Enterprise] List invites error:', error);
        res.status(500).json({ message: error.message || 'Failed to list invites' });
    }
});

router.post('/workspaces/:id/invites', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const parsedBody = createWorkspaceInviteSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                message: parsedBody.error.issues[0]?.message || 'Invalid invite payload'
            });
        }
        const { invitedEmail, invitedUserId, email, role: inviteRole } = parsedBody.data;

        const currentRole = await resolveWorkspaceRole(id, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }

        const normalizedInviteRole = normalizeWorkspaceRole(
            String(inviteRole || 'AUDITOR').toUpperCase() as WorkspaceRoleInput
        );
        const safeRole: WorkspaceMemberRole =
            normalizedInviteRole && normalizedInviteRole !== 'OWNER'
                ? normalizeWorkspaceRoleForStorage(normalizedInviteRole)
                : WorkspaceMemberRole.VIEWER;

        const resolvedEmail = invitedEmail || email;
        const { invite, token } = await createWorkspaceInvite(
            id,
            {
                invitedEmail: resolvedEmail,
                invitedUserId
            },
            safeRole,
            req.user.id as string
        );

        const inviteLink = `${getAppBaseUrl()}/enterprise/invite?token=${encodeURIComponent(token)}`;
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.CREATE,
            'WorkspaceInvite',
            `WORKSPACE_INVITE_CREATED workspaceId=${id} role=${normalizeWorkspaceRole(invite.role) || invite.role} target=${invite.invitedEmail || invite.invitedUserId || 'unknown'}`,
            invite.id
        );
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
    } catch (error: any) {
        console.error('[Enterprise] Create invite error:', error);
        if (handleEnterpriseLimitError(res, error)) return;
        if (error?.message === 'User not found') {
            return res.status(404).json({ message: 'User not found' });
        }
        if (error?.message === 'Invite already pending' || error?.message === 'User already a member') {
            return res.status(409).json({ message: error.message });
        }
        res.status(400).json({ message: error.message || 'Failed to create invite' });
    }
});

router.delete('/workspaces/:id/invites/:inviteId', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const inviteId = req.params.inviteId as string;

        const currentRole = await resolveWorkspaceRole(id, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }

        await cancelWorkspaceInvite(id, inviteId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'WorkspaceInvite',
            `WORKSPACE_INVITE_CANCELED workspaceId=${id} inviteId=${inviteId}`,
            inviteId
        );
        res.json({ success: true });
    } catch (error: any) {
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

router.post('/workspaces/:id/invites/:inviteId/revoke', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const inviteId = req.params.inviteId as string;

        const currentRole = await resolveWorkspaceRole(id, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }

        await revokeWorkspaceInvite(id, inviteId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'WorkspaceInvite',
            `WORKSPACE_INVITE_CANCELED workspaceId=${id} inviteId=${inviteId} mode=legacy_revoke`,
            inviteId
        );
        res.json({ success: true });
    } catch (error: any) {
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

router.get('/invites', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const invites = await listMyWorkspaceInvites(userId);
        res.json({ invites });
    } catch (error: any) {
        console.error('[Enterprise] List my invites error:', error);
        if (error?.message === 'User not found') {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(400).json({ message: error.message || 'Failed to list invites' });
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
            `WORKSPACE_INVITE_ACCEPTED workspaceId=${member.workspaceId} via=token`,
            member.id
        );
        res.json({ success: true, member });
    } catch (error: any) {
        console.error('[Enterprise] Accept invite error:', error);
        if (handleWorkspaceLifecycleError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to accept invite' });
    }
});

router.post('/invites/:inviteId/accept', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const inviteId = req.params.inviteId as string;
        const member = await acceptWorkspaceInviteById(inviteId, userId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.APPROVE,
            'WorkspaceInvite',
            `WORKSPACE_INVITE_ACCEPTED workspaceId=${member.workspaceId} inviteId=${inviteId} via=in_app`,
            inviteId
        );
        res.json({ success: true, member });
    } catch (error: any) {
        console.error('[Enterprise] Accept invite by id error:', error);
        if (handleWorkspaceLifecycleError(res, error)) return;
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

router.post('/invites/:inviteId/decline', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const inviteId = req.params.inviteId as string;
        await declineWorkspaceInviteById(inviteId, userId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.REJECT,
            'WorkspaceInvite',
            `WORKSPACE_INVITE_DECLINED inviteId=${inviteId}`,
            inviteId
        );
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Decline invite error:', error);
        if (handleWorkspaceLifecycleError(res, error)) return;
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
router.patch('/workspaces/:workspaceId/members/:memberId/role', async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const memberId = req.params.memberId as string;
        const parsedBody = updateWorkspaceMemberRoleSchema.safeParse(req.body);

        if (!parsedBody.success) {
            return res.status(400).json({
                message: parsedBody.error.issues[0]?.message || 'Invalid role payload'
            });
        }

        const currentRole = await getUserWorkspaceRole(workspaceId, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId,
            action: 'MEMBER_ROLE_CHANGE',
            actorRole: normalizeWorkspaceRole(currentRole) || currentRole
        });

        const normalizedRole = normalizeWorkspaceRole(parsedBody.data.role as WorkspaceRoleInput);
        if (!normalizedRole || normalizedRole === 'OWNER') {
            return res.status(400).json({ message: 'Invalid role. Must be one of: ADMIN, DEVELOPER, ANALYST, AUDITOR' });
        }

        const actorRole = normalizeWorkspaceRole(currentRole) || currentRole;
        const { member, oldRole } = await updateMemberRoleById(
            workspaceId,
            memberId,
            normalizeWorkspaceRoleForStorage(normalizedRole)
        );

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'WorkspaceMember',
            `WORKSPACE_MEMBER_ROLE_UPDATED workspaceId=${workspaceId} memberId=${memberId} userId=${member.userId} oldRole=${normalizeWorkspaceRole(oldRole) || oldRole} newRole=${normalizedRole} actorRole=${actorRole}`,
            member.id
        );

        res.json({
            member: {
                ...member,
                role: normalizeWorkspaceRoleForResponse(member.role) || member.role
            }
        });
    } catch (error: any) {
        console.error('[Enterprise] Update member role by id error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to update member role' });
    }
});

// Legacy route: Update member role by userId
router.patch('/workspaces/:id/members/:userId', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const userId = req.params.userId as string;
        const { role: newRole } = req.body;

        const currentRole = await getUserWorkspaceRole(id, req.user.id as string);
        if (!currentRole || !canPerformWorkspaceAction(currentRole, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'MEMBER_ROLE_CHANGE',
            actorRole: normalizeWorkspaceRole(currentRole) || currentRole
        });

        const normalizedRole = normalizeWorkspaceRole(String(newRole || '').toUpperCase() as WorkspaceRoleInput);
        if (!normalizedRole || normalizedRole === 'OWNER') {
            return res.status(400).json({ message: 'Invalid role. Must be one of: ADMIN, DEVELOPER, ANALYST, AUDITOR' });
        }

        const member = await updateMemberRole(id, userId, normalizeWorkspaceRoleForStorage(normalizedRole));
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'WorkspaceMember',
            `WORKSPACE_MEMBER_ROLE_UPDATED workspaceId=${id} userId=${userId} role=${normalizedRole}`,
            member.id
        );
        res.json({
            member: {
                ...member,
                role: normalizeWorkspaceRoleForResponse(member.role) || member.role
            }
        });
    } catch (error: any) {
        console.error('[Enterprise] Update member error:', error);
        if (handleComplianceError(res, error)) return;
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
            return respondWorkspaceForbidden(res);
        }

        await removeMember(id, userId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.DELETE,
            'WorkspaceMember',
            `WORKSPACE_MEMBER_REMOVED workspaceId=${id} userId=${userId}`,
            userId
        );
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
            return respondWorkspaceForbidden(res, 'Only the owner can transfer ownership');
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'MEMBER_ROLE_CHANGE',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        await transferOwnership(id, req.user.id as string, newOwnerId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'Workspace',
            `WORKSPACE_OWNERSHIP_TRANSFERRED workspaceId=${id} fromUserId=${req.user.id as string} toUserId=${newOwnerId}`,
            id
        );
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Transfer ownership error:', error);
        if (handleComplianceError(res, error)) return;
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
        if (!role || !canPerformWorkspaceAction(role, 'view_organizations')) {
            return respondWorkspaceForbidden(res);
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
        if (!role || !canPerformWorkspaceAction(role, 'manage_organizations')) {
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

        await assertEnterpriseCompliance({
            enterpriseId,
            action: 'ORGANIZATION_LINK',
            actorRole: normalizeComplianceActorRole(normalizeWorkspaceRole(role) || role)
        });

        const payload = createEnterpriseOrganizationSchema.parse(req.body);
        const result = await createEnterpriseOrganizationAndLink({
            workspaceId: id,
            enterpriseId,
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
            `ENTERPRISE_ORG_CREATED enterprise=${enterpriseId} workspace=${id} organization=${result.organization.id} request=${result.linkRequest.id} status=PENDING_APPROVAL`,
            result.organization.id
        );

        res.status(201).json({
            organization: result.organization,
            linkRequest: result.linkRequest
        });
    } catch (error: any) {
        console.error('[Enterprise] Create org for workspace error:', error);
        if (handleComplianceError(res, error)) return;
        if (error?.code === 'ORG_RESTRICTED') {
            return respondOrgRestricted(res);
        }
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
        if (!role || !canPerformWorkspaceAction(role, 'view_organizations')) {
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

        const requests = await listWorkspaceLinkRequests(id, enterpriseId);
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
        if (!role || !canPerformWorkspaceAction(role, 'manage_organizations')) {
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

        await assertEnterpriseCompliance({
            enterpriseId,
            action: 'ORGANIZATION_LINK',
            actorRole: normalizeComplianceActorRole(normalizeWorkspaceRole(role) || role)
        });

        if ('organizationId' in payload && payload.organizationId) {
            const restricted = await isOrganizationRestricted(payload.organizationId);
            if (restricted) {
                return respondOrgRestricted(res);
            }
        }

        const request = await createWorkspaceLinkRequest({
            workspaceId: id,
            enterpriseId,
            requestedByUserId: req.user.id as string,
            linkMethod: 'linkMethod' in payload ? payload.linkMethod : undefined,
            identifier: 'identifier' in payload ? payload.identifier : undefined,
            organizationId: 'organizationId' in payload ? payload.organizationId : undefined,
            message: payload.message
        });

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.CREATE,
            'EnterpriseOrgLinkRequest',
            `ENTERPRISE_LINK_REQUEST_CREATED enterprise=${enterpriseId} workspace=${id} organization=${request.organizationId}`,
            request.id
        );
        res.status(201).json({ request });
    } catch (error: any) {
        console.error('[Enterprise] Create link request error:', error);
        if (handleComplianceError(res, error)) return;
        if (error?.code === 'ORG_RESTRICTED') {
            return respondOrgRestricted(res);
        }
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
        const linkRequestModel = (prisma as any).enterpriseOrgLinkRequest;
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

        const role = await resolveWorkspaceRole(existingRequest.workspaceId, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'manage_organizations')) {
            return respondWorkspaceForbidden(res);
        }

        await assertWorkspaceLifecycleAccess({
            workspaceId: existingRequest.workspaceId,
            actorRole: normalizeWorkspaceRole(role) || role,
            mode: 'ADMIN'
        });

        await assertEnterpriseCompliance({
            enterpriseId: existingRequest.enterpriseId,
            action: 'ORGANIZATION_UNLINK',
            actorRole: normalizeComplianceActorRole(normalizeWorkspaceRole(role) || role)
        });

        if (existingRequest.organizationId) {
            const restricted = await isOrganizationRestricted(existingRequest.organizationId);
            if (restricted) {
                return respondOrgRestricted(res);
            }
        }

        await cancelWorkspaceLinkRequest({
            requestId,
            enterpriseId: existingRequest.enterpriseId,
            requestedByUserId: req.user.id as string
        });

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'EnterpriseOrgLinkRequest',
            `ENTERPRISE_LINK_REQUEST_CANCELED enterprise=${existingRequest.enterpriseId} workspace=${existingRequest.workspaceId} request=${requestId}`,
            requestId
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Cancel link request error:', error);
        if (handleWorkspaceLifecycleError(res, error)) return;
        if (handleComplianceError(res, error)) return;
        if (error?.code === 'ORG_RESTRICTED') {
            return respondOrgRestricted(res);
        }
        res.status(400).json({ message: error.message || 'Failed to cancel link request' });
    }
});

// Unlink organization
router.delete('/workspaces/:id/organizations/:orgId', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const orgId = req.params.orgId as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'manage_organizations')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'ORGANIZATION_UNLINK',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const restricted = await isOrganizationRestricted(orgId);
        if (restricted) {
            return respondOrgRestricted(res);
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
        if (handleComplianceError(res, error)) return;
        if (error?.code === 'ORG_RESTRICTED') {
            return respondOrgRestricted(res);
        }
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
        if (!role || !canPerformWorkspaceAction(role, 'manage_organizations')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'ORGANIZATION_UNLINK',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const restricted = await isOrganizationRestricted(organizationId);
        if (restricted) {
            return respondOrgRestricted(res);
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
        if (handleComplianceError(res, error)) return;
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
router.get('/workspaces/:id/api-keys', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_api_keys')) {
            return respondWorkspaceForbidden(res);
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
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'API_KEY_LIFECYCLE',
            actorRole: normalizeWorkspaceRole(role) || role
        });

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
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.CREATE,
            'ApiKey',
            `WORKSPACE_API_KEY_CREATED workspaceId=${id} keyId=${result.apiKey.id} scopes=${result.apiKey.scopes.join('|')}`,
            result.apiKey.id
        );
        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    } catch (error: any) {
        console.error('[Enterprise] Create API key error:', error);
        if (handleComplianceError(res, error)) return;
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
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'API_KEY_LIFECYCLE',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        // Verify key belongs to workspace
        const apiKey = await getApiKeyById(keyId);
        if (!apiKey) {
            return res.status(404).json({ message: 'API key not found' });
        }
        if (apiKey.workspaceId !== id) {
            return res.status(400).json({ message: 'API key does not belong to this workspace' });
        }

        await revokeApiKey(keyId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.DELETE,
            'ApiKey',
            `WORKSPACE_API_KEY_REVOKED workspaceId=${id} keyId=${keyId}`,
            keyId
        );
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] Revoke API key error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to revoke API key' });
    }
});

// Rotate API key
router.post('/workspaces/:id/api-keys/:keyId/rotate', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const keyId = req.params.keyId as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'rotate_api_key')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'API_KEY_LIFECYCLE',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const apiKey = await getApiKeyById(keyId);
        if (!apiKey) {
            return res.status(404).json({ message: 'API key not found' });
        }
        if (apiKey.workspaceId !== id) {
            return res.status(400).json({ message: 'API key does not belong to this workspace' });
        }

        const result = await rotateApiKey(keyId, req.user.id as string);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'ApiKey',
            `WORKSPACE_API_KEY_ROTATED workspaceId=${id} keyId=${keyId}`,
            keyId
        );

        res.status(201).json({
            apiKey: result.apiKey,
            plainTextKey: result.plainTextKey,
            warning: 'Store this key securely. It will not be shown again.'
        });
    } catch (error: any) {
        console.error('[Enterprise] Rotate API key error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to rotate API key' });
    }
});

router.post('/workspaces/:id/api-keys/:keyId/copy', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const keyId = req.params.keyId as string;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'copy_api_key')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'API_KEY_LIFECYCLE',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const apiKey = await getApiKeyById(keyId);
        if (!apiKey) {
            return res.status(404).json({ message: 'API key not found' });
        }
        if (apiKey.workspaceId !== id) {
            return res.status(400).json({ message: 'API key does not belong to this workspace' });
        }
        if (apiKey.isRevoked) {
            return res.status(409).json({ message: 'Cannot copy a revoked key' });
        }

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.OTHER,
            'ApiKey',
            `API_KEY_COPIED workspaceId=${id} keyId=${keyId}`,
            keyId
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Enterprise] API key copy audit error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(400).json({ message: error.message || 'Failed to audit key copy' });
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
            return respondWorkspaceForbidden(res);
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
            return respondWorkspaceForbidden(res);
        }

        const stats = await getWorkspaceUsageStats(id, days ? parseInt(String(days), 10) : 30);
        res.json(stats);
    } catch (error: any) {
        console.error('[Enterprise] Get usage stats error:', error);
        res.status(500).json({ message: error.message || 'Failed to get usage stats' });
    }
});

router.get('/workspaces/:id/exports/usage', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'export_usage')) {
            return respondWorkspaceForbidden(res);
        }

        const range = normalizeRange(req.query.range, '30');
        const rangeDays = Number(range);
        const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

        const usageLogs = await prisma.apiUsageLog.findMany({
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
            const safe = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
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

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.OTHER,
            'ApiUsageExport',
            `USAGE_EXPORTED workspaceId=${id} format=csv range=${range}`,
            id
        );

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="workspace-usage-${id}-${range}.csv"`);
        res.send(csvLines.join('\n'));
    } catch (error: any) {
        console.error('[Enterprise] Export usage error:', error);
        res.status(500).json({ message: error.message || 'Failed to export usage' });
    }
});

// ============================================
// Security & Compliance
// ============================================

router.get('/workspaces/:id/audit-logs', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_compliance_logs')) {
            return respondWorkspaceForbidden(res);
        }

        const policy = await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'COMPLIANCE_AUDIT_VIEW',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const parsedQuery = workspaceAuditLogQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return res.status(400).json({ message: 'Invalid audit log filters' });
        }

        const page = parsedQuery.data.page ?? 1;
        const limit = parsedQuery.data.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {
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
            const createdAt: Record<string, Date> = {};
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
        } else {
            // Safe default: current enterprise retention policy
            const retentionDays = Math.max(1, policy?.logRetentionDays || 30);
            where.createdAt = {
                gte: new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
            };
        }

        const [logs, total] = await Promise.all([
            prisma.adminLog.findMany({
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
            prisma.adminLog.count({ where })
        ]);

        const actorMetadataByLogId = new Map(
            logs.map((log) => [log.id, parseAuditActorMetadata(log.details, log.snapshot)])
        );
        const actorUserIds = Array.from(
            new Set(
                Array.from(actorMetadataByLogId.values())
                    .map((meta) => meta.actorUserId)
                    .filter((value): value is string => Boolean(value))
            )
        );

        const [actorUsers, memberships] = actorUserIds.length > 0
            ? await Promise.all([
                prisma.user.findMany({
                    where: { id: { in: actorUserIds } },
                    select: { id: true, name: true, firstName: true, lastName: true, email: true }
                }),
                prisma.workspaceMember.findMany({
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
                    ? normalizeWorkspaceRole(parsedActor.actorWorkspaceRole as WorkspaceRoleInput) || parsedActor.actorWorkspaceRole
                    : null;
                const currentRole = membership ? normalizeWorkspaceRole(membership.role) : null;
                const actorWorkspaceRole = snapshotRole || currentRole;
                const actorLabel = actorUser
                    ? `${actorUser.firstName || ''} ${actorUser.lastName || ''}`.trim()
                        || actorUser.name
                        || actorUser.email
                    : actorUserId;

                return {
                    ...log,
                    actor: {
                        type: 'USER' as const,
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
                    type: 'ADMIN' as const,
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
    } catch (error: any) {
        console.error('[Enterprise] Workspace audit logs error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(500).json({ message: error.message || 'Failed to load audit logs' });
    }
});

router.get('/workspaces/:id/exports/audit-logs', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'export_audit_logs')) {
            return respondWorkspaceForbidden(res);
        }

        await assertComplianceForWorkspaceAction({
            workspaceId: id,
            action: 'COMPLIANCE_AUDIT_EXPORT',
            actorRole: normalizeWorkspaceRole(role) || role
        });

        const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'csv';
        const range = normalizeRange(req.query.range, '30');
        const rangeDays = Number(range);
        const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

        const where: any = {
            OR: [
                { details: { contains: `workspaceId=${id}` } },
                { details: { contains: `workspace=${id}` } },
                { entity: 'Workspace', targetId: id }
            ],
            createdAt: { gte: since }
        };

        const logs = await prisma.adminLog.findMany({
            where,
            include: {
                admin: {
                    select: { id: true, firstName: true, lastName: true, email: true, role: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 10000
        });

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.OTHER,
            'WorkspaceAuditExport',
            `AUDIT_LOGS_EXPORTED workspaceId=${id} format=${format} range=${range}`,
            id
        );

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

        if (format === 'json') {
            const payload = logs.map((log) => ({
                id: log.id,
                action: log.action,
                entity: log.entity,
                targetId: log.targetId,
                details: log.details,
                ipAddress: log.ipAddress,
                userAgent: log.userAgent,
                createdAt: log.createdAt,
                actor: log.admin
                    ? {
                        id: log.admin.id,
                        name: `${log.admin.firstName || ''} ${log.admin.lastName || ''}`.trim() || log.admin.email,
                        email: log.admin.email,
                        role: log.admin.role
                    }
                    : null
            }));
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="workspace-audit-${id}-${range}.json"`);
            return res.send(JSON.stringify(payload, null, 2));
        }

        const safe = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
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
    } catch (error: any) {
        console.error('[Enterprise] Export audit logs error:', error);
        if (handleComplianceError(res, error)) return;
        res.status(500).json({ message: error.message || 'Failed to export audit logs' });
    }
});

router.get('/workspaces/:id/sessions', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_compliance_logs')) {
            return respondWorkspaceForbidden(res);
        }

        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId: id },
            select: {
                userId: true,
                role: true
            }
        });

        const memberUserIds = members.map((member) => member.userId);
        const users = memberUserIds.length
            ? await prisma.user.findMany({
                where: { id: { in: memberUserIds } },
                select: { id: true, email: true, firstName: true, lastName: true, name: true }
            })
            : [];
        const userMap = new Map(users.map((user) => [user.id, user]));
        const sessions = await listActiveSessionsForActorIds(SessionActorType.ORG, memberUserIds);
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
    } catch (error: any) {
        console.error('[Enterprise] Workspace sessions error:', error);
        res.status(500).json({ message: error.message || 'Failed to load sessions' });
    }
});

router.post('/workspaces/:id/sessions/:sessionId/revoke', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const sessionId = req.params.sessionId as string;

        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'manage_members')) {
            return respondWorkspaceForbidden(res);
        }

        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId: id },
            select: { userId: true }
        });
        const memberUserIds = members.map((member) => member.userId);

        await revokeSessionForActorIds(SessionActorType.ORG, memberUserIds, sessionId);
        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'AuthSession',
            `WORKSPACE_SESSION_REVOKED workspaceId=${id} sessionId=${sessionId}`,
            sessionId
        );

        res.json({ success: true });
    } catch (error: any) {
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
router.get('/workspaces/:id/analytics', async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { range } = req.query;

        const role = await getUserWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'view_analytics')) {
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
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
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
        }

        const range = normalizeRange(req.query.range, '30');
        const data = await getEnterpriseAnalyticsCategories(id, range);
        res.json(data);
    } catch (error: any) {
        console.error('[Enterprise] Category analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to get category analytics' });
    }
});

const exportWorkspaceAnalyticsHandler = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const role = await resolveWorkspaceRole(id, req.user.id as string);
        if (!role || !canPerformWorkspaceAction(role, 'export_analytics')) {
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
        }

        const range = normalizeRange(req.query.range, '30');
        const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'csv';
        const data = await getEnterpriseAnalyticsExportData(id, range);
        const generatedAt = new Date();
        const workspace = await prisma.workspace.findUnique({
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

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.OTHER,
            'WorkspaceAnalyticsExport',
            `ANALYTICS_EXPORTED workspaceId=${id} format=${format} range=${range}`,
            id
        );

        if (format === 'pdf') {
            const filename = buildAnalyticsReportFilename(entityName, 'workspace', id, 'pdf', generatedAt, `${range}d`);
            const pdfBuffer = await buildAnalyticsReportPdfBuffer({
                entityName,
                rangeLabel: `Last ${rangeDays} days`,
                generatedAt,
                totalViews: data.summary.totals.views,
                totalClicks: data.summary.totals.clicks,
                totalCtr: data.summary.totals.ctr,
                rows
            });
            applyNoStoreHeaders(res);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', buildInvoiceContentDisposition(filename));
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
            return;
        }

        const filename = buildAnalyticsReportFilename(entityName, 'workspace', id, 'csv', generatedAt, `${range}d`);
        const csv = buildAnalyticsReportCsv(rows);

        applyNoStoreHeaders(res);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', buildInvoiceContentDisposition(filename));
        res.send(csv);
    } catch (error: any) {
        console.error('[Enterprise] Export analytics error:', error);
        res.status(500).json({ message: error.message || 'Failed to export analytics' });
    }
};

router.get('/workspaces/:id/analytics/export', exportWorkspaceAnalyticsHandler);
router.get('/workspaces/:id/exports/analytics', exportWorkspaceAnalyticsHandler);

// ============================================
// Enterprise Billing
// ============================================

const downloadEnterpriseInvoicePdfHandler = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
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

        const invoiceId = req.params.invoiceId as string;
        const invoice = await prisma.invoice.findFirst({
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
                                planType: true,
                                country: {
                                    select: {
                                        code: true
                                    }
                                }
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
            ? invoice.metadata as Record<string, unknown>
            : {};

        const planName = (
            (typeof metadata.planType === 'string' ? metadata.planType : null)
            || invoice.subscription?.planType
            || invoice.billingAccount.organization.planType
            || 'ENTERPRISE'
        );

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
        const pdfBuffer = await buildInvoicePdfBuffer({
            invoiceNumber,
            invoiceDate: invoice.createdAt,
            status: invoice.status,
            dueAt: invoice.dueAt,
            paidAt: invoice.paidAt,
            periodStart,
            periodEnd,
            planName,
            planType: planName,
            billingGateway: invoice.billingAccount.gateway,
            billToCountryCode: invoice.billingAccount.organization.country?.code || null,
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

        const filename = buildInvoiceDownloadFilename({
            organizationName: invoice.billingAccount.organization.name,
            organizationId: invoice.billingAccount.organization.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceId: invoice.id,
            invoiceDate: invoice.createdAt
        });
        applyNoStoreHeaders(res);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            buildInvoiceContentDisposition(filename)
        );
        res.status(200).send(pdfBuffer);
    } catch (error: any) {
        console.error('[Enterprise] Download invoice error:', error);
        res.status(500).json({ message: error.message || 'Failed to download invoice' });
    }
};

router.get('/invoices/:invoiceId/download', downloadEnterpriseInvoicePdfHandler);
router.get('/invoices/:invoiceId/pdf', downloadEnterpriseInvoicePdfHandler);

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

        const graceSuppressed = await isEnterpriseManagedSyncedOrganization(context.organization.id);
        const billingLifecycle = computePlanLifecycleState({
            planType: context.organization.planType,
            paidTermEndAt: context.organization.planEndAt || null,
            now: new Date(),
            graceSuppressed
        });

        applyNoStoreHeaders(res);
        res.json({
            organization: context.organization,
            role: context.role,
            canEdit: context.canEdit,
            entitlements: context.access.entitlements || null,
            billingLifecycle: {
                paidTermEndAt: billingLifecycle.paidTermEndAt,
                graceEndsAt: billingLifecycle.graceEndsAt,
                graceDays: billingLifecycle.graceDays,
                isInGrace: billingLifecycle.isInGrace
            }
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
// Enterprise Compliance Policy
// ============================================

router.get('/compliance/policy', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const context = await resolveEnterpriseProfileContext(userId);
        if (!context) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }

        const actorRole = normalizeComplianceActorRole(
            context.role || (req.user?.role ? String(req.user.role) : null)
        );

        await assertEnterpriseCompliance({
            enterpriseId: context.organization.id,
            action: 'COMPLIANCE_POLICY_VIEW',
            actorRole
        });

        const policy = await getEnterpriseCompliancePolicy(context.organization.id);
        const canEditPolicy = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';

        return res.json({
            policy,
            role: context.role,
            canEditPolicy
        });
    } catch (error: any) {
        if (handleComplianceError(res, error)) return;
        console.error('[Enterprise] Compliance policy read error:', error);
        return res.status(500).json({ message: error.message || 'Failed to load compliance policy' });
    }
});

router.patch('/compliance/policy', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const context = await resolveEnterpriseProfileContext(userId);
        if (!context) {
            return res.status(403).json({ message: 'Enterprise access required' });
        }

        const actorRole = normalizeComplianceActorRole(
            context.role || (req.user?.role ? String(req.user.role) : null)
        );

        await assertEnterpriseCompliance({
            enterpriseId: context.organization.id,
            action: 'COMPLIANCE_POLICY_UPDATE',
            actorRole
        });

        const payload = enterpriseCompliancePolicyUpdateSchema.parse(req.body);
        const policy = await updateEnterpriseCompliancePolicy(context.organization.id, payload);

        await logEnterpriseAdminActionIfApplicable(
            req,
            AuditActionType.UPDATE,
            'EnterpriseCompliancePolicy',
            `ENTERPRISE_COMPLIANCE_POLICY_UPDATED enterpriseId=${context.organization.id} logRetentionDays=${policy.logRetentionDays} requireStrongPasswords=${policy.requireStrongPasswords}`,
            policy.id
        );

        return res.json({ policy });
    } catch (error: any) {
        if (handleComplianceError(res, error)) return;
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.issues });
        }
        console.error('[Enterprise] Compliance policy update error:', error);
        return res.status(400).json({ message: error.message || 'Failed to update compliance policy' });
    }
});

// ============================================
// Enterprise Access Check
// ============================================

router.get('/usage/summary', async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id as string | undefined;
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

        const memberships = await prisma.workspaceMember.findMany({
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

        const readableWorkspaceIds = Array.from(
            new Set(
                memberships
                    .filter((membership) => {
                        const normalizedRole = normalizeWorkspaceRole(membership.role);
                        if (!normalizedRole) return false;
                        return canPerformWorkspaceAction(normalizedRole, 'view_usage_logs')
                            || canPerformWorkspaceAction(normalizedRole, 'view_analytics');
                    })
                    .map((membership) => membership.workspaceId)
            )
        );

        if (readableWorkspaceIds.length === 0) {
            return respondWorkspaceForbidden(res, 'Insufficient permissions');
        }

        const linkedOrgRows = await prisma.workspaceOrganization.findMany({
            where: { workspaceId: { in: readableWorkspaceIds } },
            select: { organizationId: true }
        });

        const linkedOrganizationIds = new Set(linkedOrgRows.map((row) => row.organizationId));
        linkedOrganizationIds.delete(context.organization.id);
        const linkedOrganizationCount = linkedOrganizationIds.size;

        const apiKeyCount = await prisma.apiKey.count({
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
        const usageWhere: Prisma.ApiUsageLogWhereInput = {
            createdAt: { gte: since },
            apiKey: {
                workspaceId: { in: readableWorkspaceIds }
            }
        };

        const [requests, success, errors, rateLimited] = await prisma.$transaction([
            prisma.apiUsageLog.count({ where: usageWhere }),
            prisma.apiUsageLog.count({
                where: {
                    ...usageWhere,
                    statusCode: { gte: 200, lt: 400 }
                }
            }),
            prisma.apiUsageLog.count({
                where: {
                    ...usageWhere,
                    statusCode: { gte: 400 }
                }
            }),
            prisma.apiUsageLog.count({
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
    } catch (error: any) {
        console.error('[Enterprise] Usage summary error:', error);
        res.status(500).json({ message: error.message || 'Failed to load enterprise usage summary' });
    }
});

// Check if user has enterprise access
router.get('/access', async (req: AuthRequest, res: Response) => {
    try {
        const access = await getUserEnterpriseAccess(req.user.id as string);
        applyNoStoreHeaders(res);
        res.json(access);
    } catch (error: any) {
        console.error('[Enterprise] Check access error:', error);
        res.status(500).json({ message: error.message || 'Failed to check access' });
    }
});

export default router;
