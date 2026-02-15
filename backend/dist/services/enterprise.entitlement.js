"use strict";
/**
 * Enterprise Entitlement Service
 *
 * Resolves enterprise-specific entitlements for organizations and workspaces.
 * Used to gate access to API keys, multi-org features, and advanced analytics.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateScopes = exports.ALL_SCOPES = exports.API_SCOPES = exports.canCreateWorkspace = exports.getUserWorkspaceRole = exports.canPerformWorkspaceAction = exports.getWorkspaceEntitlements = exports.getUserEnterpriseAccess = exports.hasActiveEnterprisePlan = exports.resolveEnterprisePlanEntitlements = exports.normalizeWorkspaceRoleForStorage = exports.normalizeWorkspaceRole = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const enterprise_quota_service_1 = require("./enterprise-quota.service");
// ============================================
// Constants
// ============================================
const ENTERPRISE_DEFAULTS = {
    apiAccess: true,
    multiOrg: true,
    advancedAnalytics: true,
    auditExport: true,
    maxWorkspaces: enterprise_quota_service_1.DEFAULT_ENTERPRISE_QUOTAS.maxWorkspaces,
    maxApiKeys: enterprise_quota_service_1.DEFAULT_ENTERPRISE_QUOTAS.maxApiKeys,
    maxLinkedOrgs: enterprise_quota_service_1.DEFAULT_ENTERPRISE_QUOTAS.maxLinkedOrgs,
    maxMembers: enterprise_quota_service_1.DEFAULT_ENTERPRISE_QUOTAS.maxMembers,
    apiRateLimitPerMinute: 100,
    apiBurstLimit: 20
};
const NO_ENTERPRISE_ENTITLEMENTS = {
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
const normalizeWorkspaceRole = (role) => {
    if (!role)
        return null;
    if (role === 'EDITOR')
        return 'DEVELOPER';
    if (role === 'VIEWER')
        return 'AUDITOR';
    if (role === 'OWNER' || role === 'ADMIN' || role === 'ANALYST' || role === 'DEVELOPER' || role === 'AUDITOR') {
        return role;
    }
    return null;
};
exports.normalizeWorkspaceRole = normalizeWorkspaceRole;
const normalizeWorkspaceRoleForStorage = (role) => {
    const normalized = (0, exports.normalizeWorkspaceRole)(role);
    switch (normalized) {
        case 'DEVELOPER':
            return client_1.WorkspaceMemberRole.EDITOR;
        case 'AUDITOR':
            return client_1.WorkspaceMemberRole.VIEWER;
        case 'OWNER':
            return client_1.WorkspaceMemberRole.OWNER;
        case 'ADMIN':
            return client_1.WorkspaceMemberRole.ADMIN;
        case 'ANALYST':
            return client_1.WorkspaceMemberRole.ANALYST;
        default:
            return client_1.WorkspaceMemberRole.VIEWER;
    }
};
exports.normalizeWorkspaceRoleForStorage = normalizeWorkspaceRoleForStorage;
/**
 * Resolve enterprise entitlements based on plan type and persisted organization quota overrides.
 */
