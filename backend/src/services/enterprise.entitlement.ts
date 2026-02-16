/**
 * Enterprise Entitlement Service
 * 
 * Resolves enterprise-specific entitlements for organizations and workspaces.
 * Used to gate access to API keys, multi-org features, and advanced analytics.
 */

import { PlanType, PlanStatus, OrgStatus, WorkspaceMemberRole } from '@prisma/client';
import { prisma } from '../db/client';
import {
    DEFAULT_ENTERPRISE_QUOTAS,
    type EnterpriseQuotaLimits,
    getEnterpriseQuotaSnapshotByOrganizationId,
    normalizeEnterpriseQuotaLimits
} from './enterprise-quota.service';

// ============================================
// Types
// ============================================

export interface EnterpriseEntitlements {
    // Feature flags
    apiAccess: boolean;           // Can use API keys
    multiOrg: boolean;            // Can link multiple orgs to workspace
    advancedAnalytics: boolean;   // Cross-org analytics
    auditExport: boolean;         // Can export audit logs

    // Limits
    maxWorkspaces: number;        // Max workspaces per enterprise
    maxApiKeys: number;           // Max API keys per workspace
    maxLinkedOrgs: number;        // Max orgs per workspace
    maxMembers: number;           // Max members/invites per enterprise

    // Rate limiting
    apiRateLimitPerMinute: number;  // Default 100/min
    apiBurstLimit: number;          // Max requests in 5 seconds
}

export interface WorkspaceEntitlementContext {
    workspaceId: string;
    userId: string;
    userRole: WorkspaceRoleInput;
    linkedOrganizations: Array<{
        organizationId: string;
        planType: PlanType;
        planStatus: PlanStatus;
        status: OrgStatus;
    }>;
}

// ============================================
// Constants
// ============================================

const ENTERPRISE_DEFAULTS: EnterpriseEntitlements = {
    apiAccess: true,
    multiOrg: true,
    advancedAnalytics: true,
    auditExport: true,
    maxWorkspaces: DEFAULT_ENTERPRISE_QUOTAS.maxWorkspaces,
    maxApiKeys: DEFAULT_ENTERPRISE_QUOTAS.maxApiKeys,
    maxLinkedOrgs: DEFAULT_ENTERPRISE_QUOTAS.maxLinkedOrgs,
    maxMembers: DEFAULT_ENTERPRISE_QUOTAS.maxMembers,
    apiRateLimitPerMinute: 100,
    apiBurstLimit: 20
};

const NO_ENTERPRISE_ENTITLEMENTS: EnterpriseEntitlements = {
    apiAccess: false,
    multiOrg: false,
    advancedAnalytics: false,
    auditExport: false,
    maxWorkspaces: 0,
    maxApiKeys: 0,
    maxLinkedOrgs: 1,
    maxMembers: 0,
    apiRateLimitPerMinute: 0,
    apiBurstLimit: 0
};

const resolveEffectiveEnterpriseApiRateLimit = (
    workspaceRates: Array<number | null | undefined>
): number => {
    const validRates = workspaceRates.filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
    );
    if (validRates.length === 0) {
        return ENTERPRISE_DEFAULTS.apiRateLimitPerMinute;
    }

    // When multiple workspace overrides exist, use the most frequent value as
    // the enterprise-level "default" shown in dashboard-level summaries.
    const frequencies = new Map<number, number>();
    for (const rate of validRates) {
        frequencies.set(rate, (frequencies.get(rate) || 0) + 1);
    }

    let selectedRate = ENTERPRISE_DEFAULTS.apiRateLimitPerMinute;
    let selectedCount = -1;
    for (const [rate, count] of frequencies.entries()) {
        if (count > selectedCount || (count === selectedCount && rate < selectedRate)) {
            selectedRate = rate;
            selectedCount = count;
        }
    }

    return selectedRate;
};

// ============================================
// Core Functions
// ============================================

export type WorkspaceRoleCanonical = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR';
export type WorkspaceRoleLegacy = 'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER';
export type WorkspaceRoleInput = WorkspaceRoleCanonical | WorkspaceRoleLegacy;

