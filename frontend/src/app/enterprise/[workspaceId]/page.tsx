'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
    Building2,
    Key,
    Users,
    BarChart3,
    ArrowLeft,
    Copy,
    Plus,
    Trash2,
    RefreshCw,
    Eye,
    EyeOff,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Link2,
    Download,
    Shield,
    Search
} from 'lucide-react';
import Link from 'next/link';
import AnalyticsChart from '@/components/analytics/AnalyticsChart';
import TrafficHeatmap from '@/components/analytics/TrafficHeatmap';
import CategoryPerformance from '@/components/analytics/CategoryPerformance';
import {
    checkEnterpriseAccess,
    getWorkspace,
    getWorkspaceMembers,
    getWorkspaceInvites,
    getLinkedOrganizations,
    getWorkspaceLinkRequests,
    requestWorkspaceLink,
    cancelWorkspaceLinkRequest,
    createWorkspaceOrganization,
    getApiKeys,
    getUsageStats,
    getUsageLogs,
    getApiScopes,
    createApiKey,
    revokeApiKey,
    rotateApiKey,
    logApiKeyCopy,
    exportWorkspaceUsage,
    exportWorkspaceAuditLogs,
    unlinkOrganization,
    removeMember,
    updateMemberRole,
    createWorkspaceInvite,
    cancelWorkspaceInvite,
    exportEnterpriseAnalytics,
    getEnterpriseAnalytics,
    getEnterpriseAnalyticsDaily,
    getEnterpriseAnalyticsSummary,
    getEnterpriseAnalyticsHeatmap,
    getEnterpriseAnalyticsCategories,
    getWorkspaceAuditLogs,
    getWorkspaceSessions,
    revokeWorkspaceSession,
    formatLimitReachedMessage,
    isLimitReachedError,
    type EnterpriseAccess,
    type WorkspaceMember,
    type WorkspaceInvite,
    type EnterpriseLinkRequest,
    type LinkedOrganization,
    type ApiKey,
    type UsageStats,
    type UsageLog,
    type ApiScope,
    type EnterpriseAnalytics,
    type EnterpriseAnalyticsDaily,
    type EnterpriseAnalyticsSummary,
    type EnterpriseAnalyticsHeatmap,
    type EnterpriseAnalyticsCategories,
    type WorkspaceAuditLog,
    type WorkspaceSession
} from '@/lib/enterprise-api';
import { fetchCategories, fetchCountries, fetchStates, uploadPublicOrgLogo } from '@/lib/api';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '@/lib/validation';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { TableSkeleton, CardSkeleton, ChartSkeleton } from '@/components/ui/Loading';

type Tab = 'organizations' | 'members' | 'api-keys' | 'usage' | 'analytics' | 'security';
type LinkRequestMethod = 'EMAIL' | 'DOMAIN' | 'SLUG' | 'ORG_ID';
type InviteMethod = 'EMAIL' | 'USER_ID';
type WorkspaceRoleCanonical = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR';

const normalizeWorkspaceRole = (role: string | null | undefined): WorkspaceRoleCanonical | null => {
    if (!role) return null;
    const value = role.toUpperCase();
    if (value === 'EDITOR') return 'DEVELOPER';
    if (value === 'VIEWER') return 'AUDITOR';
    if (value === 'OWNER' || value === 'ADMIN' || value === 'DEVELOPER' || value === 'ANALYST' || value === 'AUDITOR') {
        return value;
    }
    return null;
};

const ORG_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LINK_REQUEST_METHOD_OPTIONS: Array<{
    value: LinkRequestMethod;
    label: string;
    placeholder: string;
    helper: string;
}> = [
    {
        value: 'EMAIL',
        label: 'Email',
        placeholder: 'owner@organization.com',
        helper: 'Use the organization login email.'
    },
    {
        value: 'DOMAIN',
        label: 'Domain',
        placeholder: 'organization.com',
        helper: 'Use the primary organization website domain.'
    },
    {
        value: 'SLUG',
        label: 'Slug',
        placeholder: 'organization-slug',
        helper: 'Use the public organization slug.'
    },
    {
        value: 'ORG_ID',
        label: 'Organization ID',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        helper: 'Use the exact organization ID (UUID).'
    }
];

const resolveTabFromQuery = (value: string | null): Tab => {
    switch (value) {
        case 'members':
            return 'members';
        case 'api-keys':
            return 'api-keys';
        case 'usage':
            return 'usage';
        case 'analytics':
            return 'analytics';
        case 'security':
            return 'security';
        default:
            return 'organizations';
    }
};

