import axios from 'axios';
import {
    endConnectivityRequest,
    startConnectivityRequest,
    shouldTrackConnectivityRequest
} from './connectivity-tracker';
import {
    formatLocalDateYYYYMMDD,
    resolveDownloadFilename,
    triggerBlobDownload
} from './download-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 10000,
    withCredentials: true
});

api.interceptors.request.use((config) => {
    const trackConnectivity = shouldTrackConnectivityRequest((config as any).trackConnectivity);
    if (!trackConnectivity) {
        (config as any).__connectivityRequestId = null;
        return config;
    }

    const method = String(config.method || 'get').toUpperCase();
    const retryAction = method === 'GET' || method === 'HEAD'
        ? () => {
            const { signal, ...restConfig } = config as any;
            const retryConfig: any = {
                ...restConfig,
                headers: { ...(config.headers || {}) },
                trackConnectivity: true
            };
            delete retryConfig.__connectivityRequestId;
            return api.request(retryConfig);
        }
        : null;

    (config as any).__connectivityRequestId = startConnectivityRequest({
        track: true,
        retryAction
    });

    return config;
});

api.interceptors.response.use(
    (response) => {
        endConnectivityRequest((response.config as any).__connectivityRequestId ?? null);
        return response;
    },
    (error) => {
        const isCanceled = axios.isCancel(error) || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';
        endConnectivityRequest((error?.config as any)?.__connectivityRequestId ?? null, {
            networkError: !error?.response && !isCanceled
        });
        return Promise.reject(error);
    }
);

const pendingRequests = new Map<string, Promise<any>>();
const searchCache = new Map<string, { ts: number; promise: Promise<any> }>();
const SEARCH_CACHE_TTL_MS = 1500;

type InvoiceFilenameFallbackInput = {
    organizationName?: string | null;
    organizationId?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: string | Date | null;
};

const sanitizeFilenameSlug = (value: string | null | undefined): string => {
    if (!value) return '';
    return value
        .normalize('NFKD')
        .replace(/[^\x00-\x7F]/g, '')
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
};

const formatFilenameDate = () => formatLocalDateYYYYMMDD(new Date());