export type WorkspacePermissionAction =
    | 'create_workspace'
    | 'delete_workspace'
    | 'transfer_ownership'
    | 'update_workspace'
    | 'view_members'
    | 'manage_members'
    | 'view_organizations'
    | 'manage_organizations'
    | 'link_org'
    | 'unlink_org'
    | 'view_api_keys'
    | 'create_api_key'
    | 'rotate_api_key'
    | 'revoke_api_key'
    | 'copy_api_key'
    | 'view_usage_logs'
    | 'view_analytics'
    | 'view_compliance_logs'
    | 'export_analytics'
    | 'export_usage'
    | 'export_audit_logs'
    | 'view_billing'
    | 'manage_billing';

export const normalizeWorkspaceRole = (
    role: WorkspaceRoleInput | WorkspaceMemberRole | null | undefined
): WorkspaceRoleCanonical | null => {
    if (!role) return null;
    if (role === 'EDITOR') return 'DEVELOPER';
    if (role === 'VIEWER') return 'AUDITOR';
    if (role === 'OWNER' || role === 'ADMIN' || role === 'ANALYST' || role === 'DEVELOPER' || role === 'AUDITOR') {
        return role;
    }
    return null;
};

export const normalizeWorkspaceRoleForStorage = (
    role: WorkspaceRoleInput | WorkspaceMemberRole
): WorkspaceMemberRole => {
    const normalized = normalizeWorkspaceRole(role);
    switch (normalized) {
        case 'DEVELOPER':
            return WorkspaceMemberRole.EDITOR;
        case 'AUDITOR':
            return WorkspaceMemberRole.VIEWER;
        case 'OWNER':
            return WorkspaceMemberRole.OWNER;
        case 'ADMIN':
            return WorkspaceMemberRole.ADMIN;
        case 'ANALYST':
            return WorkspaceMemberRole.ANALYST;
        default:
            return WorkspaceMemberRole.VIEWER;
    }
};

/**
 * Resolve enterprise entitlements based on plan type and persisted organization quota overrides.
 */
export const resolveEnterprisePlanEntitlements = (
    planType: PlanType,
    quotas?: Partial<EnterpriseQuotaLimits>
): EnterpriseEntitlements => {
    if (planType !== PlanType.ENTERPRISE) {
        return { ...NO_ENTERPRISE_ENTITLEMENTS };
    }

    const normalizedQuotas = normalizeEnterpriseQuotaLimits({
        enterpriseMaxWorkspaces: quotas?.maxWorkspaces ?? null,
        enterpriseMaxLinkedOrgs: quotas?.maxLinkedOrgs ?? null,
        enterpriseMaxApiKeys: quotas?.maxApiKeys ?? null,
        enterpriseMaxMembers: quotas?.maxMembers ?? null
    });
    return {
        ...ENTERPRISE_DEFAULTS,
        maxWorkspaces: normalizedQuotas.maxWorkspaces,
        maxLinkedOrgs: normalizedQuotas.maxLinkedOrgs,
        maxApiKeys: normalizedQuotas.maxApiKeys,
        maxMembers: normalizedQuotas.maxMembers
    };
};

/**
 * Check if an organization has active enterprise plan
 */
export const hasActiveEnterprisePlan = (org: {
    planType: PlanType;
    planStatus: PlanStatus;
    status: OrgStatus;
    isRestricted: boolean;
    planEndAt: Date | null;
}): boolean => {
    if (org.planType !== PlanType.ENTERPRISE) return false;
    if (org.planStatus !== PlanStatus.ACTIVE) return false;
    if (org.status !== OrgStatus.APPROVED) return false;
    if (org.isRestricted) return false;

    // Check expiry
    if (org.planEndAt && org.planEndAt.getTime() < Date.now()) {
        return false;
    }

    return true;
};

/**
 * Check if user has enterprise access through any of their organizations
 */
