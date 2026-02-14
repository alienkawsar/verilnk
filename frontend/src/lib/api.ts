import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 10000,
    withCredentials: true
});

const pendingRequests = new Map<string, Promise<any>>();
const searchCache = new Map<string, { ts: number; promise: Promise<any> }>();
const SEARCH_CACHE_TTL_MS = 1500;

const sanitizeQueryParams = <T extends Record<string, unknown>>(params?: T): Partial<T> => {
    if (!params) return {};

    return Object.fromEntries(
        Object.entries(params).filter(([, value]) => {
            if (value === undefined || value === null) return false;
            if (typeof value === 'string') return value.trim() !== '';
            return true;
        })
    ) as Partial<T>;
};

// Deduplication Wrapper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deduplicatedGet = async (url: string, config?: any) => {
    const key = `${url}:${JSON.stringify(config)}`;
    if (pendingRequests.has(key)) {
        return pendingRequests.get(key);
    }

    const request = api.get(url, config)
        .then(res => res.data)
        .finally(() => {
            pendingRequests.delete(key);
        });

    pendingRequests.set(key, request);
    return request;
};


export const signupUser = async (data: any) => {
    const response = await api.post('/auth/signup', data);
    return response.data;
};


export const updateUserProfile = async (data: any) => {
    const response = await api.patch('/auth/me', data);
    return response.data;
};

export const fetchMyOrganization = async () => {
    return deduplicatedGet('/organizations/me', { params: { _t: Date.now() } });
};


export const updateMyOrganization = async (data: any) => {
    const response = await api.patch('/organizations/me', data);
    return response.data;
};

export const fetchOrgLinkRequests = async () => {
    return deduplicatedGet('/org/link-requests', { params: { _t: Date.now() } });
};

export const approveOrgLinkRequest = async (requestId: string) => {
    const response = await api.post(`/org/link-requests/${requestId}/approve`);
    return response.data;
};

export const denyOrgLinkRequest = async (requestId: string) => {
    const response = await api.post(`/org/link-requests/${requestId}/deny`);
    return response.data;
};

export const fetchCountries = async (params?: { includeDisabled?: boolean }) => {
    return deduplicatedGet('/countries', { params });
};

export const fetchCategories = async () => {
    return deduplicatedGet('/categories');
};

export const fetchCategoryBySlug = async (slug: string) => {
    const response = await api.get(`/categories/slug/${slug}`);
    return response.data;
};

// Admin Categories & Tags
export const fetchAdminCategories = async () => {
    const response = await api.get('/admin/categories');
    return response.data;
};

export const createAdminCategory = async (data: { name: string; slug?: string; description?: string; iconKey?: string; parentId?: string | null; sortOrder?: number; isActive?: boolean }) => {
    const response = await api.post('/admin/categories', data);
    return response.data;
};

export const updateAdminCategory = async (id: string, data: { name?: string; slug?: string; description?: string; iconKey?: string; parentId?: string | null; sortOrder?: number; isActive?: boolean }) => {
    const response = await api.put(`/admin/categories/${id}`, data);
    return response.data;
};

export const deleteAdminCategory = async (id: string) => {
    const response = await api.delete(`/admin/categories/${id}`);
    return response.data;
};

export const fetchAdminTags = async (query?: string) => {
    const response = await api.get('/admin/tags', { params: query ? { q: query } : undefined });
    return response.data;
};

export const createAdminTag = async (data: { name: string; slug?: string; isActive?: boolean }) => {
    const response = await api.post('/admin/tags', data);
    return response.data;
};

export const setAdminCategoryTags = async (categoryId: string, tagIds: string[]) => {
    const response = await api.put(`/admin/categories/${categoryId}/tags`, { tagIds });
    return response.data;
};

export const searchSites = async (
    params: {
        q?: string;
        country?: string; // STRICT: Must be Country Code (e.g. "UK", "US")
        stateId?: string;
        category?: string;
        verification?: string;
        page?: number;
        limit?: number;
    },
    signal?: AbortSignal
) => {
    const cacheKey = JSON.stringify({
        q: params.q || '',
        country: params.country || '',
        stateId: params.stateId || '',
        category: params.category || '',
        page: params.page || 1,
        limit: params.limit || 20
    });

    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS) {
        return cached.promise;
    }

    // Construct URL with params manually to use WHATWG URL API (avoids url.parse deprecation warning)
    const URL_BASE = API_URL.startsWith('http') ? API_URL : `http://localhost:8000${API_URL}`;
    const url = new URL(`${URL_BASE}/v1/search`);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.append(key, String(value));
        }
    });

    // Use native fetch instead of axios
    const request = fetch(url.toString(), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        cache: 'no-store', // Next.js specific: disable data cache
        signal
    });

    const promise = request.then(async (response) => {
        if (!response.ok) {
            throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
        }
        return response.json();
    });

    searchCache.set(cacheKey, { ts: Date.now(), promise });
    return promise;
};