export default function WorkspacePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const { showToast } = useToast();
    const workspaceId = params.workspaceId as string;

    const [loading, setLoading] = useState(true);
    const [workspace, setWorkspace] = useState<any>(null);
    const [userRole, setUserRole] = useState<string>('');
    const [enterpriseAccess, setEnterpriseAccess] = useState<EnterpriseAccess | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('organizations');
    const [error, setError] = useState<string | null>(null);

    // Tab data
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
    const [organizations, setOrganizations] = useState<LinkedOrganization[]>([]);
    const [linkRequests, setLinkRequests] = useState<EnterpriseLinkRequest[]>([]);
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
    const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
    const [scopes, setScopes] = useState<Record<string, ApiScope>>({});
    const [analytics, setAnalytics] = useState<EnterpriseAnalytics | null>(null);
    const [analyticsDaily, setAnalyticsDaily] = useState<EnterpriseAnalyticsDaily | null>(null);
    const [analyticsSummary, setAnalyticsSummary] = useState<EnterpriseAnalyticsSummary | null>(null);
    const [analyticsHeatmap, setAnalyticsHeatmap] = useState<EnterpriseAnalyticsHeatmap | null>(null);
    const [analyticsCategories, setAnalyticsCategories] = useState<EnterpriseAnalyticsCategories | null>(null);
    const [analyticsRange, setAnalyticsRange] = useState<'7' | '30' | '90'>('30');
    const [auditLogs, setAuditLogs] = useState<WorkspaceAuditLog[]>([]);
    const [auditPagination, setAuditPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
    const [workspaceSessions, setWorkspaceSessions] = useState<WorkspaceSession[]>([]);
    const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
    const [tabLoading, setTabLoading] = useState(false);
    const [tabError, setTabError] = useState<string | null>(null);

    const tabAbortRef = useRef<AbortController | null>(null);
    const tabRequestIdRef = useRef(0);

    // Modals
    const [showCreateApiKeyModal, setShowCreateApiKeyModal] = useState(false);
    const [showRequestLinkModal, setShowRequestLinkModal] = useState(false);
    const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
    const [newApiKeyName, setNewApiKeyName] = useState('');
    const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const [showKey, setShowKey] = useState(false);
    const [creating, setCreating] = useState(false);
    const [linkingOrg, setLinkingOrg] = useState(false);
    const [requestLinkMethod, setRequestLinkMethod] = useState<LinkRequestMethod>('EMAIL');
    const [requestIdentifier, setRequestIdentifier] = useState('');
    const [requestIdentifierError, setRequestIdentifierError] = useState<string | null>(null);
    const [requestMessage, setRequestMessage] = useState('');
    const [creatingOrganization, setCreatingOrganization] = useState(false);
    const [uploadingOrgLogo, setUploadingOrgLogo] = useState(false);
    const [fetchingOrgStates, setFetchingOrgStates] = useState(false);
    const [showOrgPassword, setShowOrgPassword] = useState(false);
    const [orgCountries, setOrgCountries] = useState<Array<{ id: string; name: string }>>([]);
    const [orgStates, setOrgStates] = useState<Array<{ id: string; name: string }>>([]);
    const [orgCategories, setOrgCategories] = useState<Array<{ id: string; name: string }>>([]);
    const [orgCreateErrors, setOrgCreateErrors] = useState<Record<string, string>>({});
    const [orgLogoPreviewUrl, setOrgLogoPreviewUrl] = useState<string | null>(null);
    const [orgUploadedLogoUrl, setOrgUploadedLogoUrl] = useState<string | null>(null);
    const [orgCreateForm, setOrgCreateForm] = useState({
        orgName: '',
        email: '',
        password: '',
        website: '',
        phone: '',
        address: '',
        countryId: '',
        stateId: '',
        categoryId: '',
        type: 'PUBLIC' as 'PUBLIC' | 'PRIVATE' | 'NON_PROFIT',
        about: '',
        logo: ''
    });

    // Invite modal
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteMethod, setInviteMethod] = useState<InviteMethod>('EMAIL');
    const [inviteIdentifier, setInviteIdentifier] = useState('');
    const [inviteRole, setInviteRole] = useState<'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR'>('AUDITOR');
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);
    const [updatingMemberRoles, setUpdatingMemberRoles] = useState<Record<string, boolean>>({});
    const [apiKeySecrets, setApiKeySecrets] = useState<Record<string, string>>({});
    const [exportingAnalyticsFormat, setExportingAnalyticsFormat] = useState<'csv' | 'pdf' | null>(null);
    const [exportingUsage, setExportingUsage] = useState(false);
    const [exportingAuditFormat, setExportingAuditFormat] = useState<'csv' | 'log' | null>(null);

    const [organizationsSearch, setOrganizationsSearch] = useState('');
    const [membersSearch, setMembersSearch] = useState('');
    const [apiKeysSearch, setApiKeysSearch] = useState('');
    const [usageSearch, setUsageSearch] = useState('');
    const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
    const [auditStartDate, setAuditStartDate] = useState('');
    const [auditEndDate, setAuditEndDate] = useState('');

    const debouncedOrganizationsSearch = useDebounce(organizationsSearch, 300);
    const debouncedMembersSearch = useDebounce(membersSearch, 300);
    const debouncedApiKeysSearch = useDebounce(apiKeysSearch, 300);
    const debouncedUsageSearch = useDebounce(usageSearch, 300);
    const debouncedAnalyticsRange = useDebounce(analyticsRange, 250);
    const debouncedAuditActionFilter = useDebounce(auditActionFilter, 300);
    const debouncedAuditStartDate = useDebounce(auditStartDate, 300);
    const debouncedAuditEndDate = useDebounce(auditEndDate, 300);

    const requestedTab = resolveTabFromQuery(searchParams.get('tab'));
    const workspaceOrgCount = useMemo(
        () => organizations.length || workspace?.organizations?.length || 0,
        [organizations.length, workspace],
    );
    const workspaceMemberCount = useMemo(
        () => members.length || workspace?.members?.length || 0,
        [members.length, workspace],
    );
    const workspaceApiKeyCount = useMemo(
        () => apiKeys.length || workspace?._count?.apiKeys || 0,
        [apiKeys.length, workspace],
    );
    const quotaLimits = enterpriseAccess?.entitlements;
    const quotaUsage = enterpriseAccess?.usage;
    const linkedOrgLimitReached = Boolean(
        quotaLimits
        && quotaUsage
        && quotaLimits.maxLinkedOrgs > 0
        && quotaUsage.linkedOrgs >= quotaLimits.maxLinkedOrgs
    );
    const memberLimitReached = Boolean(
        quotaLimits
        && quotaUsage
        && quotaLimits.maxMembers > 0
        && quotaUsage.members >= quotaLimits.maxMembers
    );
    const apiKeyLimitReached = Boolean(
        quotaLimits
        && quotaUsage
        && quotaLimits.maxApiKeys > 0
        && quotaUsage.apiKeys >= quotaLimits.maxApiKeys
    );
    const selectedLinkMethod = LINK_REQUEST_METHOD_OPTIONS.find(
        (option) => option.value === requestLinkMethod
    ) || LINK_REQUEST_METHOD_OPTIONS[0];
    const organizationsSearchNormalized = debouncedOrganizationsSearch.trim().toLowerCase();
    const membersSearchNormalized = debouncedMembersSearch.trim().toLowerCase();
    const apiKeysSearchNormalized = debouncedApiKeysSearch.trim().toLowerCase();
    const usageSearchNormalized = debouncedUsageSearch.trim().toLowerCase();

    const filteredOrganizations = useMemo(() => {
        if (!organizationsSearchNormalized) return organizations;
        return organizations.filter((link) => {
            const name = link.organization?.name?.toLowerCase() || '';
            const slug = link.organization?.slug?.toLowerCase() || '';
            const planType = link.organization?.planType?.toLowerCase() || '';
            return (
                name.includes(organizationsSearchNormalized)
                || slug.includes(organizationsSearchNormalized)
                || planType.includes(organizationsSearchNormalized)
            );
        });
    }, [organizations, organizationsSearchNormalized]);

    const filteredLinkRequests = useMemo(() => {
        if (!organizationsSearchNormalized) return linkRequests;
        return linkRequests.filter((request) => {
            const orgName = request.organization?.name?.toLowerCase() || '';
            const identifier = request.requestIdentifier?.toLowerCase() || '';
            const status = request.status?.toLowerCase() || '';
            return (
                orgName.includes(organizationsSearchNormalized)
                || identifier.includes(organizationsSearchNormalized)
                || status.includes(organizationsSearchNormalized)
            );
        });
    }, [linkRequests, organizationsSearchNormalized]);

    const filteredMembers = useMemo(() => {
        if (!membersSearchNormalized) return members;
        return members.filter((member) => {
            const firstName = member.user?.firstName?.toLowerCase() || '';
            const lastName = member.user?.lastName?.toLowerCase() || '';
            const email = member.user?.email?.toLowerCase() || '';
            const role = member.role.toLowerCase();
            return (
                firstName.includes(membersSearchNormalized)
                || lastName.includes(membersSearchNormalized)
                || email.includes(membersSearchNormalized)
                || role.includes(membersSearchNormalized)
            );
        });
    }, [members, membersSearchNormalized]);

    const filteredInvites = useMemo(() => {
        if (!membersSearchNormalized) return invites;
        return invites.filter((invite) => {
            const target = `${invite.invitedEmail || ''} ${invite.invitedUserId || ''}`.toLowerCase();
            const role = invite.role.toLowerCase();
            const status = invite.status.toLowerCase();
            return (
                target.includes(membersSearchNormalized)
                || role.includes(membersSearchNormalized)
                || status.includes(membersSearchNormalized)
            );
        });
    }, [invites, membersSearchNormalized]);

    const filteredApiKeys = useMemo(() => {
        if (!apiKeysSearchNormalized) return apiKeys;
        return apiKeys.filter((key) => {
            const haystack = `${key.name} ${key.prefix} ${key.scopes.join(' ')}`.toLowerCase();
            return haystack.includes(apiKeysSearchNormalized);
        });
    }, [apiKeys, apiKeysSearchNormalized]);

    const filteredUsageLogs = useMemo(() => {
        if (!usageSearchNormalized) return usageLogs;
        return usageLogs.filter((log) => {
            const haystack = `${log.method} ${log.endpoint} ${log.apiKeyName} ${log.statusCode}`.toLowerCase();
            return haystack.includes(usageSearchNormalized);
        });
    }, [usageLogs, usageSearchNormalized]);

    const normalizedUserRole = useMemo(() => normalizeWorkspaceRole(userRole), [userRole]);
    const displayRole = (role: string | null | undefined) => normalizeWorkspaceRole(role) || role || 'UNKNOWN';
    const permissionDenied = () => showToast("You don't have permission to do that.", 'error');

    const permissions = useMemo(() => {
        const base = {
            viewOrganizations: false,
            manageOrganizations: false,
            viewMembers: false,
            manageMembers: false,
            viewApiKeys: false,
            manageApiKeys: false,
            copyApiKeys: false,
            viewUsage: false,
            exportUsage: false,
            viewAnalytics: false,
            exportAnalytics: false,
            viewCompliance: false,
            exportAuditLogs: false
        };

        switch (normalizedUserRole) {
            case 'OWNER':
                return { ...base,
                    viewOrganizations: true, manageOrganizations: true,
                    viewMembers: true, manageMembers: true,
                    viewApiKeys: true, manageApiKeys: true, copyApiKeys: true,
                    viewUsage: true, exportUsage: true,
                    viewAnalytics: true, exportAnalytics: true,
                    viewCompliance: true, exportAuditLogs: true
                };
            case 'ADMIN':
                return { ...base,
                    viewOrganizations: true, manageOrganizations: true,
                    viewMembers: true, manageMembers: true,
                    viewApiKeys: true, manageApiKeys: true, copyApiKeys: true,
                    viewUsage: true, exportUsage: true,
                    viewAnalytics: true, exportAnalytics: true,
                    viewCompliance: true, exportAuditLogs: true
                };
            case 'DEVELOPER':
                return { ...base,
                    viewApiKeys: true, copyApiKeys: true,
                    viewUsage: true,
                    viewCompliance: true
                };
            case 'ANALYST':
                return { ...base,
                    viewAnalytics: true, exportAnalytics: true
                };
            case 'AUDITOR':
                return { ...base,
                    viewCompliance: true,
                    exportAuditLogs: true
                };
            default:
                return base;
        }
    }, [normalizedUserRole]);

    const visibleTabs = useMemo(
        () => [
            permissions.viewOrganizations && { id: 'organizations' as Tab, label: 'Organizations', icon: Building2 },
            permissions.viewMembers && { id: 'members' as Tab, label: 'Members', icon: Users },
            permissions.viewApiKeys && { id: 'api-keys' as Tab, label: 'API Keys', icon: Key },
            permissions.viewUsage && { id: 'usage' as Tab, label: 'Usage', icon: BarChart3 },
            permissions.viewAnalytics && { id: 'analytics' as Tab, label: 'Analytics', icon: BarChart3 },
            permissions.viewCompliance && { id: 'security' as Tab, label: 'Security', icon: Shield },
        ].filter(Boolean) as Array<{ id: Tab; label: string; icon: typeof Building2 }>,
        [permissions]
    );

    useEffect(() => {
        loadWorkspace();
    }, [workspaceId]);

    useEffect(() => {
        const allowedTabs = new Set(visibleTabs.map((tab) => tab.id));
        if (allowedTabs.size === 0) return;

        const nextTab = allowedTabs.has(requestedTab) ? requestedTab : visibleTabs[0].id;
        if (nextTab !== activeTab) {
            setActiveTab(nextTab);
        }
    }, [requestedTab, activeTab, visibleTabs]);

    useEffect(() => {
        const allowedTabs = new Set(visibleTabs.map((tab) => tab.id));
        if (allowedTabs.size === 0) return;
        if (!allowedTabs.has(activeTab)) {
            const fallback = visibleTabs[0].id;
            setActiveTab(fallback);
            router.replace(`/enterprise/${workspaceId}?tab=${fallback}`, { scroll: false });
        }
    }, [activeTab, visibleTabs, router, workspaceId]);

    useEffect(() => {
        if (!workspace) return;
        const allowedTabs = new Set(visibleTabs.map((tab) => tab.id));
        if (!allowedTabs.has(activeTab)) return;
        loadTabData(activeTab);
    }, [
        activeTab,
        workspace,
        visibleTabs,
        debouncedAnalyticsRange,
        auditPagination.page,
        auditPagination.limit,
        debouncedAuditActionFilter,
        debouncedAuditStartDate,
        debouncedAuditEndDate
    ]);

    useEffect(() => {
        setAuditPagination((prev) => ({ ...prev, page: 1 }));
    }, [debouncedAuditActionFilter, debouncedAuditStartDate, debouncedAuditEndDate]);

    useEffect(() => {
        return () => {
            tabAbortRef.current?.abort();
        };
    }, []);

    const resetCreateOrgForm = () => {
        if (orgLogoPreviewUrl) {
            URL.revokeObjectURL(orgLogoPreviewUrl);
        }
        setOrgCreateForm({
            orgName: '',
            email: '',
            password: '',
            website: '',
            phone: '',
            address: '',
            countryId: '',
            stateId: '',
            categoryId: '',
            type: 'PUBLIC',
            about: '',
            logo: ''
        });
        setOrgCreateErrors({});
        setOrgLogoPreviewUrl(null);
        setOrgUploadedLogoUrl(null);
        setShowOrgPassword(false);
        setOrgStates([]);
    };

    useEffect(() => {
        if (!showCreateOrgModal) return;

        fetchCountries()
            .then((rows) => setOrgCountries(Array.isArray(rows) ? rows : []))
            .catch(() => setOrgCountries([]));
        fetchCategories()
            .then((rows) => setOrgCategories(Array.isArray(rows) ? rows : []))
            .catch(() => setOrgCategories([]));
    }, [showCreateOrgModal]);

    useEffect(() => {
        if (!showCreateOrgModal || !orgCreateForm.countryId) {
            setOrgStates([]);
            return;
        }

        let isActive = true;
        setFetchingOrgStates(true);
        fetchStates(orgCreateForm.countryId)
            .then((rows) => {
                if (!isActive) return;
                setOrgStates(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!isActive) return;
                setOrgStates([]);
            })
            .finally(() => {
                if (!isActive) return;
                setFetchingOrgStates(false);
            });

        return () => {
            isActive = false;
        };
    }, [orgCreateForm.countryId, showCreateOrgModal]);

    useEffect(() => {
        return () => {
            if (orgLogoPreviewUrl) {
                URL.revokeObjectURL(orgLogoPreviewUrl);
            }
        };
    }, [orgLogoPreviewUrl]);

    const refreshEnterpriseAccess = async () => {
        try {
            const access = await checkEnterpriseAccess();
            setEnterpriseAccess(access);
        } catch {
            // Ignore refresh failures; workspace screen still functions with existing state.
        }
    };

    const showQuotaLimitToast = (resourceLabel: string, current?: number, limit?: number) => {
        if (typeof current === 'number' && typeof limit === 'number') {
            showToast(`Limit reached: ${resourceLabel} (${current}/${limit}). Contact admin to increase quota.`, 'error');
            return;
        }
        showToast(`Limit reached: ${resourceLabel}. Contact admin to increase quota.`, 'error');
    };

    const handleLimitError = (error: unknown): boolean => {
        if (!isLimitReachedError(error)) return false;
        showToast(formatLimitReachedMessage(error), 'error');
        return true;
    };

    const handleOrgCreateFieldChange = (
        name: keyof typeof orgCreateForm,
        value: string
    ) => {
        setOrgCreateForm((prev) => ({ ...prev, [name]: value }));
        setOrgCreateErrors((prev) => {
            if (!prev[name]) return prev;
            const next = { ...prev };
            delete next[name];
            return next;
        });
    };

    const handleOrgLogoUpload = async (file: File) => {
        const isValidType =
            /\.(jpg|jpeg|png|webp|svg)$/i.test(file.name) || file.type.startsWith('image/');
        if (!isValidType) {
            setOrgCreateErrors((prev) => ({
                ...prev,
                logo: 'Invalid file type (png/jpg/jpeg/webp/svg)'
            }));
            return;
        }

        if (file.size > 1 * 1024 * 1024) {
            setOrgCreateErrors((prev) => ({ ...prev, logo: 'File too large (max 1MB)' }));
            return;
        }

        if (orgLogoPreviewUrl) {
            URL.revokeObjectURL(orgLogoPreviewUrl);
        }
        setOrgLogoPreviewUrl(URL.createObjectURL(file));
        setUploadingOrgLogo(true);
        setOrgCreateErrors((prev) => ({ ...prev, logo: '' }));

        try {
            const result = await uploadPublicOrgLogo(file);
            const finalUrl = result?.path || result?.url;
            setOrgUploadedLogoUrl(finalUrl || null);
            handleOrgCreateFieldChange('logo', finalUrl || '');
        } catch {
            setOrgCreateErrors((prev) => ({ ...prev, logo: 'Failed to upload logo' }));
        } finally {
            setUploadingOrgLogo(false);
        }
    };

    const handleRemoveOrgLogo = () => {
        if (orgLogoPreviewUrl) {
            URL.revokeObjectURL(orgLogoPreviewUrl);
        }
        setOrgLogoPreviewUrl(null);
        setOrgUploadedLogoUrl(null);
        handleOrgCreateFieldChange('logo', '');
        setOrgCreateErrors((prev) => ({ ...prev, logo: '' }));
    };

    const loadWorkspace = async () => {
        try {
            setLoading(true);
            setError(null);
            const [{ workspace: ws, role }, access] = await Promise.all([
                getWorkspace(workspaceId),
                checkEnterpriseAccess()
            ]);
            setWorkspace(ws);
            setUserRole(role);
            setEnterpriseAccess(access);

            // Load initial tab data based on route query
            const initialTab = resolveTabFromQuery(searchParams.get('tab'));
            setActiveTab(initialTab);
        } catch (err: any) {
            console.error('Error loading workspace:', err);
            setError(err.message || 'Failed to load workspace');
        } finally {
            setLoading(false);
        }
    };

    const loadTabData = async (tab: Tab) => {
        tabAbortRef.current?.abort();
        const controller = new AbortController();
        tabAbortRef.current = controller;
        const requestId = ++tabRequestIdRef.current;
        const isStale = () => requestId !== tabRequestIdRef.current || controller.signal.aborted;

        try {
            setTabLoading(true);
            setTabError(null);

            switch (tab) {
                case 'organizations': {
                    const [{ organizations: orgs }, { requests }] = await Promise.all([
                        getLinkedOrganizations(workspaceId, { signal: controller.signal }),
                        getWorkspaceLinkRequests(workspaceId, { signal: controller.signal }),
                    ]);
                    if (isStale()) return;
                    setOrganizations(orgs);
                    setLinkRequests(requests || []);
                    break;
                }
                case 'members': {
                    const [{ members: mems }, { invites: wsInvites }] = await Promise.all([
                        getWorkspaceMembers(workspaceId, { signal: controller.signal }),
                        getWorkspaceInvites(workspaceId, { signal: controller.signal }),
                    ]);
                    if (isStale()) return;
                    setMembers(mems);
                    setInvites(wsInvites);
                    break;
                }
                case 'api-keys': {
                    const [{ apiKeys: keys }, { scopes: sc }] = await Promise.all([
                        getApiKeys(workspaceId, { signal: controller.signal }),
                        getApiScopes({ signal: controller.signal })
                    ]);
                    if (isStale()) return;
                    setApiKeys(keys);
                    setScopes(sc);
                    break;
                }
                case 'usage': {
                    const [stats, { logs }] = await Promise.all([
                        getUsageStats(workspaceId, 30, { signal: controller.signal }),
                        getUsageLogs(workspaceId, { limit: 50 }, { signal: controller.signal })
                    ]);
                    if (isStale()) return;
                    setUsageStats(stats);
                    setUsageLogs(logs);
                    break;
                }
                case 'analytics': {
                    const range = debouncedAnalyticsRange;
                    const [overview, summary, daily, heatmap, categories] = await Promise.all([
                        getEnterpriseAnalytics(workspaceId, `${range}d`, { signal: controller.signal }),
                        getEnterpriseAnalyticsSummary(workspaceId, range, { signal: controller.signal }),
                        getEnterpriseAnalyticsDaily(workspaceId, range, { signal: controller.signal }),
                        getEnterpriseAnalyticsHeatmap(workspaceId, range, { signal: controller.signal }),
                        getEnterpriseAnalyticsCategories(workspaceId, range, { signal: controller.signal }),
                    ]);
                    if (isStale()) return;
                    setAnalytics(overview);
                    setAnalyticsSummary(summary);
                    setAnalyticsDaily(daily);
                    setAnalyticsHeatmap(heatmap);
                    setAnalyticsCategories(categories);
                    break;
                }
                case 'security': {
                    const [auditRes, sessionsRes] = await Promise.all([
                        getWorkspaceAuditLogs(
                            workspaceId,
                            {
                                page: auditPagination.page,
                                limit: auditPagination.limit,
                                action: debouncedAuditActionFilter !== 'ALL'
                                    ? debouncedAuditActionFilter as WorkspaceAuditLog['action']
                                    : undefined,
                                startDate: debouncedAuditStartDate || undefined,
                                endDate: debouncedAuditEndDate || undefined
                            },
                            { signal: controller.signal }
                        ),
                        getWorkspaceSessions(workspaceId, { signal: controller.signal })
                    ]);
                    if (isStale()) return;
                    setAuditLogs(auditRes.logs || []);
                    setAuditPagination(auditRes.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
                    setWorkspaceSessions(sessionsRes.sessions || []);
                    break;
                }
            }
        } catch (err: any) {
            if (controller.signal.aborted || err?.name === 'AbortError') {
                return;
            }
            console.error(`Error loading ${tab} data:`, err);
            const message = err?.message || `Failed to load ${tab} data`;
            setTabError(message);
            showToast(message, 'error');
        } finally {
            if (!isStale()) {
                setTabLoading(false);
            }
        }
    };

    const handleCreateApiKey = async () => {
        if (!canManageApiKeys) {
            permissionDenied();
            return;
        }
        if (!newApiKeyName.trim() || selectedScopes.length === 0) return;
        if (apiKeyLimitReached) {
            showQuotaLimitToast('API Keys', quotaUsage?.apiKeys, quotaLimits?.maxApiKeys);
            return;
        }

        try {
            setCreating(true);
            const result = await createApiKey(workspaceId, newApiKeyName.trim(), selectedScopes);
            setCreatedKey(result.plainTextKey);
            setApiKeySecrets((prev) => ({ ...prev, [result.apiKey.id]: result.plainTextKey }));
            setNewApiKeyName('');
            setSelectedScopes([]);
            await loadTabData('api-keys');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            if (handleLimitError(err)) return;
            setError(err.message || 'Failed to create API key');
        } finally {
            setCreating(false);
        }
    };

    const handleRevokeKey = async (keyId: string) => {
        if (!canManageApiKeys) {
            permissionDenied();
            return;
        }
        if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return;

        try {
            await revokeApiKey(workspaceId, keyId);
            setApiKeySecrets((prev) => {
                const next = { ...prev };
                delete next[keyId];
                return next;
            });
            await loadTabData('api-keys');
        } catch (err: any) {
            setError(err.message || 'Failed to revoke API key');
        }
    };

    const handleRotateKey = async (keyId: string) => {
        if (!canManageApiKeys) {
            permissionDenied();
            return;
        }
        if (!confirm('Rotate this key? The old key will stop working immediately.')) return;

        try {
            const result = await rotateApiKey(workspaceId, keyId);
            setCreatedKey(result.plainTextKey);
            setApiKeySecrets((prev) => ({ ...prev, [result.apiKey.id]: result.plainTextKey }));
            await loadTabData('api-keys');
        } catch (err: any) {
            setError(err.message || 'Failed to rotate API key');
        }
    };

    const handleCopyActiveApiKey = async (keyId: string) => {
        if (!permissions.copyApiKeys) {
            permissionDenied();
            return;
        }
        const secret = apiKeySecrets[keyId];
        if (!secret) {
            showToast('Key is only shown once on creation. Rotate to generate a new key.', 'error');
            return;
        }

        try {
            await logApiKeyCopy(workspaceId, keyId);
            await copyToClipboard(secret);
            showToast('API key copied', 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to copy API key', 'error');
        }
    };

    const handleUnlinkOrg = async (orgId: string) => {
        if (!canManageOrganizations) {
            permissionDenied();
            return;
        }
        if (!confirm('Unlink this organization from the workspace?')) return;

        try {
            await unlinkOrganization(workspaceId, orgId);
            await loadTabData('organizations');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            setError(err.message || 'Failed to unlink organization');
        }
    };

    const validateLinkRequestIdentifier = (value: string, method: LinkRequestMethod): string | null => {
        if (!value.trim()) {
            return 'Identifier is required';
        }
        if (method === 'ORG_ID' && !ORG_ID_REGEX.test(value.trim())) {
            return 'Enter a valid organization ID (UUID)';
        }
        return null;
    };

    const handleCreateLinkRequest = async () => {
        if (!canManageOrganizations) {
            permissionDenied();
            return;
        }
        const identifierValue = requestIdentifier.trim();
        const validationError = validateLinkRequestIdentifier(identifierValue, requestLinkMethod);
        if (validationError) {
            setRequestIdentifierError(validationError);
            return;
        }
        setRequestIdentifierError(null);
        if (linkedOrgLimitReached) {
            showQuotaLimitToast('Linked Organizations', quotaUsage?.linkedOrgs, quotaLimits?.maxLinkedOrgs);
            return;
        }
        try {
            setLinkingOrg(true);
            const payload =
                requestLinkMethod === 'ORG_ID'
                    ? {
                        linkMethod: 'ORG_ID' as const,
                        organizationId: identifierValue,
                        message: requestMessage.trim() || undefined
                    }
                    : {
                        linkMethod: requestLinkMethod,
                        identifier: identifierValue,
                        message: requestMessage.trim() || undefined
                    };
            await requestWorkspaceLink(workspaceId, payload);
            setShowRequestLinkModal(false);
            setRequestLinkMethod('EMAIL');
            setRequestIdentifier('');
            setRequestIdentifierError(null);
            setRequestMessage('');
            await loadTabData('organizations');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            if (handleLimitError(err)) return;
            setError(err.message || 'Failed to create link request');
        } finally {
            setLinkingOrg(false);
        }
    };

    const handleCancelLinkRequest = async (requestId: string) => {
        if (!canManageOrganizations) {
            permissionDenied();
            return;
        }
        if (!confirm('Cancel this link request?')) return;
        try {
            await cancelWorkspaceLinkRequest(requestId);
            await loadTabData('organizations');
        } catch (err: any) {
            setError(err.message || 'Failed to cancel link request');
        }
    };

    const handleCreateOrganization = async () => {
        if (!canManageOrganizations) {
            permissionDenied();
            return;
        }
        if (linkedOrgLimitReached) {
            showQuotaLimitToast('Linked Organizations', quotaUsage?.linkedOrgs, quotaLimits?.maxLinkedOrgs);
            return;
        }

        const nextErrors: Record<string, string> = {};
        if (!orgCreateForm.orgName.trim()) nextErrors.orgName = 'Organization Name is required';
        if (!orgCreateForm.email.trim()) nextErrors.email = 'Email is required';
        if (!orgCreateForm.website.trim()) nextErrors.website = 'Website is required';
        if (!orgCreateForm.countryId) nextErrors.countryId = 'Country is required';
        if (!orgCreateForm.categoryId) nextErrors.categoryId = 'Category is required';
        if (!orgCreateForm.password) nextErrors.password = 'Password is required';
        if (orgCreateForm.password && !STRONG_PASSWORD_REGEX.test(orgCreateForm.password)) {
            nextErrors.password = STRONG_PASSWORD_MESSAGE;
        }
        if (!orgCreateForm.phone.trim()) nextErrors.phone = 'Phone is required';
        if (!orgCreateForm.address.trim()) nextErrors.address = 'Address is required';
        if (!orgCreateForm.type) nextErrors.type = 'Organization Type is required';

        if (Object.keys(nextErrors).length > 0) {
            setOrgCreateErrors(nextErrors);
            return;
        }

        try {
            setCreatingOrganization(true);
            setOrgCreateErrors({});
            await createWorkspaceOrganization(workspaceId, {
                orgName: orgCreateForm.orgName.trim(),
                email: orgCreateForm.email.trim(),
                password: orgCreateForm.password,
                website: orgCreateForm.website.trim(),
                phone: orgCreateForm.phone.trim(),
                address: orgCreateForm.address.trim(),
                countryId: orgCreateForm.countryId,
                stateId: orgCreateForm.stateId || null,
                categoryId: orgCreateForm.categoryId,
                type: orgCreateForm.type,
                about: orgCreateForm.about.trim() || undefined,
                logo: orgCreateForm.logo || undefined
            });
            setShowCreateOrgModal(false);
            resetCreateOrgForm();
            await loadTabData('organizations');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            if (handleLimitError(err)) return;
            setError(err.message || 'Failed to create organization');
        } finally {
            setCreatingOrganization(false);
        }
    };

    const handleCreateInvite = async () => {
        if (!canManage) {
            permissionDenied();
            return;
        }
        const targetValue = inviteIdentifier.trim();
        if (!targetValue) return;
        if (memberLimitReached) {
            showQuotaLimitToast('Members', quotaUsage?.members, quotaLimits?.maxMembers);
            return;
        }

        if (inviteMethod === 'EMAIL' && !targetValue.includes('@')) {
            setInviteError('Please enter a valid email address');
            return;
        }

        if (inviteMethod === 'USER_ID' && !ORG_ID_REGEX.test(targetValue)) {
            setInviteError('Please enter a valid user ID (UUID)');
            return;
        }

        try {
            setCreatingInvite(true);
            setInviteError(null);
            const result = await createWorkspaceInvite(workspaceId, {
                invitedEmail: inviteMethod === 'EMAIL' ? targetValue : undefined,
                invitedUserId: inviteMethod === 'USER_ID' ? targetValue : undefined,
                role: inviteRole
            });
            setLatestInviteLink(result.inviteLink);
            showToast('Invite sent', 'success');
            setInviteIdentifier('');
            await loadTabData('members');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            if (handleLimitError(err)) return;
            setInviteError(err.message || 'Failed to create invite');
        } finally {
            setCreatingInvite(false);
        }
    };

    const handleCancelInvite = async (inviteId: string) => {
        if (!canManage) {
            permissionDenied();
            return;
        }
        if (!confirm('Cancel this invite?')) return;

        try {
            await cancelWorkspaceInvite(workspaceId, inviteId);
            await loadTabData('members');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            setError(err.message || 'Failed to cancel invite');
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!canManage) {
            permissionDenied();
            return;
        }
        if (!confirm('Remove this member from the workspace?')) return;

        try {
            await removeMember(workspaceId, userId);
            await loadTabData('members');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            setError(err.message || 'Failed to remove member');
        }
    };

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
    };

    const handleAnalyticsRangeChange = (range: '7' | '30' | '90') => {
        setAnalyticsRange(range);
    };

    const handleRevokeSession = async (sessionId: string) => {
        if (!canManage) {
            permissionDenied();
            return;
        }
        if (!confirm('Revoke this session? The user will need to login again on that device.')) return;

        try {
            setRevokingSessionId(sessionId);
            await revokeWorkspaceSession(workspaceId, sessionId);
            showToast('Session revoked', 'success');
            await loadTabData('security');
        } catch (err: any) {
            showToast(err?.message || 'Failed to revoke session', 'error');
        } finally {
            setRevokingSessionId(null);
        }
    };

    const handleUpdateMemberRole = async (
        member: WorkspaceMember,
        nextRole: 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR'
    ) => {
        if (!canManage) {
            permissionDenied();
            return;
        }

        const currentRole = displayRole(member.role);
        if (currentRole === 'OWNER') {
            showToast('Owner role cannot be changed here. Use transfer ownership instead.', 'error');
            return;
        }
        if (currentRole === nextRole) return;

        const previousRole = member.role;
        setUpdatingMemberRoles((prev) => ({ ...prev, [member.id]: true }));
        setMembers((prev) =>
            prev.map((row) => (row.id === member.id ? { ...row, role: nextRole } : row))
        );

        try {
            const { member: updatedMember } = await updateMemberRole(workspaceId, member.id, nextRole);
            setMembers((prev) =>
                prev.map((row) =>
                    row.id === member.id ? { ...row, role: updatedMember.role } : row
                )
            );
            showToast('Role updated', 'success');
        } catch (err: any) {
            setMembers((prev) =>
                prev.map((row) => (row.id === member.id ? { ...row, role: previousRole } : row))
            );
            showToast(err?.message || 'Failed to update member role', 'error');
        } finally {
            setUpdatingMemberRoles((prev) => {
                const next = { ...prev };
                delete next[member.id];
                return next;
            });
        }
    };

    const formatAuditActionLabel = (action: string) =>
        action
            .toLowerCase()
            .split('_')
            .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
            .join(' ');

    const sanitizeAuditDetails = (details: string | null) =>
        (details || '')
            .replace(/\s*\|\s*actorType=[^|]*/g, '')
            .replace(/\s*\|\s*actorUserId=[^|]*/g, '')
            .replace(/\s*\|\s*actorWorkspaceId=[^|]*/g, '')
            .replace(/\s*\|\s*actorWorkspaceRole=[^|]*/g, '')
            .trim();

    const handleTabChange = (tab: Tab) => {
        const allowed = visibleTabs.some((entry) => entry.id === tab);
        if (!allowed) {
            permissionDenied();
            return;
        }
        if (tab === activeTab) return;
        setActiveTab(tab);
        router.replace(`/enterprise/${workspaceId}?tab=${tab}`, { scroll: false });
    };

    const handleExportAnalytics = async (format: 'csv' | 'pdf') => {
        if (!canExportAnalytics) {
            permissionDenied();
            return;
        }
        try {
            setExportingAnalyticsFormat(format);
            await exportEnterpriseAnalytics(workspaceId, format, analyticsRange);
            showToast(`${format.toUpperCase()} exported`, 'success');
        } catch (err: any) {
            showToast(err?.message || `Failed to export ${format.toUpperCase()}`, 'error');
        } finally {
            setExportingAnalyticsFormat(null);
        }
    };

    const handleExportUsage = async () => {
        if (!canExportUsage) {
            permissionDenied();
            return;
        }
        try {
            setExportingUsage(true);
            await exportWorkspaceUsage(workspaceId, '30');
            showToast('Usage CSV exported', 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to export usage', 'error');
        } finally {
            setExportingUsage(false);
        }
    };

    const handleExportAuditLogs = async (format: 'csv' | 'log') => {
        if (!canExportAuditLogs) {
            permissionDenied();
            return;
        }
        try {
            setExportingAuditFormat(format);
            await exportWorkspaceAuditLogs(workspaceId, format, analyticsRange);
            showToast(`Audit logs exported (${format.toUpperCase()})`, 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to export audit logs', 'error');
        } finally {
            setExportingAuditFormat(null);
        }
    };

    const openLinkOrganizationModal = () => {
        if (!canManageOrganizations) {
            permissionDenied();
            return;
        }
        if (linkedOrgLimitReached) {
            showQuotaLimitToast('Linked Organizations', quotaUsage?.linkedOrgs, quotaLimits?.maxLinkedOrgs);
            return;
        }
        setRequestLinkMethod('EMAIL');
        setRequestIdentifierError(null);
        setShowRequestLinkModal(true);
    };

    const canManage = permissions.manageMembers;
    const canManageOrganizations = permissions.manageOrganizations;
    const canManageApiKeys = permissions.manageApiKeys;
    const canExportAnalytics = permissions.exportAnalytics;
    const canExportUsage = permissions.exportUsage;
    const canExportAuditLogs = permissions.exportAuditLogs;

    const createOrgModalLabelClass = 'text-xs font-medium text-[var(--app-text-secondary)]';
    const createOrgModalInputClass = 'mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)] placeholder-[var(--app-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#187DE9]/40';
    const createOrgModalSelectClass = `${createOrgModalInputClass} [color-scheme:light] dark:[color-scheme:dark]`;
    const createOrgModalTextareaClass = `${createOrgModalInputClass} h-24`;
    const createOrgModalErrorClass = 'text-xs text-red-600 dark:text-red-400 mt-1';
    const createOrgModalHintClass = 'text-xs text-[var(--app-text-secondary)]';
    const createOrgModalSecondaryButtonClass = 'flex-1 px-4 py-2.5 border border-[var(--app-border)] text-[var(--app-text-secondary)] font-medium rounded-lg hover:bg-[var(--app-surface-hover)] transition-colors';
	
    if (loading) {
        return (
            <main className="min-h-screen bg-app pb-16">
                <div className="w-full px-4 py-10">
                    <div className="flex items-center justify-center py-32">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                </div>
            </main>
        );
    }

    if (error && !workspace) {
        return (
            <main className="min-h-screen bg-app pb-16">
                <div className="w-full px-4 py-10">
                    <div className="max-w-md mx-auto text-center py-24">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                            Error Loading Workspace
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
                        <button
                            onClick={() => router.push('/enterprise')}
                            className="px-4 py-2 btn-primary rounded-lg"
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <>
            <main className="min-h-screen bg-app pb-16">
                <div className="w-full px-4 py-8">
                    <header className="mb-6">
                        <div className="surface-card rounded-2xl p-4 md:p-5 border border-[var(--app-border)] shadow-lg">
                            <div className="mb-3">
                                <button
                                    onClick={() => router.push('/enterprise')}
                                    className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 rounded-md px-1"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to Dashboard
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 border-2 border-white/20">
                                        <Building2 className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <h1 className="text-lg md:text-xl font-semibold text-slate-900 dark:text-white truncate">
                                            {workspace?.name}
                                        </h1>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            Your role: <span className="font-medium text-slate-700 dark:text-slate-200">{normalizedUserRole || 'MEMBER'}</span>
                                        </p>
                                    </div>
                                </div>
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border self-start sm:self-auto ${workspace?.status === 'ACTIVE'
                                    ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                                    : workspace?.status === 'SUSPENDED'
                                        ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                                        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600/50'
                                    }`}>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {workspace?.status || 'ACTIVE'}
                                </span>
                            </div>

                            <div className="mt-3 pt-3 border-t border-[var(--app-border)]/70 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5" />
                                    Orgs: {workspaceOrgCount}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5" />
                                    Members: {workspaceMemberCount}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <Key className="w-3.5 h-3.5" />
                                    API Keys: {workspaceApiKeyCount}
                                </span>
                            </div>
                        </div>
                    </header>

                    {/* Error Banner */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                            {error}
                            <button
                                onClick={() => setError(null)}
                                className="ml-4 underline"
                            >
                                Dismiss
                            </button>
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="border-b border-slate-200 dark:border-slate-800">
                            <nav className="flex overflow-x-auto" aria-label="Workspace sections">
                                {visibleTabs.map(({ id, label, icon: Icon }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => handleTabChange(id as Tab)}
                                        className={`flex items-center gap-2 px-6 py-4 text-sm transition-colors whitespace-nowrap border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${activeTab === id
                                            ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 font-semibold'
                                            : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white font-medium'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {label}
                                    </button>
                                ))}
                            </nav>
                        </div>

                        <div className="p-6">
                            {tabError && (
                                <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                                    {tabError}
                                </div>
                            )}
                            {/* Organizations Tab */}
                            {activeTab === 'organizations' && (
                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                            Linked Organizations
                                        </h2>
                                        {canManageOrganizations && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={openLinkOrganizationModal}
                                                    disabled={linkedOrgLimitReached}
                                                    className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--app-border)] text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Link2 className="w-4 h-4" />
                                                    Request Existing
                                                </button>
                                                <button
                                                    onClick={() => setShowCreateOrgModal(true)}
                                                    disabled={linkedOrgLimitReached}
                                                    className="inline-flex items-center gap-2 px-4 py-2 btn-primary text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                    Create Organization
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mb-4 relative">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="text"
                                            value={organizationsSearch}
                                            onChange={(e) => setOrganizationsSearch(e.target.value)}
                                            placeholder="Search organizations and link requests..."
                                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        />
                                    </div>
                                    {canManageOrganizations && linkedOrgLimitReached && (
                                        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
                                            Limit reached: Linked Organizations ({quotaUsage?.linkedOrgs ?? 0}/{quotaLimits?.maxLinkedOrgs ?? 0})
                                        </p>
                                    )}

                                    {tabLoading ? (
                                        <TableSkeleton cols={4} rows={4} />
                                    ) : workspaceOrgCount === 0 ? (
                                        <div className="py-12 text-center">
                                            <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                            <p className="text-slate-600 dark:text-slate-400">
                                                No linked organizations yet
                                            </p>
                                            {canManageOrganizations && (
                                                <div className="mt-4 flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={openLinkOrganizationModal}
                                                        disabled={linkedOrgLimitReached}
                                                        className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--app-border)] text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Link2 className="w-4 h-4" />
                                                        Request Existing
                                                    </button>
                                                    <button
                                                        onClick={() => setShowCreateOrgModal(true)}
                                                        disabled={linkedOrgLimitReached}
                                                        className="inline-flex items-center gap-2 px-4 py-2 btn-primary text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                        Create Organization
                                                    </button>
                                                </div>
                                            )}
                                            {canManageOrganizations && linkedOrgLimitReached && (
                                                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                                                    Limit reached: Linked Organizations ({quotaUsage?.linkedOrgs ?? 0}/{quotaLimits?.maxLinkedOrgs ?? 0})
                                                </p>
                                            )}
                                        </div>
                                    ) : filteredOrganizations.length === 0 ? (
                                        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                            No organizations match your search.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {filteredOrganizations.map((link) => (
                                                <div
                                                    key={link.id}
                                                    className="flex items-center justify-between p-4 surface-card rounded-lg"
                                                >
                                                    <div>
                                                        <h3 className="font-medium text-slate-900 dark:text-white">
                                                            {link.organization.name}
                                                        </h3>
                                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                                            {link.organization.slug} • {link.organization.planType}
                                                        </p>
                                                    </div>
                                                    {canManageOrganizations && (
                                                        <button
                                                            onClick={() => handleUnlinkOrg(link.organizationId)}
                                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                                            title="Unlink"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="mt-8">
                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                                            Link Requests
                                        </h3>
                                        {tabLoading ? (
                                            <TableSkeleton cols={3} rows={3} />
                                        ) : linkRequests.length === 0 ? (
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                No link requests yet.
                                            </p>
                                        ) : filteredLinkRequests.length === 0 ? (
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                No link requests match your search.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {filteredLinkRequests.map((request) => (
                                                    <div
                                                        key={request.id}
                                                        className="surface-card rounded-lg p-3 flex items-center justify-between gap-4"
                                                    >
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                                {request.organization?.name || request.requestIdentifier || 'Organization'}
                                                            </p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                {request.status} • Requested {new Date(request.createdAt).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                        {canManageOrganizations &&
                                                            (request.status === 'PENDING' ||
                                                                request.status ===
                                                                    'PENDING_APPROVAL') && (
                                                            <button
                                                                onClick={() => handleCancelLinkRequest(request.id)}
                                                                className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            >
                                                                Cancel
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Members Tab */}
                            {activeTab === 'members' && (
                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                            Team Members
                                        </h2>
                                        {canManage && (
                                            <button
                                                onClick={() => {
                                                    setShowInviteModal(true);
                                                    setInviteMethod('EMAIL');
                                                    setInviteIdentifier('');
                                                    setInviteRole('AUDITOR');
                                                    setInviteError(null);
                                                    setLatestInviteLink(null);
                                                }}
                                                disabled={memberLimitReached}
                                                className="inline-flex items-center gap-2 px-4 py-2 btn-primary text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Invite Member
                                            </button>
                                        )}
                                    </div>
                                    <div className="mb-4 relative">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="text"
                                            value={membersSearch}
                                            onChange={(e) => setMembersSearch(e.target.value)}
                                            placeholder="Search members and invites..."
                                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        />
                                    </div>
                                    {canManage && memberLimitReached && (
                                        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
                                            Limit reached: Members ({quotaUsage?.members ?? 0}/{quotaLimits?.maxMembers ?? 0})
                                        </p>
                                    )}

                                    {tabLoading ? (
                                        <TableSkeleton cols={4} rows={4} />
                                    ) : members.length === 0 ? (
                                        <div className="py-12 text-center">
                                            <Users className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                            <p className="text-slate-600 dark:text-slate-400">
                                                No members yet
                                            </p>
                                        </div>
                                    ) : filteredMembers.length === 0 ? (
                                        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                            No members match your search.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {filteredMembers.map((member) => {
                                                const memberRole = displayRole(member.role);
                                                const canEditRole =
                                                    canManage
                                                    && memberRole !== 'OWNER'
                                                    && (memberRole === 'ADMIN'
                                                        || memberRole === 'DEVELOPER'
                                                        || memberRole === 'ANALYST'
                                                        || memberRole === 'AUDITOR');
                                                const roleUpdating = Boolean(updatingMemberRoles[member.id]);
                                                return (
                                                <div
                                                    key={member.id}
                                                    className="flex items-center justify-between p-4 surface-card rounded-lg"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                                                {member.user?.firstName?.[0] || member.user?.email?.[0] || '?'}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <h3 className="font-medium text-slate-900 dark:text-white">
                                                                {member.user?.firstName} {member.user?.lastName}
                                                            </h3>
                                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                                {member.user?.email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {canEditRole ? (
                                                            <select
                                                                value={memberRole}
                                                                onChange={(e) =>
                                                                    handleUpdateMemberRole(
                                                                        member,
                                                                        e.target.value as 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR'
                                                                    )
                                                                }
                                                                disabled={roleUpdating}
                                                                className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                <option value="ADMIN">ADMIN</option>
                                                                <option value="DEVELOPER">DEVELOPER</option>
                                                                <option value="ANALYST">ANALYST</option>
                                                                <option value="AUDITOR">AUDITOR</option>
                                                            </select>
                                                        ) : (
                                                            <span className={`px-2.5 py-1 text-xs font-medium rounded ${memberRole === 'OWNER'
                                                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                                                : memberRole === 'ADMIN'
                                                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                                                    : 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400'
                                                                }`}>
                                                                {memberRole}
                                                            </span>
                                                        )}
                                                        {canManage && memberRole !== 'OWNER' && (
                                                            <button
                                                                onClick={() => handleRemoveMember(member.userId)}
                                                                disabled={roleUpdating}
                                                                className="p-1 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                title="Remove member"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )})}
                                        </div>
                                    )}

                                    <div className="mt-8">
                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                                            Pending & Recent Invites
                                        </h3>
                                        {tabLoading ? (
                                            <TableSkeleton cols={7} rows={3} />
                                        ) : invites.length === 0 ? (
                                            <p className="text-sm text-slate-500 dark:text-slate-400">No invites yet.</p>
                                        ) : filteredInvites.length === 0 ? (
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                No invites match your search.
                                            </p>
                                        ) : (
                                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                                <table className="min-w-full text-sm">
                                                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-medium">Target</th>
                                                            <th className="px-3 py-2 text-left font-medium">Role</th>
                                                            <th className="px-3 py-2 text-left font-medium">Invited By</th>
                                                            <th className="px-3 py-2 text-left font-medium">Created</th>
                                                            <th className="px-3 py-2 text-left font-medium">Expires</th>
                                                            <th className="px-3 py-2 text-left font-medium">Status</th>
                                                            {canManage && <th className="px-3 py-2 text-right font-medium">Action</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                                        {filteredInvites.map((invite) => (
                                                            <tr key={invite.id} className="bg-white dark:bg-slate-950/20">
                                                                <td className="px-3 py-2 text-slate-900 dark:text-white">
                                                                    {invite.invitedEmail || invite.invitedUserId || 'Unknown'}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{displayRole(invite.role)}</td>
                                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                                                    {invite.createdByUser?.name || invite.createdByUser?.email || invite.createdBy || '-'}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                                                    {new Date(invite.createdAt).toLocaleDateString()}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                                                    {new Date(invite.expiresAt).toLocaleDateString()}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${invite.status === 'PENDING'
                                                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                                                        : invite.status === 'ACCEPTED'
                                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                                        }`}>
                                                                        {invite.status}
                                                                    </span>
                                                                </td>
                                                                {canManage && (
                                                                    <td className="px-3 py-2 text-right">
                                                                        {invite.status === 'PENDING' && (
                                                                            <button
                                                                                onClick={() => handleCancelInvite(invite.id)}
                                                                                className="inline-flex items-center p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                                                                title="Cancel invite"
                                                                            >
                                                                                <Trash2 className="w-4 h-4" />
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* API Keys Tab */}
                            {activeTab === 'api-keys' && (
                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                            API Keys
                                        </h2>
                                        {canManageApiKeys && (
                                            <button
                                                onClick={() => setShowCreateApiKeyModal(true)}
                                                disabled={apiKeyLimitReached}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Create API Key
                                            </button>
                                        )}
                                    </div>
                                    <div className="mb-4 relative">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="text"
                                            value={apiKeysSearch}
                                            onChange={(e) => setApiKeysSearch(e.target.value)}
                                            placeholder="Search API keys by name, prefix, or scope..."
                                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        />
                                    </div>
                                    {canManageApiKeys && apiKeyLimitReached && (
                                        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
                                            Limit reached: API Keys ({quotaUsage?.apiKeys ?? 0}/{quotaLimits?.maxApiKeys ?? 0})
                                        </p>
                                    )}

                                    {tabLoading ? (
                                        <TableSkeleton cols={4} rows={4} />
                                    ) : apiKeys.length === 0 ? (
                                        <div className="py-12 text-center">
                                            <Key className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                            <p className="text-slate-600 dark:text-slate-400">
                                                No API keys created yet
                                            </p>
                                        </div>
                                    ) : filteredApiKeys.length === 0 ? (
                                        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                            No API keys match your search.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {filteredApiKeys.map((key) => (
                                                <div
                                                    key={key.id}
                                                    className={`p-4 surface-card rounded-lg ${key.isRevoked ? 'opacity-60' : ''
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-medium text-slate-900 dark:text-white">
                                                                {key.name}
                                                            </h3>
                                                            {key.isRevoked && (
                                                                <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded">
                                                                    Revoked
                                                                </span>
                                                            )}
                                                        </div>
                                                        {!key.isRevoked && (permissions.copyApiKeys || canManageApiKeys) && (
                                                            <div className="flex items-center gap-1">
                                                                {permissions.copyApiKeys && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleCopyActiveApiKey(key.id)}
                                                                        disabled={!apiKeySecrets[key.id]}
                                                                        className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        title={apiKeySecrets[key.id]
                                                                            ? 'Copy key'
                                                                            : 'Key is only shown once on creation. Rotate to generate a new key.'}
                                                                    >
                                                                        <Copy className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                {canManageApiKeys && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRotateKey(key.id)}
                                                                            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                                                            title="Rotate"
                                                                        >
                                                                            <RefreshCw className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRevokeKey(key.id)}
                                                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                                                            title="Revoke"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                                                        <code className="font-mono">{key.prefix}...</code>
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5" />
                                                            {key.lastUsedAt
                                                                ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                                                                : 'Never used'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {key.scopes.map((scope) => (
                                                            <span
                                                                key={scope}
                                                                className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded"
                                                            >
                                                                {scope}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Usage Tab */}
                            {activeTab === 'usage' && (
                                <div>
                                    <div className="flex items-center justify-between mb-6 gap-3">
                                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                            API Usage (Last 30 Days)
                                        </h2>
                                        {canExportUsage && (
                                            <button
                                                type="button"
                                                onClick={handleExportUsage}
                                                disabled={exportingUsage}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--app-border)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {exportingUsage ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Download className="w-3.5 h-3.5" />
                                                )}
                                                Export CSV
                                            </button>
                                        )}
                                    </div>
                                    <div className="mb-4 relative">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="text"
                                            value={usageSearch}
                                            onChange={(e) => setUsageSearch(e.target.value)}
                                            placeholder="Search API usage logs..."
                                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        />
                                    </div>

                                    {tabLoading ? (
                                        <div className="space-y-4">
                                            <CardSkeleton count={3} />
                                            <TableSkeleton cols={4} rows={6} />
                                        </div>
                                    ) : usageStats ? (
                                        <>
                                            {/* Stats Cards */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                                <div className="p-4 surface-card rounded-lg">
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                                                        Total Requests
                                                    </p>
                                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                                        {usageStats.totalRequests.toLocaleString()}
                                                    </p>
                                                </div>
                                                <div className="p-4 surface-card rounded-lg">
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                                                        Success Rate
                                                    </p>
                                                    <p className="text-2xl font-bold text-green-600">
                                                        {usageStats.successRate.toFixed(1)}%
                                                    </p>
                                                </div>
                                                <div className="p-4 surface-card rounded-lg">
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                                                        Avg. Daily
                                                    </p>
                                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                                        {Math.round(usageStats.totalRequests / 30).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Recent Logs */}
                                            <h3 className="text-md font-semibold text-slate-900 dark:text-white mb-4">
                                                Recent API Calls
                                            </h3>
                                            {usageLogs.length === 0 ? (
                                                <p className="text-slate-600 dark:text-slate-400 text-center py-8">
                                                    No API calls recorded yet
                                                </p>
                                            ) : filteredUsageLogs.length === 0 ? (
                                                <p className="text-slate-600 dark:text-slate-400 text-center py-8">
                                                    No API usage logs match your search
                                                </p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {filteredUsageLogs.slice(0, 10).map((log) => (
                                                        <div
                                                            key={log.id}
                                                            className="flex items-center justify-between p-3 surface-card rounded-lg text-sm"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                {log.statusCode < 400 ? (
                                                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                                ) : (
                                                                    <XCircle className="w-4 h-4 text-red-500" />
                                                                )}
                                                                <code className="text-slate-600 dark:text-slate-400">
                                                                    {log.method} {log.endpoint}
                                                                </code>
                                                            </div>
                                                            <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
                                                                <span>{log.apiKeyName}</span>
                                                                <span>{new Date(log.createdAt).toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-slate-600 dark:text-slate-400 text-center py-8">
                                            No data yet
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Analytics Tab */}
                            {activeTab === 'analytics' && (
                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                            Multi-Org Analytics
                                        </h2>
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={analyticsRange}
                                                onChange={(e) => handleAnalyticsRangeChange(e.target.value as '7' | '30' | '90')}
                                                className="px-3 py-1.5 rounded-lg border border-[var(--app-border)] bg-transparent text-sm text-[var(--app-text-primary)]"
                                            >
                                                <option value="7">Last 7 days</option>
                                                <option value="30">Last 30 days</option>
                                                <option value="90">Last 90 days</option>
                                            </select>
                                            {canExportAnalytics && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleExportAnalytics('csv')}
                                                    disabled={Boolean(exportingAnalyticsFormat)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--app-border)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {exportingAnalyticsFormat === 'csv' ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Download className="w-3.5 h-3.5" />
                                                    )}
                                                    CSV
                                                </button>
                                            )}
                                            {canExportAnalytics && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleExportAnalytics('pdf')}
                                                    disabled={Boolean(exportingAnalyticsFormat)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--app-border)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {exportingAnalyticsFormat === 'pdf' ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Download className="w-3.5 h-3.5" />
                                                    )}
                                                    PDF
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {tabLoading ? (
                                        <div className="space-y-4">
                                            <CardSkeleton count={3} />
                                            <ChartSkeleton />
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                <ChartSkeleton />
                                                <ChartSkeleton />
                                            </div>
                                        </div>
                                    ) : workspaceOrgCount === 0 ? (
                                        <div className="py-12 text-center">
                                            <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                            <p className="text-slate-700 dark:text-slate-300 mb-2">
                                                No linked organizations yet
                                            </p>
                                            {canManageOrganizations && (
                                                <button
                                                    onClick={openLinkOrganizationModal}
                                                    disabled={linkedOrgLimitReached}
                                                    className="inline-flex items-center gap-2 px-4 py-2 btn-primary text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Link2 className="w-4 h-4" />
                                                    Request organization link
                                                </button>
                                            )}
                                        </div>
                                    ) : analyticsSummary && analyticsDaily && analyticsHeatmap && analyticsCategories && analytics ? (
                                        <>
                                            {/* Totals */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                                <div className="p-4 surface-card rounded-lg">
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Views</p>
                                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                                        {analyticsSummary.totals.views.toLocaleString()}
                                                    </p>
                                                </div>
                                                <div className="p-4 surface-card rounded-lg">
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Clicks</p>
                                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                                        {analyticsSummary.totals.clicks.toLocaleString()}
                                                    </p>
                                                </div>
                                                <div className="p-4 surface-card rounded-lg">
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Click-Through Rate</p>
                                                    <p className="text-2xl font-bold text-blue-600">
                                                        {analyticsSummary.totals.ctr.toFixed(1)}%
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="surface-card rounded-xl p-5 mb-8">
                                                <div className="overflow-x-auto touch-pan-x -mx-2 px-2">
                                                    <div className="min-w-[500px] h-64">
                                                        <AnalyticsChart
                                                            data={analyticsDaily.series}
                                                            type="combined"
                                                            height={256}
                                                            color="#3b82f6"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                                                <div className="surface-card rounded-xl p-5">
                                                    <h3 className="text-md font-semibold text-slate-900 dark:text-white mb-4">
                                                        Traffic by Time
                                                    </h3>
                                                    <TrafficHeatmap
                                                        heatmap={analyticsHeatmap.heatmap}
                                                        maxViews={analyticsHeatmap.maxViews}
                                                        maxClicks={analyticsHeatmap.maxClicks}
                                                        range={`${analyticsRange}d`}
                                                        onRangeChange={(nextRange) => handleAnalyticsRangeChange(nextRange.replace('d', '') as '7' | '30' | '90')}
                                                    />
                                                </div>
                                                <div className="surface-card rounded-xl p-5">
                                                    <h3 className="text-md font-semibold text-slate-900 dark:text-white mb-4">
                                                        Category Performance
                                                    </h3>
                                                    <CategoryPerformance
                                                        topCategories={analyticsCategories.topCategories}
                                                        trends={analyticsCategories.trends}
                                                        range={`${analyticsRange}d`}
                                                        onRangeChange={(nextRange) => handleAnalyticsRangeChange(nextRange.replace('d', '') as '7' | '30' | '90')}
                                                    />
                                                </div>
                                            </div>

                                            <h3 className="text-md font-semibold text-slate-900 dark:text-white mb-4">By Organization</h3>
                                            <div className="overflow-x-auto touch-pan-x">
                                                <table className="min-w-[680px] w-full text-sm border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left">Organization</th>
                                                            <th className="px-3 py-2 text-right">Views</th>
                                                            <th className="px-3 py-2 text-right">Clicks</th>
                                                            <th className="px-3 py-2 text-right">CTR</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {analyticsSummary.topOrgs.map((org) => (
                                                            <tr key={org.organizationId} className="border-t border-slate-200 dark:border-slate-800">
                                                                <td className="px-3 py-2">
                                                                    <div className="font-medium text-slate-900 dark:text-white">{org.name}</div>
                                                                    <div className="text-xs text-slate-500 dark:text-slate-400">{org.slug || '—'}</div>
                                                                </td>
                                                                <td className="px-3 py-2 text-right">{org.views.toLocaleString()}</td>
                                                                <td className="px-3 py-2 text-right">{org.clicks.toLocaleString()}</td>
                                                                <td className="px-3 py-2 text-right">{org.ctr.toFixed(1)}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="py-12 text-center">
                                            <BarChart3 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                            <p className="text-slate-600 dark:text-slate-400 mb-2">
                                                No analytics data available
                                            </p>
                                            <p className="text-sm text-slate-500 dark:text-slate-500 mb-4">
                                                Link organizations to this workspace to see aggregated analytics.
                                            </p>
                                            <button
                                                onClick={() => loadTabData('analytics')}
                                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                Retry
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Security Tab */}
                            {activeTab === 'security' && (
                                <div className="space-y-8">
                                    <section>
                                        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
                                            <div>
                                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                                    Audit Logs
                                                </h2>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                    Critical workspace actions from the last 30 days by default.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {canExportAuditLogs && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleExportAuditLogs('csv')}
                                                        disabled={Boolean(exportingAuditFormat)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-[var(--app-border)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    >
                                                        {exportingAuditFormat === 'csv' ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <Download className="w-3.5 h-3.5" />
                                                        )}
                                                        Export CSV
                                                    </button>
                                                )}
                                                {canExportAuditLogs && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleExportAuditLogs('log')}
                                                        disabled={Boolean(exportingAuditFormat)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-[var(--app-border)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    >
                                                        {exportingAuditFormat === 'log' ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <Download className="w-3.5 h-3.5" />
                                                        )}
                                                        Export .log
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => loadTabData('security')}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-[var(--app-border)] hover:bg-slate-50 dark:hover:bg-slate-800"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                    Refresh
                                                </button>
                                            </div>
                                        </div>

                                        <div className="surface-card rounded-xl border border-[var(--app-border)] p-4 mb-4">
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                                        Action
                                                    </label>
                                                    <select
                                                        value={auditActionFilter}
                                                        onChange={(e) => setAuditActionFilter(e.target.value)}
                                                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                                    >
                                                        <option value="ALL">All actions</option>
                                                        <option value="CREATE">Create</option>
                                                        <option value="UPDATE">Update</option>
                                                        <option value="DELETE">Delete</option>
                                                        <option value="APPROVE">Approve</option>
                                                        <option value="REJECT">Reject</option>
                                                        <option value="LOGIN">Login</option>
                                                        <option value="SUSPEND">Suspend</option>
                                                        <option value="OTHER">Other</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                                        Start date
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={auditStartDate}
                                                        onChange={(e) => setAuditStartDate(e.target.value)}
                                                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                                        End date
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={auditEndDate}
                                                        onChange={(e) => setAuditEndDate(e.target.value)}
                                                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {tabLoading ? (
                                            <TableSkeleton cols={5} rows={6} />
                                        ) : auditLogs.length === 0 ? (
                                            <div className="surface-card rounded-xl border border-[var(--app-border)] p-6 text-sm text-slate-500 dark:text-slate-400">
                                                No audit logs found for this filter.
                                            </div>
                                        ) : (
                                            <>
                                                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                                    <table className="min-w-full text-sm">
                                                        <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left font-medium">When</th>
                                                                <th className="px-3 py-2 text-left font-medium">Action</th>
                                                                <th className="px-3 py-2 text-left font-medium">Entity</th>
                                                                <th className="px-3 py-2 text-left font-medium">Actor</th>
                                                                <th className="px-3 py-2 text-left font-medium">Details</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                                            {auditLogs.map((log) => (
                                                                <tr key={log.id} className="bg-white dark:bg-slate-950/20 align-top">
                                                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                                        {new Date(log.createdAt).toLocaleString()}
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                                                            {formatAuditActionLabel(log.action)}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                                                        {log.entity || '-'}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                                                        {log.actor?.type === 'USER' ? (
                                                                            <span>
                                                                                {log.actor.label} · {log.actor.workspaceRole || 'Former member'}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center gap-1.5">
                                                                                <span>
                                                                                    {log.actor?.label
                                                                                        || (log.admin
                                                                                            ? `${log.admin.firstName || ''} ${log.admin.lastName || ''}`.trim() || log.admin.email
                                                                                            : 'Super Admin')}
                                                                                </span>
                                                                                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                                                    ADMIN
                                                                                </span>
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                                                        <div className="max-w-xl truncate" title={sanitizeAuditDetails(log.details)}>
                                                                            {sanitizeAuditDetails(log.details) || '-'}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="mt-3 flex items-center justify-between text-sm">
                                                    <p className="text-slate-500 dark:text-slate-400">
                                                        Page {auditPagination.page} of {Math.max(1, auditPagination.totalPages)}
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setAuditPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                                                            disabled={auditPagination.page <= 1 || tabLoading}
                                                            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--app-border)] disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Previous
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAuditPagination((prev) => ({
                                                                ...prev,
                                                                page: Math.min(prev.totalPages || 1, prev.page + 1)
                                                            }))}
                                                            disabled={auditPagination.page >= (auditPagination.totalPages || 1) || tabLoading}
                                                            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--app-border)] disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Next
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </section>

                                    <section>
                                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                                            Active Sessions
                                        </h3>
                                        {tabLoading ? (
                                            <TableSkeleton cols={5} rows={4} />
                                        ) : workspaceSessions.length === 0 ? (
                                            <div className="surface-card rounded-xl border border-[var(--app-border)] p-6 text-sm text-slate-500 dark:text-slate-400">
                                                No active sessions found.
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                                <table className="min-w-full text-sm">
                                                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-medium">Member</th>
                                                            <th className="px-3 py-2 text-left font-medium">Role</th>
                                                            <th className="px-3 py-2 text-left font-medium">IP</th>
                                                            <th className="px-3 py-2 text-left font-medium">Last Seen</th>
                                                            {canManage && <th className="px-3 py-2 text-right font-medium">Action</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                                        {workspaceSessions.map((session) => (
                                                            <tr key={session.id} className="bg-white dark:bg-slate-950/20">
                                                                <td className="px-3 py-2 text-slate-900 dark:text-white">
                                                                    <div className="font-medium">
                                                                        {session.member?.user?.name
                                                                            || `${session.member?.user?.firstName || ''} ${session.member?.user?.lastName || ''}`.trim()
                                                                            || session.member?.user?.email
                                                                            || session.actorId}
                                                                    </div>
                                                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[280px]">
                                                                        {session.userAgent || 'Unknown device'}
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                                                    {session.member?.role ? displayRole(session.member.role) : '-'}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                                                    {session.ipAddress || '-'}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                                    {session.lastSeenAt
                                                                        ? new Date(session.lastSeenAt).toLocaleString()
                                                                        : new Date(session.issuedAt).toLocaleString()}
                                                                </td>
                                                                {canManage && (
                                                                    <td className="px-3 py-2 text-right">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRevokeSession(session.id)}
                                                                            disabled={revokingSessionId === session.id}
                                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                                                                        >
                                                                            {revokingSessionId === session.id ? (
                                                                                <>
                                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                                    Revoking
                                                                                </>
                                                                            ) : (
                                                                                'Revoke'
                                                                            )}
                                                                        </button>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Create API Key Modal */}
            {showCreateApiKeyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-6">
                        {createdKey ? (
                            // Success view - show the key
                            <>
                                <div className="text-center mb-6">
                                    <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                        API Key Created
                                    </h2>
                                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                                        Copy this key now. It will not be shown again!
                                    </p>
                                </div>
                                <div className="mb-6">
                                    <div className="relative">
                                        <input
                                            type={showKey ? 'text' : 'password'}
                                            value={createdKey}
                                            readOnly
                                            className="w-full px-4 py-3 pr-24 font-mono text-sm bg-slate-100 dark:bg-slate-800 rounded-lg"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                            <button
                                                onClick={() => setShowKey(!showKey)}
                                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                                            >
                                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(createdKey)}
                                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowCreateApiKeyModal(false);
                                        setCreatedKey(null);
                                        setShowKey(false);
                                    }}
                                    className="w-full px-4 py-2.5 btn-primary font-medium rounded-lg"
                                >
                                    Done
                                </button>
                            </>
                        ) : (
                            // Create form
                            <>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                                    Create API Key
                                </h2>
                                <div className="space-y-4 mb-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Key Name
                                        </label>
                                        <input
                                            type="text"
                                            value={newApiKeyName}
                                            onChange={(e) => setNewApiKeyName(e.target.value)}
                                            placeholder="e.g., Production API"
                                            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Scopes (Permissions)
                                        </label>
                                        <div className="space-y-2">
                                            {Object.entries(scopes).map(([key, scope]) => (
                                                <label
                                                    key={key}
                                                    className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedScopes.includes(key)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedScopes([...selectedScopes, key]);
                                                            } else {
                                                                setSelectedScopes(selectedScopes.filter(s => s !== key));
                                                            }
                                                        }}
                                                        className="mt-1"
                                                    />
                                                    <div>
                                                        <p className="font-medium text-slate-900 dark:text-white text-sm">
                                                            {scope.name}
                                                        </p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                            {scope.description}
                                                        </p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setShowCreateApiKeyModal(false);
                                            setNewApiKeyName('');
                                            setSelectedScopes([]);
                                        }}
                                        className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreateApiKey}
                                        disabled={apiKeyLimitReached || creating || !newApiKeyName.trim() || selectedScopes.length === 0}
                                        className="flex-1 px-4 py-2.5 btn-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {creating ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            'Create Key'
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                            Invite Team Member
                        </h2>
                        {inviteError && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <p className="text-sm text-red-700 dark:text-red-400">{inviteError}</p>
                            </div>
                        )}
                        {latestInviteLink && (
                            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                                <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-2">Invite link generated</p>
                                <div className="flex items-center gap-2">
                                    <input
                                        readOnly
                                        value={latestInviteLink}
                                        className="flex-1 px-2 py-1.5 text-xs rounded border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-slate-800"
                                    />
                                    <button
                                        onClick={() => copyToClipboard(latestInviteLink)}
                                        className="px-2 py-1.5 text-xs rounded border border-emerald-200 dark:border-emerald-700"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="space-y-4 mb-6">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                                    Invite by
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setInviteMethod('EMAIL')}
                                        className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                            inviteMethod === 'EMAIL'
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                                                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        Email
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInviteMethod('USER_ID')}
                                        className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                            inviteMethod === 'USER_ID'
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                                                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        User ID
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {inviteMethod === 'EMAIL' ? 'Email Address' : 'User ID'}
                                </label>
                                <input
                                    type={inviteMethod === 'EMAIL' ? 'email' : 'text'}
                                    value={inviteIdentifier}
                                    onChange={(e) => setInviteIdentifier(e.target.value)}
                                    placeholder={inviteMethod === 'EMAIL'
                                        ? 'teammate@example.com'
                                        : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {inviteMethod === 'EMAIL'
                                        ? 'Email must belong to an existing VeriLnk user.'
                                        : 'Use the exact user UUID.'}
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Role
                                </label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR')}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                >
                                    <option value="AUDITOR">Auditor</option>
                                    <option value="DEVELOPER">Developer</option>
                                    <option value="ANALYST">Analyst</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowInviteModal(false);
                                    setInviteMethod('EMAIL');
                                    setInviteIdentifier('');
                                    setInviteRole('AUDITOR');
                                    setInviteError(null);
                                    setLatestInviteLink(null);
                                }}
                                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateInvite}
                                disabled={memberLimitReached || creatingInvite || !inviteIdentifier.trim()}
                                className="flex-1 px-4 py-2.5 btn-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {creatingInvite ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    'Create Invite'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Request Existing Organization Modal */}
            {showRequestLinkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                            Request Existing Organization Link
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                                    Link method
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {LINK_REQUEST_METHOD_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => {
                                                setRequestLinkMethod(option.value);
                                                setRequestIdentifierError(null);
                                            }}
                                            className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                                requestLinkMethod === option.value
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                                                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <input
                                    type="text"
                                    value={requestIdentifier}
                                    onChange={(e) => {
                                        setRequestIdentifier(e.target.value);
                                        if (requestIdentifierError) setRequestIdentifierError(null);
                                    }}
                                    placeholder={selectedLinkMethod.placeholder}
                                    className={`w-full px-4 py-2.5 rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                        requestIdentifierError
                                            ? 'border-red-400 dark:border-red-500'
                                            : 'border-slate-300 dark:border-slate-700'
                                    }`}
                                />
                                {requestIdentifierError ? (
                                    <p className="text-xs text-red-500 mt-1">{requestIdentifierError}</p>
                                ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        {selectedLinkMethod.helper}
                                    </p>
                                )}
                            </div>
                            <textarea
                                value={requestMessage}
                                onChange={(e) => setRequestMessage(e.target.value)}
                                placeholder="Optional message to organization owner"
                                className="w-full px-4 py-2.5 h-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                The target organization must approve the request before linking.
                            </p>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowRequestLinkModal(false);
                                    setRequestLinkMethod('EMAIL');
                                    setRequestIdentifier('');
                                    setRequestIdentifierError(null);
                                    setRequestMessage('');
                                }}
                                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateLinkRequest}
                                disabled={linkedOrgLimitReached || linkingOrg || !requestIdentifier.trim()}
                                className="flex-1 px-4 py-2.5 btn-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {linkingOrg ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    'Create Request'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Organization Modal */}
            {showCreateOrgModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="surface-card rounded-xl border border-[var(--app-border)] p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-[var(--app-text-primary)] mb-4">
                            Create Organization
                        </h2>
                        <div className="space-y-4">
                            <div className="flex justify-center">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-full bg-[var(--app-surface-hover)] border-2 border-dashed border-[var(--app-border)] flex items-center justify-center overflow-hidden">
                                        {orgLogoPreviewUrl || orgUploadedLogoUrl || orgCreateForm.logo ? (
                                            <Image
                                                src={orgLogoPreviewUrl || orgUploadedLogoUrl || orgCreateForm.logo}
                                                alt="Organization logo preview"
                                                fill
                                                className="object-cover"
                                                sizes="96px"
                                            />
                                        ) : (
                                            <Building2 className="w-8 h-8 text-slate-400" />
                                        )}
                                        {uploadingOrgLogo && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                                            </div>
                                        )}
                                    </div>
                                    <label className="absolute bottom-0 right-0 btn-primary p-1.5 rounded-full cursor-pointer shadow-lg transition-colors">
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*,.svg"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                void handleOrgLogoUpload(file);
                                            }}
                                        />
                                        <span className="sr-only">Upload Logo</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                                    </label>
                                    {(orgLogoPreviewUrl || orgUploadedLogoUrl || orgCreateForm.logo) && (
                                        <button
                                            type="button"
                                            onClick={handleRemoveOrgLogo}
                                            className="absolute -top-2 -right-2 bg-[var(--app-surface)] text-[var(--app-text-primary)] border border-[var(--app-border)] p-1.5 rounded-full shadow hover:bg-[var(--app-surface-hover)] transition-colors"
                                            aria-label="Remove logo"
                                        >
                                            <XCircle className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {orgCreateErrors.logo && (
                                <p className="text-xs text-red-600 dark:text-red-400 text-center">{orgCreateErrors.logo}</p>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={createOrgModalLabelClass}>
                                        Org Type
                                    </label>
                                    <select
                                        value={orgCreateForm.type}
                                        onChange={(e) => handleOrgCreateFieldChange('type', e.target.value)}
                                        className={createOrgModalSelectClass}
                                    >
                                        <option value="PUBLIC">Public</option>
                                        <option value="PRIVATE">Private</option>
                                        <option value="NON_PROFIT">Non-profit</option>
                                    </select>
                                    {orgCreateErrors.type && (
                                        <p className={createOrgModalErrorClass}>{orgCreateErrors.type}</p>
                                    )}
                                </div>
                                <div>
                                    <label className={createOrgModalLabelClass}>
                                        Organization Name
                                    </label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.orgName}
                                        onChange={(e) => handleOrgCreateFieldChange('orgName', e.target.value)}
                                        placeholder="Acme Inc."
                                        className={createOrgModalInputClass}
                                    />
                                    {orgCreateErrors.orgName && (
                                        <p className={createOrgModalErrorClass}>{orgCreateErrors.orgName}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className={createOrgModalLabelClass}>
                                    Organization Email
                                </label>
                                <input
                                    type="email"
                                    value={orgCreateForm.email}
                                    onChange={(e) => handleOrgCreateFieldChange('email', e.target.value)}
                                    placeholder="contact@acme.com"
                                    className={createOrgModalInputClass}
                                />
                                {orgCreateErrors.email && (
                                    <p className={createOrgModalErrorClass}>{orgCreateErrors.email}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={createOrgModalLabelClass}>
                                        Website URL
                                    </label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.website}
                                        onChange={(e) => handleOrgCreateFieldChange('website', e.target.value)}
                                        placeholder="https://acme.com"
                                        className={createOrgModalInputClass}
                                    />
                                    {orgCreateErrors.website && (
                                        <p className={createOrgModalErrorClass}>{orgCreateErrors.website}</p>
                                    )}
                                </div>
                                <div>
                                    <label className={createOrgModalLabelClass}>
                                        Phone
                                    </label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.phone}
                                        onChange={(e) => handleOrgCreateFieldChange('phone', e.target.value)}
                                        placeholder="+1 234..."
                                        className={createOrgModalInputClass}
                                    />
                                    {orgCreateErrors.phone && (
                                        <p className={createOrgModalErrorClass}>{orgCreateErrors.phone}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className={createOrgModalLabelClass}>
                                    Country
                                </label>
                                <select
                                    value={orgCreateForm.countryId}
                                    onChange={(e) => {
                                        handleOrgCreateFieldChange('countryId', e.target.value);
                                        handleOrgCreateFieldChange('stateId', '');
                                    }}
                                    className={createOrgModalSelectClass}
                                >
                                    <option value="">Select Country</option>
                                    {orgCountries.map((country) => (
                                        <option key={country.id} value={country.id}>
                                            {country.name}
                                        </option>
                                    ))}
                                </select>
                                {orgCreateErrors.countryId && (
                                    <p className={createOrgModalErrorClass}>{orgCreateErrors.countryId}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={createOrgModalLabelClass}>
                                        State (Optional)
                                    </label>
                                    <select
                                        value={orgCreateForm.stateId}
                                        onChange={(e) => handleOrgCreateFieldChange('stateId', e.target.value)}
                                        disabled={!orgCreateForm.countryId || fetchingOrgStates}
                                        className={`${createOrgModalSelectClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        <option value="">Select State</option>
                                        {orgStates.map((state) => (
                                            <option key={state.id} value={state.id}>
                                                {state.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={createOrgModalLabelClass}>
                                        Category
                                    </label>
                                    <select
                                        value={orgCreateForm.categoryId}
                                        onChange={(e) => handleOrgCreateFieldChange('categoryId', e.target.value)}
                                        className={createOrgModalSelectClass}
                                    >
                                        <option value="">Select Category</option>
                                        {orgCategories.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                    {orgCreateErrors.categoryId && (
                                        <p className={createOrgModalErrorClass}>{orgCreateErrors.categoryId}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className={createOrgModalLabelClass}>
                                    About Organization
                                </label>
                                <textarea
                                    value={orgCreateForm.about}
                                    onChange={(e) => handleOrgCreateFieldChange('about', e.target.value)}
                                    placeholder="Brief description..."
                                    className={createOrgModalTextareaClass}
                                />
                            </div>

                            <div>
                                <label className={createOrgModalLabelClass}>
                                    Office Address
                                </label>
                                <input
                                    type="text"
                                    value={orgCreateForm.address}
                                    onChange={(e) => handleOrgCreateFieldChange('address', e.target.value)}
                                    placeholder="123 Main St..."
                                    className={createOrgModalInputClass}
                                />
                                {orgCreateErrors.address && (
                                    <p className={createOrgModalErrorClass}>{orgCreateErrors.address}</p>
                                )}
                            </div>

                            <div>
                                <label className={createOrgModalLabelClass}>
                                    Password
                                </label>
                                <div className="mt-1 relative">
                                    <input
                                        type={showOrgPassword ? 'text' : 'password'}
                                        value={orgCreateForm.password}
                                        onChange={(e) => handleOrgCreateFieldChange('password', e.target.value)}
                                        placeholder="Strong password"
                                        className={`${createOrgModalInputClass} pr-11`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOrgPassword((prev) => !prev)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] focus:outline-none"
                                    >
                                        {showOrgPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-[var(--app-text-secondary)] mt-1">
                                    Min 8 chars with uppercase, lowercase, number, and special character.
                                </p>
                                {orgCreateErrors.password && (
                                    <p className={createOrgModalErrorClass}>{orgCreateErrors.password}</p>
                                )}
                            </div>

                            <p className={createOrgModalHintClass}>
                                Organization will be created as pending and sent to Super Admin approval.
                            </p>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowCreateOrgModal(false);
                                    resetCreateOrgForm();
                                }}
                                className={createOrgModalSecondaryButtonClass}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateOrganization}
                                disabled={
                                    linkedOrgLimitReached ||
                                    creatingOrganization ||
                                    uploadingOrgLogo ||
                                    !orgCreateForm.orgName.trim() ||
                                    !orgCreateForm.email.trim() ||
                                    !orgCreateForm.password.trim() ||
                                    !orgCreateForm.website.trim() ||
                                    !orgCreateForm.phone.trim() ||
                                    !orgCreateForm.address.trim() ||
                                    !orgCreateForm.countryId ||
                                    !orgCreateForm.categoryId
                                }
                                className="flex-1 px-4 py-2.5 btn-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {creatingOrganization ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create Organization'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </>
    );
}