export const getUserEnterpriseAccess = async (userId: string): Promise<{
    hasAccess: boolean;
    organizationId?: string;
    entitlements?: EnterpriseEntitlements;
    usage?: {
        workspaces: number;
        linkedOrgs: number;
        apiKeys: number;
        members: number;
    };
}> => {
    // Check if user belongs to an enterprise organization
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            organization: {
                select: {
                    id: true,
                    planType: true,
                    planStatus: true,
                    status: true,
                    isRestricted: true,
                    planEndAt: true
                }
            }
        }
    });

    if (!user?.organization) {
        return { hasAccess: false };
    }

    if (!hasActiveEnterprisePlan(user.organization)) {
        return { hasAccess: false };
    }

    const [snapshot, linkedWorkspaces] = await Promise.all([
        getEnterpriseQuotaSnapshotByOrganizationId(user.organization.id),
        prisma.workspace.findMany({
            where: {
                organizations: {
                    some: { organizationId: user.organization.id }
                }
            },
            select: {
                customApiRateLimitRpm: true
            }
        })
    ]);

    const baseEntitlements = resolveEnterprisePlanEntitlements(PlanType.ENTERPRISE, snapshot.limits);
    const effectiveApiRateLimit = resolveEffectiveEnterpriseApiRateLimit(
        linkedWorkspaces.map((workspace) => workspace.customApiRateLimitRpm)
    );

    return {
        hasAccess: true,
        organizationId: user.organization.id,
        entitlements: {
            ...baseEntitlements,
            apiRateLimitPerMinute: effectiveApiRateLimit
        },
        usage: snapshot.usage
    };
};

/**
 * Get enterprise entitlements for a workspace
 * A workspace has enterprise access if any linked org has active enterprise plan
 * Respects workspace-level rate limit overrides (set by Super Admin)
 */
export const getWorkspaceEntitlements = async (workspaceId: string): Promise<{
    hasAccess: boolean;
    entitlements: EnterpriseEntitlements;
    enterpriseOrgIds: string[];
}> => {
    const linkedOrgs = await prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        include: {
            workspace: true
        }
    });

    // Get workspace for custom overrides
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { customApiRateLimitRpm: true, customApiDailyQuota: true }
    });

    // Get all organization details
    const orgIds = linkedOrgs.map(lo => lo.organizationId);
    const organizations = await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        orderBy: { createdAt: 'asc' }
    });

    // Find which orgs have active enterprise plans
    const enterpriseOrgs = organizations.filter(hasActiveEnterprisePlan);

    if (enterpriseOrgs.length === 0) {
        return {
            hasAccess: false,
            entitlements: NO_ENTERPRISE_ENTITLEMENTS,
            enterpriseOrgIds: []
        };
    }

    const primaryEnterpriseOrg = enterpriseOrgs[0];
    const quotaSnapshot = await getEnterpriseQuotaSnapshotByOrganizationId(primaryEnterpriseOrg.id);
    // Apply workspace-level overrides (if set by admin), else use plan defaults
    const entitlements: EnterpriseEntitlements = {
        ...resolveEnterprisePlanEntitlements(PlanType.ENTERPRISE, quotaSnapshot.limits),
        apiRateLimitPerMinute: workspace?.customApiRateLimitRpm ?? ENTERPRISE_DEFAULTS.apiRateLimitPerMinute,
    };

    return {
        hasAccess: true,
        entitlements,
        enterpriseOrgIds: enterpriseOrgs.map(o => o.id)
    };
};

/**
 * Check if user can perform a specific action on a workspace
 */