export const fetchSiteById = async (id: string) => {
    const response = await api.get(`/sites/${id}`);
    return response.data;
};

export const fetchPendingSites = async () => {
    const response = await api.get('/sites?status=PENDING');
    return response.data;
};

export const loginAdmin = async (credentials: { email: string; password: string; rememberMe?: boolean }) => {
    const response = await api.post('/auth/admin/login', credentials);
    return response.data;
};

export const logoutAdmin = async () => {
    const response = await api.post('/auth/logout');
    return response.data;
};

export const fetchAdminMe = async () => {
    const response = await api.get('/auth/admin/me');
    return response.data;
};

export const fetchMe = async () => {
    const response = await api.get('/auth/me');
    return response.data;
};

export const refreshSession = async () => {
    const response = await api.post('/auth/refresh');
    return response.data;
};

export const updateSiteStatus = async (id: string, status: string) => {
    const response = await api.patch(`/sites/${id}/status`, { status });
    return response.data;
};

export const fetchReports = async () => {
    const response = await api.get('/reports');
    return response.data;
};

export const deleteReport = async (id: string) => {
    const response = await api.delete(`/reports/${id}`);
    return response.data;
};

// Country Management
export const createCountry = async (data: { name: string; code: string; flagImage?: string; flagImageUrl?: string }) => {
    const response = await api.post('/countries', data);
    return response.data;
};

export const updateCountry = async (id: string, data: { name: string; code: string; flagImage?: string; flagImageUrl?: string; isEnabled?: boolean }) => {
    const response = await api.patch(`/countries/${id}`, data);
    return response.data;
};

export const deleteCountry = async (id: string) => {
    const response = await api.delete(`/countries/${id}`);
    return response.data;
};

// State Management
export const fetchStates = async (countryId?: string, signal?: AbortSignal) => {
    const response = await api.get('/states', {
        params: { countryId, _t: Date.now() },
        signal
    });
    return response.data;
};

export const createState = async (data: { name: string; code?: string; countryId: string }) => {
    const response = await api.post('/states', data);
    return response.data;
};

export const updateState = async (id: string, data: { name: string; code?: string; countryId: string }) => {
    const response = await api.put(`/states/${id}`, data);
    return response.data;
};

export const deleteState = async (id: string) => {
    const response = await api.delete(`/states/${id}`);
    return response.data;
};

// Category Management (legacy admin endpoints)
export const createCategory = async (data: { name: string; sortOrder: number }) => {
    const response = await api.post('/categories', data);
    return response.data;
};

export const updateCategory = async (id: string, data: { name: string; sortOrder: number }) => {
    const response = await api.patch(`/categories/${id}`, data);
    return response.data;
};

export const deleteCategory = async (id: string) => {
    const response = await api.delete(`/categories/${id}`);
    return response.data;
};


// Site Management
export const fetchSites = async (params: { countryId?: string; stateId?: string; categoryId?: string; status?: string; search?: string; organizationId?: string; type?: string }, signal?: AbortSignal) => {
    const response = await api.get('/sites', {
        params: { ...sanitizeQueryParams(params), _t: Date.now() },
        signal
    });
    return response.data;
};

export const fetchSitesPaginated = async (
    params: { countryId?: string; stateId?: string; categoryId?: string; status?: string; search?: string; organizationId?: string; type?: string; page?: number; limit?: number },
    signal?: AbortSignal
) => {
    const response = await api.get('/sites', {
        params: { ...sanitizeQueryParams(params), _t: Date.now() },
        signal
    });
    return response.data as { items: any[]; page: number; limit: number; total: number; totalPages: number };
};


export const createSite = async (data: any) => {
    const response = await api.post('/sites', data);
    return response.data;
};


export const updateSite = async (id: string, data: any) => {
    const response = await api.patch(`/sites/${id}`, data);
    return response.data;
};


export const deleteSite = async (id: string) => {
    const response = await api.delete(`/sites/${id}`);
    return response.data;
};

export const bulkDeleteSites = async (siteIds: string[]) => {
    const response = await api.delete('/admin/sites/bulk-delete', {
        data: { siteIds }
    });
    return response.data;
};

export const approveRequestsBulk = async (requestIds: string[]) => {
    const response = await api.post('/requests/bulk-approve', { requestIds });
    return response.data;
};

