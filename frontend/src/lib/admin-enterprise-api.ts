/**
 * Admin Enterprise API Client
 *
 * Frontend API functions for Super Admin enterprise management features.
 * Uses the shared axios instance from @/lib/api for cookie-based auth.
 */

import { api } from '@/lib/api';

// ============================================
// Types
// ============================================

export type EnterpriseAccessStatus = 'ACTIVE' | 'SUSPENDED';

export interface AdminEnterpriseListItem {
    id: string;
    name: string;
    slug: string | null;
    website: string;
    email: string;
    country?: { code?: string | null; name?: string | null } | null;
    state?: { code?: string | null; name?: string | null } | null;
    accessStatus: EnterpriseAccessStatus;
    workspaceCount: number;
    apiKeyCount: number;
    requests7d: number;
    requests30d: number;
    rateLimits: {
        defaultRpm: number;
        workspaceOverrides: number;
        keyOverrides: number;
    };
    updatedAt: string;
}

export interface AdminWorkspace {
    id: string;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    createdAt: string;
    owner: { id: string; name: string; email: string };
    memberCount: number;
    apiKeyCount: number;
    orgCount: number;
    customApiRateLimitRpm?: number | null;
}

export interface AdminWorkspaceDetail {
    id: string;
    name: string;
    status: string;
    createdAt: string;
    owner: { id: string; name: string; email: string };
    apiKeyCount: number;
    customApiRateLimitRpm?: number | null;
    customApiDailyQuota?: number | null;
}

export interface AdminWorkspaceMember {
    id: string;
    userId: string;
    role: string;
    joinedAt: string;
    workspaceId?: string;
    workspaceName?: string;
    user: { id: string; name: string; email: string; firstName?: string; lastName?: string } | null;
}

export type AdminWorkspaceMemberRole = 'ADMIN' | 'EDITOR' | 'ANALYST' | 'VIEWER';

export interface AdminLinkedOrg {
    id: string;
    organizationId: string;
    linkedAt: string;
    organization: { id: string; name: string; slug: string | null; planType: string; status: string } | null;
}

export interface AdminApiKey {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    workspaceId: string;
    workspaceName?: string;
    rateLimitRpm: number | null;
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    isRevoked: boolean;
}

export interface AdminUsageLog {
    id: string;
    workspaceId?: string;
    workspaceName?: string;
    apiKeyId: string;
    apiKeyName: string;
    endpoint: string;
    method: string;
    statusCode: number;
    createdAt: string;
}

export interface AdminEnterpriseDetailResponse {
    enterprise: {
        id: string;
        name: string;
        slug: string | null;
        website: string;
        email: string;
        status: string;
        planStatus: string;
        accessStatus: EnterpriseAccessStatus;
        country?: { id?: string; code?: string; name?: string } | null;
        state?: { id?: string; code?: string | null; name?: string } | null;
        updatedAt: string;
    };
    stats: {
        workspaceCount: number;
        apiKeyCount: number;
        memberCount: number;
        linkedOrganizationCount: number;
        requests7d: number;
        requests30d: number;
    };
    rateLimits: {
        defaultRpm: number;
        workspaceOverrides: number;
        keyOverrides: number;
    };
    workspaces: AdminWorkspace[];
    members: AdminWorkspaceMember[];
    apiKeys: AdminApiKey[];
    recentUsage: AdminUsageLog[];
    complianceEvents: Array<{
        id: string;
        type: string;
        severity: string;
        status: string;
        relatedEntity: string | null;
        relatedId: string | null;
        createdAt: string;
        updatedAt: string;
    }>;
}

export interface AdminEnterpriseUsageResponse {
    enterprise: { id: string; name: string };
    rangeDays: number;
    totals: {
        requestsInRange: number;
        requests7d: number;
        requests30d: number;
    };
    daily: Array<{ date: string; count: number }>;
    byWorkspace: Array<{ workspaceId: string; workspaceName: string; count: number }>;
    logs: AdminUsageLog[];
    pagination: {
        limit: number;
        offset: number;
        total: number;
    };
}