export const canPerformWorkspaceAction = (
    userRole: WorkspaceRoleInput | WorkspaceMemberRole,
    action: WorkspacePermissionAction
): boolean => {
    const normalizedRole = normalizeWorkspaceRole(userRole);
    if (!normalizedRole) return false;

    const permissions: Record<WorkspacePermissionAction, WorkspaceRoleCanonical[]> = {
        create_workspace: ['OWNER', 'ADMIN'],
        delete_workspace: ['OWNER'],
        transfer_ownership: ['OWNER'],
        update_workspace: ['OWNER', 'ADMIN'],

        view_members: ['OWNER', 'ADMIN'],
        manage_members: ['OWNER', 'ADMIN'],

        view_organizations: ['OWNER', 'ADMIN'],
        manage_organizations: ['OWNER', 'ADMIN'],
        link_org: ['OWNER', 'ADMIN'],
        unlink_org: ['OWNER', 'ADMIN'],

        view_api_keys: ['OWNER', 'ADMIN', 'DEVELOPER'],
        create_api_key: ['OWNER', 'ADMIN'],
        rotate_api_key: ['OWNER', 'ADMIN'],
        revoke_api_key: ['OWNER', 'ADMIN'],
        copy_api_key: ['OWNER', 'ADMIN', 'DEVELOPER'],

        view_usage_logs: ['OWNER', 'ADMIN', 'DEVELOPER'],
        view_analytics: ['OWNER', 'ADMIN', 'ANALYST'],
        view_compliance_logs: ['OWNER', 'ADMIN', 'DEVELOPER', 'AUDITOR'],

        export_analytics: ['OWNER', 'ADMIN', 'ANALYST'],
        export_usage: ['OWNER', 'ADMIN'],
        export_audit_logs: ['OWNER', 'ADMIN', 'AUDITOR'],

        view_billing: ['OWNER'],
        manage_billing: ['OWNER']
    };

    return permissions[action].includes(normalizedRole);
};

/**
 * Get user's role in a workspace
 */
export const getUserWorkspaceRole = async (
    workspaceId: string,
    userId: string
): Promise<WorkspaceRoleInput | null> => {
    const member = await prisma.workspaceMember.findUnique({
        where: {
            workspaceId_userId: { workspaceId, userId }
        }
    });

    if (!member) return null;
    return member.role;
};

/**
 * Validate that user can create a workspace
 * Requires ENTERPRISE plan on their organization
 */
export const canCreateWorkspace = async (userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    organizationId?: string;
    resource?: 'WORKSPACES';
    limit?: number;
    current?: number;
}> => {
    const access = await getUserEnterpriseAccess(userId);

    if (!access.hasAccess) {
        return {
            allowed: false,
            reason: 'Enterprise plan required to create workspaces'
        };
    }

    const workspacesCount = access.usage?.workspaces ?? 0;
    const maxWorkspaces = access.entitlements?.maxWorkspaces ?? ENTERPRISE_DEFAULTS.maxWorkspaces;

    if (workspacesCount >= maxWorkspaces) {
        return {
            allowed: false,
            reason: `Limit reached for Workspaces`,
            organizationId: access.organizationId,
            resource: 'WORKSPACES',
            limit: maxWorkspaces,
            current: workspacesCount
        };
    }

    return {
        allowed: true,
        organizationId: access.organizationId
    };
};

// ============================================
// API Key Scope Definitions
// ============================================

export const API_SCOPES = {
    'read:verify': {
        name: 'Read Verification',
        description: 'Verify URLs and check organization status',
        endpoints: ['GET /api/v1/verify']
    },
    'read:directory': {
        name: 'Read Directory',
        description: 'Browse verified sites and organizations',
        endpoints: ['GET /api/v1/directory']
    },
    'read:org-profile': {
        name: 'Read Organization Profile',
        description: 'Access organization public profiles',
        endpoints: ['GET /api/v1/org/:slug']
    },
    'export:reports': {
        name: 'Export Reports',
        description: 'Export analytics and verification reports',
        endpoints: ['GET /api/v1/export/reports']
    }
} as const;

export type ApiScope = keyof typeof API_SCOPES;

export const ALL_SCOPES: ApiScope[] = Object.keys(API_SCOPES) as ApiScope[];

export const validateScopes = (scopes: string[]): { valid: boolean; invalidScopes: string[] } => {
    const validScopes = Object.keys(API_SCOPES);
    const invalidScopes = scopes.filter(s => !validScopes.includes(s));
    return {
        valid: invalidScopes.length === 0,
        invalidScopes
    };
};