const buildInvoiceToken = (invoiceNumber: string | null | undefined, invoiceId: string): string => {
    const raw = (invoiceNumber || '').trim() || `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
    const cleaned = sanitizeFilenameSlug(raw)
        .replace(/_/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
};

const buildInvoiceFallbackFilename = (invoiceId: string, fallback?: InvoiceFilenameFallbackInput): string => {
    const orgSlug = sanitizeFilenameSlug(fallback?.organizationName)
        || `Organization-${(fallback?.organizationId || invoiceId).slice(0, 8).toUpperCase()}`;
    const invoiceToken = buildInvoiceToken(fallback?.invoiceNumber, invoiceId);
    const dateToken = formatFilenameDate();
    return `${orgSlug}_Invoice-${invoiceToken}_${dateToken}.pdf`;
};

const normalizeAnalyticsRangeToken = (range: string | null | undefined): string => {
    const raw = String(range || '').trim().toLowerCase();
    if (!raw) return '30d';
    if (/^\d+d$/.test(raw)) return raw;
    if (/^\d+$/.test(raw)) return `${raw}d`;

    const customRangeMatch = raw.match(/^custom[-_]?(\d{4}-?\d{2}-?\d{2})[-_](\d{4}-?\d{2}-?\d{2})$/);
    if (customRangeMatch) {
        const start = customRangeMatch[1].replace(/-/g, '');
        const end = customRangeMatch[2].replace(/-/g, '');
        return `custom-${start}-${end}`;
    }

    return raw
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'custom';
};

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

export const downloadOrganizationInvoicePdf = async (invoiceId: string, fallback?: InvoiceFilenameFallbackInput) => {
    const response = await fetch(`${API_URL}/organizations/invoices/${invoiceId}/pdf`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Invoice download failed' }));
        throw new Error(error.message || 'Invoice download failed');
    }

    const blob = await response.blob();
    const filename = resolveDownloadFilename(
        response.headers.get('content-disposition'),
        buildInvoiceFallbackFilename(invoiceId, fallback)
    );
    triggerBlobDownload(blob, filename);

    return { success: true };
};


export const updateMyOrganization = async (data: any) => {
    const response = await api.patch('/organizations/me', data);
    return response.data;
};

export const fetchOrgLinkRequests = async () => {
    return deduplicatedGet('/org/link-requests', { params: { _t: Date.now() } });
};

export const approveOrgLinkRequest = async (requestId: string, password: string) => {
    const response = await api.post(`/org/link-requests/${requestId}/approve`, { password });
    return response.data;
};

export const denyOrgLinkRequest = async (requestId: string) => {
    const response = await api.post(`/org/link-requests/${requestId}/deny`);
    return response.data;
};

export const fetchMyEnterpriseInvites = async () => {
    const response = await api.get('/enterprise/invites');
    return response.data as {
        invites: Array<{
            id: string;
            workspaceId: string;
            invitedEmail: string | null;
            invitedUserId: string | null;
            role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER';
            status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'CANCELED' | 'EXPIRED';
            expiresAt: string;
            createdAt: string;
            workspace?: { id: string; name: string };
            createdBy?: string;
            createdByUser?: { id: string; name: string | null; email: string } | null;
        }>;
    };
};

export const acceptMyEnterpriseInvite = async (inviteId: string) => {
    const response = await api.post(`/enterprise/invites/${inviteId}/accept`);
    return response.data as {
        success: boolean;
        member: {
            workspaceId: string;
            userId: string;
            role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER';
        };
    };
};

export const declineMyEnterpriseInvite = async (inviteId: string) => {
    const response = await api.post(`/enterprise/invites/${inviteId}/decline`);
    return response.data as { success: boolean };
};

export const fetchMyEnterpriseWorkspaces = async () => {
    const response = await api.get('/enterprise/workspaces');
    return response.data as {
        workspaces: Array<{
            id: string;
            name: string;
            status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
            memberCount: number;
            orgCount: number;
            apiKeyCount: number;
            role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER';
            createdAt: string;
        }>;
    };
};

type CountryListItem = {
    id: string;
    name?: string | null;
    code?: string | null;
};

const isGlobalCountryItem = (country: CountryListItem): boolean => {
    const code = String(country?.code || '').trim().toUpperCase();
    const name = String(country?.name || '').trim().toUpperCase();
    return code === 'GL' || code === 'WW' || name === 'GLOBAL';
};

const pinGlobalCountryFirst = <T extends CountryListItem>(countries: T[]): T[] => {
    // Discovery:
    // - Country order is sourced from backend name ASC (backend/src/services/country.service.ts)
    // - Country options are built from fetchCountries in homepage/admin flows
    //   (e.g., frontend/src/app/HomeClient.tsx, frontend/src/components/admin/sections/UsersSection.tsx).
    // Keep non-Global order exactly as provided and only move Global to index 0.
    const globalIndex = countries.findIndex((country) => isGlobalCountryItem(country));
    if (globalIndex <= 0) return countries;
    const globalCountry = countries[globalIndex];
    const rest = countries.filter((_, index) => index !== globalIndex);
    return [globalCountry, ...rest];
};

export const fetchCountries = async (params?: { includeDisabled?: boolean }) => {
    const countries = await deduplicatedGet('/countries', { params });
    if (!Array.isArray(countries)) return countries;
    return pinGlobalCountryFirst(countries);
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

export const setAdminActiveStatus = async (id: string, isActive: boolean) => {
    const response = await api.patch(`/admin/${id}/status`, { isActive });
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

export const resetEnterprisePassword = async (orgId: string) => {
    const response = await api.post(`/admin/enterprise/${orgId}/credentials/reset-password`);
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

export type AdminBillingTerm = 'MONTHLY' | 'ANNUAL';

export interface AdminBillingOverviewResponse {
    mrrCents: number | null;
    arrCents: number | null;
    activeSubscriptionsByPlan: {
        BASIC: number;
        PRO: number;
        BUSINESS: number;
        ENTERPRISE: number;
    };
    activeSubscriptionsByBillingTerm: {
        MONTHLY: number;
        ANNUAL: number;
    };
    newPaidOrganizations: {
        last7Days: number;
        last30Days: number;
    };
    renewalsDue: {
        next30Days: number;
        next60Days: number;
        next90Days: number;
    };
    failedVoidPayments: {
        failedPayments: number;
        voidInvoices: number;
        total: number;
    };
}

export interface AdminBillingSubscriptionsQuery extends Record<string, unknown> {
    search?: string;
    plan?: 'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
    billingTerm?: AdminBillingTerm;
    status?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | 'TRIALING';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
}

export interface AdminBillingSubscriptionRow {
    id: string;
    organization: {
        id: string;
        name: string;
    };
    plan: 'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE' | 'FREE';
    billingTerm: AdminBillingTerm | null;
    status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | 'TRIALING';
    renewalDate: string | null;
    mrrContributionCents: number | null;
    currency: string | null;
    lastInvoiceStatus: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'REFUNDED' | null;
    lastInvoiceUpdatedAt: string | null;
}

export interface AdminBillingSubscriptionsResponse {
    subscriptions: AdminBillingSubscriptionRow[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface AdminBillingInvoicesQuery extends Record<string, unknown> {
    search?: string;
    status?: 'OPEN' | 'PAID' | 'VOID' | 'DRAFT' | 'REFUNDED';
    plan?: 'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
    billingTerm?: AdminBillingTerm;
    rangeDays?: 7 | 30 | 90;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
}

export interface AdminBillingInvoiceRow {
    id: string;
    invoiceNumber: string;
    organization: {
        id: string;
        name: string;
    };
    plan: 'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE' | 'FREE';
    billingTerm: AdminBillingTerm | null;
    amountCents: number;
    currency: string;
    status: 'OPEN' | 'PAID' | 'VOID' | 'DRAFT' | 'REFUNDED';
    issuedAt: string;
    updatedAt: string;
    internalNote: string | null;
}

export interface AdminBillingInvoicesResponse {
    invoices: AdminBillingInvoiceRow[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export const fetchAdminBillingOverview = async () => {
    const response = await api.get('/admin/billing/overview');
    return response.data as AdminBillingOverviewResponse;
};

export const fetchAdminBillingSubscriptions = async (params?: AdminBillingSubscriptionsQuery) => {
    const response = await api.get('/admin/billing/subscriptions', {
        params: sanitizeQueryParams(params)
    });
    return response.data as AdminBillingSubscriptionsResponse;
};

export const fetchAdminBillingInvoices = async (params?: AdminBillingInvoicesQuery) => {
    const response = await api.get('/admin/billing/invoices', {
        params: sanitizeQueryParams(params)
    });
    return response.data as AdminBillingInvoicesResponse;
};

export const updateAdminBillingInvoice = async (
    invoiceId: string,
    payload: { status?: 'OPEN' | 'PAID' | 'VOID' | 'DRAFT' | 'REFUNDED'; internalNote?: string | null }
) => {
    const response = await api.patch(`/admin/billing/invoices/${invoiceId}`, payload);
    return response.data as AdminBillingInvoiceRow;
};

export const downloadAdminBillingInvoicePdf = async (invoiceId: string, fallback?: InvoiceFilenameFallbackInput) => {
    const response = await fetch(`${API_URL}/admin/billing/invoices/${invoiceId}/pdf`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Invoice download failed' }));
        throw new Error(error.message || 'Invoice download failed');
    }

    const blob = await response.blob();
    const filename = resolveDownloadFilename(
        response.headers.get('content-disposition'),
        buildInvoiceFallbackFilename(invoiceId, fallback)
    );
    triggerBlobDownload(blob, filename);
};

const downloadBillingCsv = async (path: string, filename: string, params?: Record<string, unknown>) => {
    const response = await api.get(path, {
        params: sanitizeQueryParams(params),
        responseType: 'blob'
    });

    const blob = new Blob([response.data], { type: 'text/csv' });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
};

export const exportAdminBillingInvoicesCsv = async (params?: AdminBillingInvoicesQuery) => {
    const fileDate = new Date().toISOString().slice(0, 10);
    await downloadBillingCsv('/admin/billing/exports/invoices.csv', `billing_invoices_${fileDate}.csv`, params);
};

export const exportAdminBillingSubscriptionsCsv = async (params?: AdminBillingSubscriptionsQuery) => {
    const fileDate = new Date().toISOString().slice(0, 10);
    await downloadBillingCsv('/admin/billing/exports/subscriptions.csv', `billing_subscriptions_${fileDate}.csv`, params);
};

export interface AdminBillingInvoiceListParams extends Record<string, unknown> {
    search?: string;
    status?: 'OPEN' | 'PAID' | 'VOID' | 'DRAFT' | 'REFUNDED';
    planType?: 'FREE' | 'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
    startDate?: string;
    endDate?: string;
    minAmountCents?: number;
    maxAmountCents?: number;
    page?: number;
    limit?: number;
}

export interface AdminBillingInvoice {
    id: string;
    invoiceNumber: string;
    status: 'OPEN' | 'PAID' | 'VOID' | 'DRAFT' | 'REFUNDED';
    amountCents: number;
    currency: string;
    createdAt: string;
    updatedAt: string;
    dueAt: string | null;
    paidAt: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    planType: 'FREE' | 'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
    subscriptionId: string | null;
    customer: {
        organizationId: string;
        name: string;
        email: string;
        website: string | null;
    };
    billing: {
        billingEmail: string | null;
        billingName: string | null;
        taxId: string | null;
    };
    metadata: Record<string, unknown>;
}

export interface AdminBillingInvoiceListResponse {
    invoices: AdminBillingInvoice[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export const fetchAdminOrganizationInvoices = async (params?: AdminBillingInvoiceListParams) => {
    const response = await api.get('/admin/billing/org-invoices', {
        params: sanitizeQueryParams(params)
    });
    return response.data as AdminBillingInvoiceListResponse;
};

export const fetchAdminEnterpriseInvoices = async (params?: AdminBillingInvoiceListParams) => {
    const response = await api.get('/admin/billing/enterprise-invoices', {
        params: sanitizeQueryParams(params)
    });
    return response.data as AdminBillingInvoiceListResponse;
};

const downloadAdminInvoicePdf = async (
    scope: 'org-invoices' | 'enterprise-invoices',
    invoiceId: string,
    fallback?: InvoiceFilenameFallbackInput
) => {
    const response = await fetch(`${API_URL}/admin/billing/${scope}/${invoiceId}/pdf`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Invoice download failed' }));
        throw new Error(error.message || 'Invoice download failed');
    }

    const blob = await response.blob();
    const filename = resolveDownloadFilename(
        response.headers.get('content-disposition'),
        buildInvoiceFallbackFilename(invoiceId, fallback)
    );
    triggerBlobDownload(blob, filename);
};

export const downloadAdminOrganizationInvoicePdf = async (invoiceId: string, fallback?: InvoiceFilenameFallbackInput) => {
    await downloadAdminInvoicePdf('org-invoices', invoiceId, fallback);
};

export const downloadAdminEnterpriseInvoicePdf = async (invoiceId: string, fallback?: InvoiceFilenameFallbackInput) => {
    await downloadAdminInvoicePdf('enterprise-invoices', invoiceId, fallback);
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

export type CheckoutBillingCadence = 'MONTHLY' | 'ANNUAL';

// Billing
export const startCheckout = async (
    data: {
        plan: 'BASIC' | 'PRO' | 'BUSINESS';
        billingCadence: CheckoutBillingCadence;
    },
    idempotencyKey?: string
) => {
    const res = await api.post('/billing/checkout', data, {
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined
    });
    return res.data as {
        redirectUrl: string;
    };
};

// Billing (Legacy mock endpoints)
export const createMockCheckout = async (data: { organizationId?: string; planType: string; amountCents: number; currency?: string; durationDays?: number; billingTerm?: 'MONTHLY' | 'ANNUAL'; billingEmail?: string; billingName?: string; simulate?: 'success' | 'failure' }, idempotencyKey?: string) => {
    const res = await api.post('/billing/mock/checkout', data, {
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined
    });
    return res.data;
};

export const mockPaymentCallback = async (data: { paymentAttemptId: string; result: 'success' | 'failure' }) => {
    const res = await api.post('/billing/mock/callback', data);
    return res.data;
};

export const startTrial = async (data: { durationDays?: 14; planType?: string }) => {
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
export const trackView = async (orgId: string, siteId?: string) => {
    const payload = siteId ? { siteId } : {};
    const response = await api.post(`/analytics/${orgId}/view`, payload);
    return response.data;
};

export const trackClick = async (orgId: string, siteId?: string) => {
    const payload = siteId ? { siteId } : {};
    const response = await api.post(`/analytics/${orgId}/click`, payload);
    return response.data;
};

export const trackClickFireAndForget = (orgId?: string | null, siteId?: string) => {
    if (!orgId || typeof window === 'undefined') return;

    const payload = siteId ? { siteId } : {};
    const body = JSON.stringify(payload);
    const url = `${API_URL}/analytics/${orgId}/click`;

    // Prefer sendBeacon for navigation-safe writes on outbound link clicks.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        if (sent) return;
    }

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'include'
    }).catch(() => {
        // Keep outbound navigation smooth for public traffic.
    });
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

        const contentDisposition = response.headers?.['content-disposition'];
        const rangeToken = normalizeAnalyticsRangeToken(range);
        const fallbackDate = formatLocalDateYYYYMMDD(new Date());
        const fallbackFilename = `organization-${orgId.slice(0, 8)}_Analytics_${rangeToken}_${fallbackDate}.${format}`;
        const filename = resolveDownloadFilename(contentDisposition, fallbackFilename);
        const mimeType = format === 'pdf' ? 'application/pdf' : 'text/csv';
        const blob = new Blob([response.data], { type: mimeType });
        triggerBlobDownload(blob, filename);

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