// ============================================
// Enterprise-First Admin API
// ============================================

export const fetchAdminEnterprises = async (params?: { search?: string; page?: number; limit?: number }) => {
    const response = await api.get('/admin/enterprise', { params });
    return response.data as {
        enterprises: AdminEnterpriseListItem[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
    };
};

export const setAdminEnterpriseStatus = async (orgId: string, status: EnterpriseAccessStatus) => {
    const response = await api.patch(`/admin/enterprise/${orgId}/status`, { status });
    return response.data as {
        enterprise: {
            id: string;
            name: string;
            accessStatus: EnterpriseAccessStatus;
            updatedAt: string;
        };
    };
};

export const fetchAdminEnterpriseDetail = async (orgId: string) => {
    const response = await api.get(`/admin/enterprise/${orgId}`);
    return response.data as AdminEnterpriseDetailResponse;
};

export const fetchAdminEnterpriseWorkspaces = async (
    orgId: string,
    params?: { search?: string; page?: number; limit?: number }
) => {
    const response = await api.get(`/admin/enterprise/${orgId}/workspaces`, { params });
    return response.data as {
        enterprise: { id: string; name: string };
        workspaces: AdminWorkspace[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
    };
};

export const createAdminEnterpriseWorkspace = async (
    orgId: string,
    input: { name: string; ownerEmail?: string; ownerId?: string; status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' }
) => {
    const response = await api.post(`/admin/enterprise/${orgId}/workspaces`, input);
    return response.data as {
        workspace: {
            id: string;
            name: string;
            status: string;
            createdAt: string;
            owner: { id: string; name: string; email: string };
        };
    };
};

export const fetchAdminEnterpriseWorkspaceDetail = async (
    orgId: string,
    workspaceId: string,
    params?: { limit?: number; offset?: number }
) => {
    const response = await api.get(`/admin/enterprise/${orgId}/workspaces/${workspaceId}`, { params });
    return response.data as {
        enterprise: { id: string; name: string };
        workspace: AdminWorkspaceDetail;
        members: AdminWorkspaceMember[];
        linkedOrgs: AdminLinkedOrg[];
        apiKeys: AdminApiKey[];
        usage: { logs: AdminUsageLog[]; total: number };
    };
};

export const addAdminEnterpriseWorkspaceMember = async (
    orgId: string,
    workspaceId: string,
    input: { email: string; role: AdminWorkspaceMemberRole }
) => {
    const response = await api.post(`/admin/enterprise/${orgId}/workspaces/${workspaceId}/members`, input);
    return response.data as { member: AdminWorkspaceMember };
};

export const createAdminEnterpriseApiKey = async (
    orgId: string,
    input: {
        workspaceId: string;
        name: string;
        scopes: string[];
        expiresAt?: string | null;
        rateLimitRpm?: number | null;
    }
) => {
    const response = await api.post(`/admin/enterprise/${orgId}/api-keys`, input);
    return response.data as { apiKey: AdminApiKey; plainTextKey: string; warning: string };
};

export const updateAdminEnterpriseRateLimits = async (
    orgId: string,
    input: {
        defaultApiRateLimitRpm?: number | null;
        workspaceOverrides?: Array<{ workspaceId: string; apiRateLimitRpm: number | null }>;
        keyOverrides?: Array<{ workspaceId: string; keyId: string; rateLimitRpm: number | null }>;
    }
) => {
    const response = await api.patch(`/admin/enterprise/${orgId}/rate-limits`, input);
    return response.data as {
        success: boolean;
        applied: {
            defaultAppliedToWorkspaces: number;
            workspaceOverrides: number;
            keyOverrides: number;
        };
    };
};

export const fetchAdminEnterpriseUsage = async (
    orgId: string,
    params?: { range?: 7 | 30; limit?: number; offset?: number }
) => {
    const response = await api.get(`/admin/enterprise/${orgId}/usage`, { params });
    return response.data as AdminEnterpriseUsageResponse;
};

// ============================================
// Legacy Workspace-First API (kept for compatibility)
// ============================================

export const fetchAdminWorkspaces = async (params?: { search?: string; page?: number; limit?: number }) => {
    const response = await api.get('/admin/enterprise/workspaces', { params });
    return response.data as {
        workspaces: AdminWorkspace[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
    };
};

export const createAdminWorkspace = async (input: {
    name: string;
    ownerEmail?: string;
    ownerId?: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}) => {
    const response = await api.post('/admin/enterprise/workspaces', input);
    return response.data as { workspace: AdminWorkspaceDetail };
};

export const updateAdminWorkspace = async (
    workspaceId: string,
    input: { name?: string; status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' }
) => {
    const response = await api.patch(`/admin/enterprise/workspaces/${workspaceId}`, input);
    return response.data as { workspace: AdminWorkspaceDetail };
};

export const deleteAdminWorkspace = async (workspaceId: string) => {
    const response = await api.delete(`/admin/enterprise/workspaces/${workspaceId}`);
    return response.data as { success: boolean };
};

export const fetchAdminWorkspaceDetails = async (id: string) => {
    const response = await api.get(`/admin/enterprise/workspaces/${id}`);
    return response.data as {
        workspace: AdminWorkspaceDetail;
        members: AdminWorkspaceMember[];
        linkedOrgs: AdminLinkedOrg[];
    };
};

export const fetchAdminWorkspaceApiKeys = async (workspaceId: string) => {
    const response = await api.get(`/admin/enterprise/workspaces/${workspaceId}/api-keys`);
    return response.data as { apiKeys: AdminApiKey[] };
};

export const createAdminWorkspaceApiKey = async (
    workspaceId: string,
    input: { name: string; scopes: string[]; expiresAt?: string | null; rateLimitRpm?: number | null }
) => {
    const response = await api.post(`/admin/enterprise/workspaces/${workspaceId}/api-keys`, input);
    return response.data as { apiKey: AdminApiKey; plainTextKey: string; warning: string };
};

export const revokeAdminWorkspaceApiKey = async (workspaceId: string, keyId: string) => {
    const response = await api.delete(`/admin/enterprise/workspaces/${workspaceId}/api-keys/${keyId}`);
    return response.data as { success: boolean; message: string };
};

export const rotateAdminWorkspaceApiKey = async (workspaceId: string, keyId: string) => {
    const response = await api.post(`/admin/enterprise/workspaces/${workspaceId}/api-keys/${keyId}/rotate`);
    return response.data as { apiKey: AdminApiKey; plainTextKey: string; warning: string };
};

export const updateAdminWorkspaceApiKeyRateLimit = async (
    workspaceId: string,
    keyId: string,
    rateLimitRpm: number | null
) => {
    const response = await api.patch(`/admin/enterprise/workspaces/${workspaceId}/api-keys/${keyId}/rate-limit`, {
        rateLimitRpm
    });
    return response.data as { success: boolean; apiKey: AdminApiKey };
};

export const updateAdminWorkspaceRateLimits = async (
    workspaceId: string,
    input: { apiRateLimitRpm?: number | null; apiDailyQuota?: number | null }
) => {
    const response = await api.patch(`/admin/enterprise/workspaces/${workspaceId}/rate-limits`, input);
    return response.data as {
        success: boolean;
        workspace: {
            id: string;
            name: string;
            customApiRateLimitRpm: number | null;
            customApiDailyQuota: number | null;
        };
    };
};

export const fetchAdminWorkspaceUsageLogs = async (
    workspaceId: string,
    params?: { limit?: number; offset?: number; apiKeyId?: string }
) => {
    const response = await api.get(`/admin/enterprise/workspaces/${workspaceId}/usage-logs`, { params });
    return response.data as { logs: AdminUsageLog[]; total: number };
};

export const fetchAdminGlobalUsageLogs = async (
    params?: { limit?: number; offset?: number; workspaceId?: string; apiKeyId?: string }
) => {
    const response = await api.get('/admin/enterprise/usage-logs', { params });
    return response.data as { logs: AdminUsageLog[]; total: number };
};