const resolveEnterprisePlanEntitlements = (planType, quotas) => {
    if (planType !== client_1.PlanType.ENTERPRISE) {
        return { ...NO_ENTERPRISE_ENTITLEMENTS };
    }
    const normalizedQuotas = (0, enterprise_quota_service_1.normalizeEnterpriseQuotaLimits)({
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
exports.resolveEnterprisePlanEntitlements = resolveEnterprisePlanEntitlements;
/**
 * Check if an organization has active enterprise plan
 */
const hasActiveEnterprisePlan = (org) => {
    if (org.planType !== client_1.PlanType.ENTERPRISE)
        return false;
    if (org.planStatus !== client_1.PlanStatus.ACTIVE)
        return false;
    if (org.status !== client_1.OrgStatus.APPROVED)
        return false;
    if (org.isRestricted)
        return false;
    // Check expiry
    if (org.planEndAt && org.planEndAt.getTime() < Date.now()) {
        return false;
    }
    return true;
};
exports.hasActiveEnterprisePlan = hasActiveEnterprisePlan;
/**
 * Check if user has enterprise access through any of their organizations
 */
const getUserEnterpriseAccess = async (userId) => {
    // Check if user belongs to an enterprise organization
    const user = await client_2.prisma.user.findUnique({
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
    if (!(0, exports.hasActiveEnterprisePlan)(user.organization)) {
        return { hasAccess: false };
    }
    const snapshot = await (0, enterprise_quota_service_1.getEnterpriseQuotaSnapshotByOrganizationId)(user.organization.id);
    return {
        hasAccess: true,
        organizationId: user.organization.id,
        entitlements: (0, exports.resolveEnterprisePlanEntitlements)(client_1.PlanType.ENTERPRISE, snapshot.limits),
        usage: snapshot.usage
    };
};
exports.getUserEnterpriseAccess = getUserEnterpriseAccess;
/**
 * Get enterprise entitlements for a workspace
 * A workspace has enterprise access if any linked org has active enterprise plan
 * Respects workspace-level rate limit overrides (set by Super Admin)
 */
const getWorkspaceEntitlements = async (workspaceId) => {
    const linkedOrgs = await client_2.prisma.workspaceOrganization.findMany({
        where: { workspaceId },
        include: {
            workspace: true
        }
    });
    // Get workspace for custom overrides
    const workspace = await client_2.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { customApiRateLimitRpm: true, customApiDailyQuota: true }
    });
    // Get all organization details
    const orgIds = linkedOrgs.map(lo => lo.organizationId);
    const organizations = await client_2.prisma.organization.findMany({
        where: { id: { in: orgIds } },
        orderBy: { createdAt: 'asc' }
    });
    // Find which orgs have active enterprise plans
    const enterpriseOrgs = organizations.filter(exports.hasActiveEnterprisePlan);
    if (enterpriseOrgs.length === 0) {
        return {
            hasAccess: false,
            entitlements: NO_ENTERPRISE_ENTITLEMENTS,
            enterpriseOrgIds: []
        };
    }
    const primaryEnterpriseOrg = enterpriseOrgs[0];
    const quotaSnapshot = await (0, enterprise_quota_service_1.getEnterpriseQuotaSnapshotByOrganizationId)(primaryEnterpriseOrg.id);
    // Apply workspace-level overrides (if set by admin), else use plan defaults
    const entitlements = {
        ...(0, exports.resolveEnterprisePlanEntitlements)(client_1.PlanType.ENTERPRISE, quotaSnapshot.limits),
        apiRateLimitPerMinute: workspace?.customApiRateLimitRpm ?? ENTERPRISE_DEFAULTS.apiRateLimitPerMinute,
    };
    return {
        hasAccess: true,
        entitlements,
        enterpriseOrgIds: enterpriseOrgs.map(o => o.id)
    };
};
exports.getWorkspaceEntitlements = getWorkspaceEntitlements;
/**
 * Check if user can perform a specific action on a workspace
 */
const canPerformWorkspaceAction = (userRole, action) => {
    const normalizedRole = (0, exports.normalizeWorkspaceRole)(userRole);
    if (!normalizedRole)
        return false;
    const permissions = {
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
exports.canPerformWorkspaceAction = canPerformWorkspaceAction;
/**
 * Get user's role in a workspace
 */
const getUserWorkspaceRole = async (workspaceId, userId) => {
    const member = await client_2.prisma.workspaceMember.findUnique({
        where: {
            workspaceId_userId: { workspaceId, userId }
        }
    });
    if (!member)
        return null;
    return member.role;
};
exports.getUserWorkspaceRole = getUserWorkspaceRole;
/**
 * Validate that user can create a workspace
 * Requires ENTERPRISE plan on their organization
 */
const canCreateWorkspace = async (userId) => {
    const access = await (0, exports.getUserEnterpriseAccess)(userId);
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
exports.canCreateWorkspace = canCreateWorkspace;
// ============================================
// API Key Scope Definitions
// ============================================
exports.API_SCOPES = {
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
};
exports.ALL_SCOPES = Object.keys(exports.API_SCOPES);
const validateScopes = (scopes) => {
    const validScopes = Object.keys(exports.API_SCOPES);
    const invalidScopes = scopes.filter(s => !validScopes.includes(s));
    return {
        valid: invalidScopes.length === 0,
        invalidScopes
    };
};
exports.validateScopes = validateScopes;
