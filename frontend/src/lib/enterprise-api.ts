/**
 * Enterprise API Client
 * 
 * Frontend API functions for enterprise dashboard features.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type EnterpriseQuotaResource = 'API_KEYS' | 'WORKSPACES' | 'LINKED_ORGS' | 'MEMBERS';

export class EnterpriseApiError extends Error {
    status: number;
    code?: string;
    resource?: EnterpriseQuotaResource;
    limit?: number;
    current?: number;

    constructor(
        message: string,
        options: {
            status: number;
            code?: string;
            resource?: EnterpriseQuotaResource;
            limit?: number;
            current?: number;
        }
    ) {
        super(message);
        this.name = 'EnterpriseApiError';
        this.status = options.status;
        this.code = options.code;
        this.resource = options.resource;
        this.limit = options.limit;
        this.current = options.current;
    }
}

// ============================================
// Types
// ============================================

export interface Workspace {
    id: string;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    memberCount: number;
    orgCount: number;
    apiKeyCount: number;
    role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER';
    createdAt: string;
}

export interface WorkspaceMember {
    id: string;
    userId: string;
    role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER';
    joinedAt: string;
    user?: {
        name: string;
        email: string;
        firstName: string;
        lastName: string;
    };
}

export interface LinkedOrganization {
    id: string;
    organizationId: string;
    linkedAt: string;
    organization: {
        id: string;
        name: string;
        slug: string | null;
        planType: string;
        status: string;
    };
}

export interface LinkableOrganization {
    id: string;
    name: string;
    slug: string | null;
    planType: string;
    status: string;
}

export interface WorkspaceInvite {
    id: string;
    invitedEmail: string | null;
    invitedUserId: string | null;
    role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER';
    status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
    expiresAt: string;
    acceptedAt: string | null;
    createdAt: string;
}

export interface EnterpriseLinkRequest {
    id: string;
    enterpriseId: string;
    workspaceId: string | null;
    organizationId: string;
    intentType: 'LINK_EXISTING' | 'CREATE_UNDER_ENTERPRISE';
    requestIdentifier: string | null;
    message: string | null;
    status: 'PENDING' | 'PENDING_APPROVAL' | 'APPROVED' | 'DENIED' | 'CANCELED';
    decidedAt: string | null;
    decisionByOrgUserId: string | null;
    canceledAt: string | null;
    createdAt: string;
    updatedAt: string;
    organization?: {
        id: string;
        name: string;
        slug: string | null;
        website?: string;
    } | null;
    workspace?: {
        id: string;
        name: string;
        status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    } | null;
    enterprise?: {
        id: string;
        name: string;
        slug: string | null;
        website?: string;
    } | null;
}

export interface ApiKey {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    isRevoked: boolean;
}

export interface ApiScope {
    name: string;
    description: string;
    endpoints: string[];
}

export interface UsageLog {
    id: string;
    apiKeyId: string;
    apiKeyName: string;
    endpoint: string;
    method: string;
    statusCode: number;
    createdAt: string;
}

export interface UsageStats {
    totalRequests: number;
    successRate: number;
    requestsByDay: Array<{ date: string; count: number }>;
    requestsByEndpoint: Array<{ endpoint: string; count: number }>;
}

export interface EnterpriseAccess {
    hasAccess: boolean;
    organizationId?: string;
    entitlements?: {
        apiAccess: boolean;
        multiOrg: boolean;
        advancedAnalytics: boolean;
        auditExport: boolean;
        maxWorkspaces: number;
        maxApiKeys: number;
        maxLinkedOrgs: number;
        maxMembers: number;
        apiRateLimitPerMinute: number;
        apiBurstLimit: number;
    };
    usage?: {
        workspaces: number;
        linkedOrgs: number;
        apiKeys: number;
        members: number;
    };
}

export interface EnterpriseProfile {
    organization: {
        id: string;
        name: string;
        email: string;
        website: string;
        phone: string;
        address: string;
        about?: string | null;
        logo?: string | null;
        planType: string;
        planStatus: string;
        status: string;
        isRestricted: boolean;
        countryId: string;
        stateId?: string | null;
        categoryId: string;
        country?: { id: string; code: string; name: string } | null;
        state?: { id: string; code?: string | null; name: string } | null;
        category?: { id: string; name: string; slug: string } | null;
    };
    role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER' | null;
    canEdit: boolean;
    entitlements?: EnterpriseAccess['entitlements'] | null;
}

export interface EnterpriseProfileUpdateInput {
    name?: string;
    email?: string;
    website?: string;
    phone?: string;
    address?: string;
    countryId?: string;
    stateId?: string | null;
    categoryId?: string;
    about?: string;
    logo?: string;
}

// ============================================
// Helper Functions
// ============================================

async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as Record<string, any> | null;
        throw new EnterpriseApiError(
            errorPayload?.message || `Request failed with status ${response.status}`,
            {
                status: response.status,
                code: typeof errorPayload?.error === 'string' ? errorPayload.error : undefined,
                resource: typeof errorPayload?.resource === 'string'
                    ? errorPayload.resource as EnterpriseQuotaResource
                    : undefined,
                limit: typeof errorPayload?.limit === 'number' ? errorPayload.limit : undefined,
                current: typeof errorPayload?.current === 'number' ? errorPayload.current : undefined
            }
        );
    }

    return response.json();
}

export const isLimitReachedError = (error: unknown): error is EnterpriseApiError => {
    return error instanceof EnterpriseApiError && error.code === 'LIMIT_REACHED';
};

const RESOURCE_LABELS: Record<EnterpriseQuotaResource, string> = {
    WORKSPACES: 'Workspaces',
    LINKED_ORGS: 'Linked Organizations',
    API_KEYS: 'API Keys',
    MEMBERS: 'Members'
};

export const formatLimitReachedMessage = (error: EnterpriseApiError): string => {
    const label = error.resource ? RESOURCE_LABELS[error.resource] : 'Resource';
    if (typeof error.current === 'number' && typeof error.limit === 'number') {
        return `Limit reached: ${label} (${error.current}/${error.limit}). Contact admin to increase quota.`;
    }
    return `Limit reached: ${label}. Contact admin to increase quota.`;
};

// ============================================
// Enterprise Access
// ============================================

export async function checkEnterpriseAccess(): Promise<EnterpriseAccess> {
    return apiRequest<EnterpriseAccess>('/enterprise/access');
}

export async function getEnterpriseProfile(): Promise<EnterpriseProfile> {
    return apiRequest<EnterpriseProfile>('/enterprise/profile');
}

export async function updateEnterpriseProfile(
    payload: EnterpriseProfileUpdateInput
): Promise<{
    message: string;
    warning?: string;
    organization: EnterpriseProfile['organization'];
    role: EnterpriseProfile['role'];
    canEdit: boolean;
}> {
    return apiRequest('/enterprise/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
    });
}

// ============================================
// Workspaces
// ============================================

export async function getWorkspaces(): Promise<{ workspaces: Workspace[] }> {
    return apiRequest('/enterprise/workspaces');
}

export async function getWorkspace(id: string): Promise<{ workspace: any; role: string }> {
    return apiRequest(`/enterprise/workspaces/${id}`);
}

export async function createWorkspace(name: string): Promise<{ workspace: any }> {
    return apiRequest('/enterprise/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}

export async function updateWorkspace(id: string, name: string): Promise<{ workspace: any }> {
    return apiRequest(`/enterprise/workspaces/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
    });
}

export async function deleteWorkspace(id: string): Promise<{ success: boolean }> {
    return apiRequest(`/enterprise/workspaces/${id}`, {
        method: 'DELETE',
    });
}

// ============================================
// Members
// ============================================

export async function getWorkspaceMembers(workspaceId: string): Promise<{ members: WorkspaceMember[] }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/members`);
}

export async function addWorkspaceMember(
    workspaceId: string,
    email: string,
    role: 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER'
): Promise<{ member: WorkspaceMember }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
    });
}

export async function getWorkspaceInvites(workspaceId: string): Promise<{ invites: WorkspaceInvite[] }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/invites`);
}

export async function createWorkspaceInvite(
    workspaceId: string,
    email: string,
    role: 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER'
): Promise<{ invite: WorkspaceInvite; inviteLink: string | null }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
    });
}

export async function revokeWorkspaceInvite(workspaceId: string, inviteId: string): Promise<{ success: boolean }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/invites/${inviteId}/revoke`, {
        method: 'POST',
    });
}

export async function acceptWorkspaceInvite(token: string): Promise<{ success: boolean; member: WorkspaceMember }> {
    return apiRequest('/enterprise/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
    });
}

export async function updateMemberRole(
    workspaceId: string,
    userId: string,
    role: 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER'
): Promise<{ member: WorkspaceMember }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
    });
}

export async function removeMember(workspaceId: string, userId: string): Promise<{ success: boolean }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/members/${userId}`, {
        method: 'DELETE',
    });
}

export async function transferOwnership(workspaceId: string, newOwnerId: string): Promise<{ success: boolean }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ newOwnerId }),
    });
}

// ============================================
// Organizations
// ============================================

export async function getLinkedOrganizations(workspaceId: string): Promise<{ organizations: LinkedOrganization[] }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/organizations`);
}

export async function createWorkspaceOrganization(
    workspaceId: string,
    payload: {
        orgName: string;
        email: string;
        password: string;
        website: string;
        phone: string;
        address: string;
        countryId: string;
        stateId?: string | null;
        categoryId: string;
        type: 'PUBLIC' | 'PRIVATE' | 'NON_PROFIT';
        about?: string;
        logo?: string;
    }
): Promise<{ organization: any; linkRequest: EnterpriseLinkRequest }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/organizations/create`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function getWorkspaceLinkRequests(
    workspaceId: string
): Promise<{ requests: EnterpriseLinkRequest[] }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/link-requests`);
}

export async function requestWorkspaceLink(
    workspaceId: string,
    payload: { identifier: string; message?: string }
): Promise<{ request: EnterpriseLinkRequest }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/link-requests`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function cancelWorkspaceLinkRequest(
    requestId: string
): Promise<{ success: boolean }> {
    return apiRequest(`/enterprise/link-requests/${requestId}/cancel`, {
        method: 'POST',
    });
}

export async function unlinkOrganization(workspaceId: string, orgId: string): Promise<{ success: boolean }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/organizations/unlink`, {
        method: 'POST',
        body: JSON.stringify({ organizationId: orgId }),
    });
}

// ============================================
// API Keys
// ============================================

export async function getApiScopes(): Promise<{ scopes: Record<string, ApiScope> }> {
    return apiRequest('/enterprise/api-scopes');
}

export async function getApiKeys(workspaceId: string): Promise<{ apiKeys: ApiKey[] }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/api-keys`);
}

export async function createApiKey(
    workspaceId: string,
    name: string,
    scopes: string[],
    expiresAt?: string | null
): Promise<{ apiKey: ApiKey; plainTextKey: string; warning: string }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/api-keys`, {
        method: 'POST',
        body: JSON.stringify({ name, scopes, expiresAt }),
    });
}

export async function revokeApiKey(workspaceId: string, keyId: string): Promise<{ success: boolean }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/api-keys/${keyId}`, {
        method: 'DELETE',
    });
}

export async function rotateApiKey(
    workspaceId: string,
    keyId: string
): Promise<{ apiKey: ApiKey; plainTextKey: string; warning: string }> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/api-keys/${keyId}/rotate`, {
        method: 'POST',
    });
}

// ============================================
// Usage Logs & Stats
// ============================================

export async function getUsageLogs(
    workspaceId: string,
    options: { limit?: number; offset?: number; apiKeyId?: string } = {}
): Promise<{ logs: UsageLog[]; total: number }> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.apiKeyId) params.set('apiKeyId', options.apiKeyId);

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/enterprise/workspaces/${workspaceId}/usage-logs${query}`);
}

export async function getUsageStats(
    workspaceId: string,
    days: number = 30
): Promise<UsageStats> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/usage-stats?days=${days}`);
}

// ============================================
// Multi-Org Analytics
// ============================================

export interface EnterpriseAnalytics {
    organizations: Array<{
        organizationId: string;
        name: string;
        slug: string | null;
        views: number;
        clicks: number;
        ctr: number;
    }>;
    totals: { views: number; clicks: number; ctr: number };
    timeline: Array<{ date: string; views: number; clicks: number }>;
    topSites: Array<{
        site: { id: string; name: string; url: string; orgName: string };
        views: number;
        clicks: number;
    }>;
}

export async function getEnterpriseAnalytics(
    workspaceId: string,
    range: string = '30d'
): Promise<EnterpriseAnalytics> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/analytics?range=${range}`);
}

export interface EnterpriseAnalyticsDaily {
    rangeDays: number;
    series: Array<{ date: string; views: number; clicks: number }>;
}

export interface EnterpriseAnalyticsSummary {
    rangeDays: number;
    totals: { views: number; clicks: number; ctr: number };
    topOrgs: Array<{
        organizationId: string;
        name: string;
        slug: string | null;
        views: number;
        clicks: number;
        ctr: number;
    }>;
}

export interface EnterpriseAnalyticsHourly {
    rangeDays: number;
    hourly: Array<{ hour: string; views: number; clicks: number }>;
}

export interface EnterpriseAnalyticsHeatmap {
    rangeDays: number;
    heatmap: Array<{ dayOfWeek: number; hour: number; views: number; clicks: number }>;
    maxViews: number;
    maxClicks: number;
}

export interface EnterpriseAnalyticsCategories {
    rangeDays: number;
    topCategories: Array<{ categoryId: string; slug: string; name: string; views: number; clicks: number }>;
    topCategoriesByClicks: Array<{ categoryId: string; slug: string; name: string; views: number; clicks: number }>;
    topCategoriesByViews: Array<{ categoryId: string; slug: string; name: string; views: number; clicks: number }>;
    trends: Array<{ date: string; categoryId: string; views: number; clicks: number }>;
}

export async function getEnterpriseAnalyticsDaily(
    workspaceId: string,
    range: string = '30'
): Promise<EnterpriseAnalyticsDaily> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/analytics/daily?range=${range}`);
}

export async function getEnterpriseAnalyticsSummary(
    workspaceId: string,
    range: string = '30'
): Promise<EnterpriseAnalyticsSummary> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/analytics/summary?range=${range}`);
}

export async function getEnterpriseAnalyticsHourly(
    workspaceId: string,
    range: string = '30'
): Promise<EnterpriseAnalyticsHourly> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/analytics/hourly?range=${range}`);
}

export async function getEnterpriseAnalyticsHeatmap(
    workspaceId: string,
    range: string = '30'
): Promise<EnterpriseAnalyticsHeatmap> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/analytics/heatmap?range=${range}`);
}

export async function getEnterpriseAnalyticsCategories(
    workspaceId: string,
    range: string = '30'
): Promise<EnterpriseAnalyticsCategories> {
    return apiRequest(`/enterprise/workspaces/${workspaceId}/analytics/categories?range=${range}`);
}

export async function exportEnterpriseAnalytics(
    workspaceId: string,
    format: 'csv' | 'pdf' = 'csv',
    range: string = '30'
): Promise<{ success: boolean }> {
    const url = `${API_BASE}/enterprise/workspaces/${workspaceId}/analytics/export?format=${format}&range=${range}`;
    const response = await fetch(url, {
        credentials: 'include',
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Export failed' }));
        throw new Error(error.message || 'Export failed');
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', `workspace-analytics-${workspaceId}-${range}.${format}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);

    return { success: true };
}