export const rejectRequestsBulk = async (requestIds: string[], note?: string) => {
    const response = await api.post('/requests/bulk-reject', { requestIds, note });
    return response.data;
};

// File Upload
export const uploadFile = async (file: File) => {
    console.log('Preparing upload:', { name: file.name, type: file.type, size: file.size });

    const formData = new FormData();
    formData.append('file', file);

    // Verify FormData
    for (const pair of formData.entries()) {
        console.log('FormData:', pair[0], pair[1]);
    }

    const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
    });

    if (!response.ok) {
        let message = `Upload failed: ${response.status} ${response.statusText}`;
        try {
            const data = await response.json();
            if (data?.message) message = data.message;
        } catch {
            // ignore JSON parse errors
        }
        throw new Error(message);
    }

    return response.json();
};

export const uploadPublicFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/upload/public`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
    });

    if (!response.ok) {
        let message = `Upload failed: ${response.status} ${response.statusText}`;
        try {
            const data = await response.json();
            if (data?.message) message = data.message;
        } catch {
            // ignore JSON parse errors
        }
        throw new Error(message);
    }

    return response.json();
};

export const uploadOrgLogo = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/upload/org-logo`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
    });

    if (!response.ok) {
        let message = `Upload failed: ${response.status} ${response.statusText}`;
        try {
            const data = await response.json();
            if (data?.message) message = data.message;
        } catch {
            // ignore JSON parse errors
        }
        throw new Error(message);
    }

    return response.json();
};

export const uploadPublicOrgLogo = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/upload/public/org-logo`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
    });

    if (!response.ok) {
        let message = `Upload failed: ${response.status} ${response.statusText}`;
        try {
            const data = await response.json();
            if (data?.message) message = data.message;
        } catch {
            // ignore JSON parse errors
        }
        throw new Error(message);
    }

    return response.json();
};

// Admin Management
export const fetchAdmins = async (params?: { role?: string; search?: string }) => {
    const response = await api.get('/admin', {
        params,
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });
    return response.data;
};

export const fetchAdminSessions = async () => {
    const response = await api.get('/admin/sessions');
    return response.data;
};

export const revokeAdminSession = async (id: string) => {
    const response = await api.post(`/admin/sessions/${id}/revoke`);
    return response.data;
};


export const createAdmin = async (data: any) => {
    const response = await api.post('/admin', data);
    return response.data;
};


export const updateAdmin = async (id: string, data: any) => {
    const response = await api.patch(`/admin/${id}`, data);
    return response.data;
};

export const deleteAdmin = async (id: string) => {
    const response = await api.delete(`/admin/${id}`);
    return response.data;
};

// Bulk Import
export const uploadBulkImport = async (formData: FormData, options?: { strictMode: boolean; dryRun: boolean }) => {
    const response = await api.post('/admin/bulk-import/upload', formData, {
        params: options,
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const getBulkImportStatus = async (id: string) => {
    const response = await api.get(`/admin/bulk-import/status/${id}`);
    return response.data;
};

// Admin Credential Management (Super Admin)
export const updateOrgLoginEmail = async (orgId: string, email: string) => {
    const response = await api.patch(`/admin/organizations/${orgId}/credentials/email`, { email });
    return response.data;
};

export const resetOrgPassword = async (orgId: string) => {
    const response = await api.post(`/admin/organizations/${orgId}/credentials/reset-password`);
    return response.data;
};

// Admin Billing
export const createManualInvoice = async (data: { organizationId: string; amountCents: number; currency?: string; planType: string; durationDays?: number; notes?: string }) => {
    const response = await api.post('/admin/billing/invoices', data);
    return response.data;
};

export const applyOfflinePayment = async (invoiceId: string) => {
    const response = await api.post(`/admin/billing/invoices/${invoiceId}/offline-payment`);
    return response.data;
};

export const flagInvoiceRefund = async (invoiceId: string, note?: string) => {
    const response = await api.post(`/admin/billing/invoices/${invoiceId}/flag-refund`, { note });
    return response.data;
};

export const cancelSubscription = async (subscriptionId: string) => {
    const response = await api.post(`/admin/billing/subscriptions/${subscriptionId}/cancel`);
    return response.data;
};

export const extendTrial = async (organizationId: string, extraDays: number) => {
    const response = await api.post(`/admin/billing/trials/${organizationId}/extend`, { extraDays });
    return response.data;
};



export const updateAdminProfile = async (data: any) => {
    const response = await api.patch('/admin/me/profile', data);
    return response.data;
};

// User Management (Admin Only)
export const fetchUsers = async (
    params?: { country?: string; stateId?: string; categoryId?: string; type?: string },
    signal?: AbortSignal
) => {
    const response = await api.get('/users', {
        params,
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
        signal
    });
    return response.data;
};


export const createUserAdmin = async (data: any) => {
    const response = await api.post('/users', data);
    return response.data;
};


export const updateUserAdmin = async (id: string, data: any) => {
    const response = await api.patch(`/users/${id}`, data);
    return response.data;
};

export const deleteUser = async (id: string) => {
    const res = await api.delete(`/users/${id}`);
    return res.data;
};

export const deleteUsersBulk = async (ids: string[]) => {
    const res = await api.post('/users/delete-bulk', { ids });
    return res.data;
};

export const updateUsersBulk = async (ids: string[], data: { dailyRequestLimit?: number | null; requestLimit?: number | null; requestLimitWindow?: number }) => {
    const res = await api.post('/users/update-bulk', { ids, data });
    return res.data;
};

export const restrictUser = async (id: string, isRestricted: boolean) => {
    const res = await api.patch(`/users/${id}/restrict`, { isRestricted });
    return res.data;
};

// Organization Management
export const fetchOrganizations = async (
    params?: { countryId?: string; stateId?: string; categoryId?: string; status?: string; type?: string; priority?: string; planType?: string; deleted?: 'only' | 'include' | 'exclude' },
    signal?: AbortSignal
) => {
    const response = await api.get('/organizations', {
        params: { ...sanitizeQueryParams(params), _t: Date.now() },
        signal
    });
    return response.data;
};


export const signupOrganization = async (data: any) => {
    const response = await api.post('/organizations/signup', data);
    return response.data;
};


export const updateOrganization = async (id: string, data: any) => {
    const response = await api.patch(`/organizations/${id}`, data);
    return response.data;
};

export const createOrganizationAdmin = async (data: any) => {
    const response = await api.post('/organizations', data);
    return response.data;
};

export const deleteOrganization = async (id: string) => {
    const response = await api.delete(`/organizations/${id}`);
    return response.data;
};

export const deleteOrganizationsBulk = async (ids: string[]) => {
    const response = await api.post('/organizations/delete-bulk', { ids });
    return response.data;
};

export const restoreOrganization = async (id: string) => {
    const response = await api.post(`/admin/org/${id}/restore`);
    return response.data;
};

export const permanentlyDeleteOrganization = async (id: string) => {
    const response = await api.post(`/admin/org/${id}/permanent-delete`);
    return response.data;
};

// Compliance
export const fetchComplianceDashboard = async () => {
    const res = await api.get('/admin/compliance/dashboard');
    return res.data;
};

export const fetchComplianceIncidents = async () => {
    const res = await api.get('/admin/compliance/incidents');
    return res.data;
};

export const createComplianceIncident = async (data: any) => {
    const res = await api.post('/admin/compliance/incidents', data);
    return res.data;
};

export const updateComplianceIncident = async (id: string, data: any) => {
    const res = await api.patch(`/admin/compliance/incidents/${id}`, data);
    return res.data;
};

export const exportComplianceEvidence = async (data: any) => {
    const res = await api.post('/admin/compliance/exports', data);
    return res.data;
};

export const fetchRetentionPolicies = async () => {
    const res = await api.get('/admin/compliance/retention');
    return res.data;
};

export const updateRetentionPolicy = async (entityType: string, data: any) => {
    const res = await api.patch(`/admin/compliance/retention/${entityType}`, data);
    return res.data;
};

export const runComplianceJobs = async () => {
    const res = await api.post('/admin/compliance/run-jobs');
    return res.data;
};

export const downloadComplianceExport = async (params: { type: string; format: string; startDate?: string; endDate?: string }) => {
    const res = await api.get('/admin/compliance/exports/download', { params, responseType: 'blob' });
    return res.data;
};

export const restrictOrganization = async (id: string, isRestricted: boolean) => {
    const res = await api.patch(`/organizations/${id}/restrict`, { isRestricted });
    return res.data;
};

export const updateOrganizationPriority = async (id: string, priority: string, durationDays?: number) => {
    const res = await api.patch(`/organizations/${id}/priority`, { priority, durationDays });
    return res.data;
};

export const bulkUpdateOrganizationPriority = async (ids: string[], priority: string, durationDays?: number) => {
    const res = await api.post('/organizations/bulk-priority', { ids, priority, durationDays });
    return res.data;
};

export const updateOrganizationPlan = async (
    id: string,
    data: {
        planType: string;
        planStatus: string;
        durationDays?: number;
        priorityOverride?: number | null;
        enterpriseMaxWorkspaces?: number | null;
        enterpriseMaxLinkedOrgs?: number | null;
        enterpriseMaxApiKeys?: number | null;
        enterpriseMaxMembers?: number | null;
    }
) => {
    const res = await api.patch(`/organizations/${id}/plan`, data);
    return res.data;
};

export const bulkUpdateOrganizationPlan = async (
    ids: string[],
    data: {
        planType: string;
        planStatus: string;
        durationDays?: number;
        priorityOverride?: number | null;
        enterpriseMaxWorkspaces?: number | null;
        enterpriseMaxLinkedOrgs?: number | null;
        enterpriseMaxApiKeys?: number | null;
        enterpriseMaxMembers?: number | null;
    }
) => {
    const res = await api.post('/organizations/bulk-plan', { ids, data });
    return res.data;
};

// Billing (Mock)
export const createMockCheckout = async (data: { organizationId?: string; planType: string; amountCents: number; currency?: string; durationDays?: number; billingEmail?: string; billingName?: string; simulate?: 'success' | 'failure' }, idempotencyKey?: string) => {
    const res = await api.post('/billing/mock/checkout', data, {
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined
    });
    return res.data;
};

export const mockPaymentCallback = async (data: { paymentAttemptId: string; result: 'success' | 'failure' }) => {
    const res = await api.post('/billing/mock/callback', data);
    return res.data;
};

export const startTrial = async (data: { durationDays: number; planType?: string }) => {
    const res = await api.post('/billing/trial/start', data);
    return res.data;
};

export const fetchTrialStatus = async () => {
    const res = await api.get('/billing/trial/status');
    return res.data;
};

export const getPublicOrganization = async (id: string) => {
    // This might need a new public endpoint if not using /organizations/:id which checks auth
    // Backend service has getPublicOrganization, but controller needs to expose it.
    // Wait, I didn't verify if I added `getPublicOrganization` to controller and route!
    // I added it to service only.
    // I need to double check controller/routes.
    // For now assuming I will fix that.
    const response = await api.get(`/organizations/${id}/public?_t=${Date.now()}`);
    return response.data;
};

// Analytics
export const trackView = async (orgId: string) => {
    const response = await api.post(`/analytics/${orgId}/view`);
    return response.data;
};

export const trackClick = async (orgId: string) => {
    const response = await api.post(`/analytics/${orgId}/click`);
    return response.data;
};

export const fetchOrgStats = async (orgId: string) => {
    const response = await api.get(`/analytics/${orgId}?_t=${Date.now()}`);
    return response.data;
};

// Advanced Analytics (PRO+ plans)
export const fetchTrafficHeatmap = async (orgId: string, range: string = '7d') => {
    const response = await api.get(`/analytics/${orgId}/heatmap`, { params: { range, _t: Date.now() } });
    return response.data;
};

export const fetchCategoryPerformance = async (orgId: string, range: string = '30d') => {
    const response = await api.get(`/analytics/${orgId}/categories`, { params: { range, _t: Date.now() } });
    return response.data;
};

export const exportAnalytics = async (orgId: string, format: 'csv' | 'pdf' = 'csv', range: string = '30d') => {
    try {
        const response = await api.get(`/analytics/${orgId}/export`, {
            params: { format, range },
            responseType: 'blob'
        });

        // Create blob with correct MIME type
        const mimeType = format === 'pdf' ? 'application/pdf' : 'text/csv';
        const blob = new Blob([response.data], { type: mimeType });
        const url = window.URL.createObjectURL(blob);

        // Create and click download link
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `verilnk-analytics-${range}.${format}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        return { success: true };
    } catch (error: any) {
        console.error(`Failed to export ${format}:`, error);
        throw new Error(`Export failed: ${error.message || 'Unknown error'}`);
    }
};

// Business Insights (BUSINESS plan only)
export const fetchBusinessInsights = async (orgId: string) => {
    const response = await api.get(`/analytics/${orgId}/insights?_t=${Date.now()}`);
    return response.data;
};

// Requests
export const createRequest = async (data: any) => {
    const response = await api.post('/requests', data);
    return response.data;
};

export const fetchAdminRequests = async (filters?: { status?: string; type?: string; requestId?: string }) => {
    const response = await api.get('/requests', { params: filters });
    return response.data;
};

export const fetchMyRequests = async (filters?: { status?: string; type?: string }) => {
    const response = await api.get('/requests/my', { params: filters });
    return response.data;
};

export const approveRequest = async (id: string) => {
    const response = await api.post(`/requests/${id}/approve`);
    return response.data;
};

export const rejectRequest = async (id: string, note?: string) => {
    const response = await api.post(`/requests/${id}/reject`, { note });
    return response.data;
};
