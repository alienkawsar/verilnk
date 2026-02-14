'use client';

import { useState, useEffect, useMemo } from 'react';
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
    MoreVertical,
    RefreshCw,
    Eye,
    EyeOff,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Link2,
    Download,
    Globe,
    ExternalLink
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
    unlinkOrganization,
    removeMember,
    createWorkspaceInvite,
    revokeWorkspaceInvite,
    exportEnterpriseAnalytics,
    getEnterpriseAnalytics,
    getEnterpriseAnalyticsDaily,
    getEnterpriseAnalyticsSummary,
    getEnterpriseAnalyticsHeatmap,
    getEnterpriseAnalyticsCategories,
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
    type EnterpriseAnalyticsCategories
} from '@/lib/enterprise-api';
import { fetchCategories, fetchCountries, fetchStates, uploadPublicOrgLogo } from '@/lib/api';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '@/lib/validation';
import { useToast } from '@/components/ui/Toast';

type Tab = 'organizations' | 'members' | 'api-keys' | 'usage' | 'analytics';

const roleBadgeClass = (role: string) => {
    switch (role) {
        case 'OWNER':
            return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
        case 'ADMIN':
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
        case 'EDITOR':
            return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
        case 'ANALYST':
            return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
        default:
            return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
};

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
    const [requestIdentifier, setRequestIdentifier] = useState('');
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
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'ADMIN' | 'ANALYST' | 'EDITOR' | 'VIEWER'>('VIEWER');
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);

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
    const primaryLinkedOrganization = organizations[0]?.organization;
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

    useEffect(() => {
        loadWorkspace();
    }, [workspaceId]);

    useEffect(() => {
        if (requestedTab !== activeTab) {
            setActiveTab(requestedTab);
        }
    }, [requestedTab, activeTab]);

    useEffect(() => {
        if (workspace) {
            loadTabData(activeTab);
        }
    }, [activeTab, workspace]);

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
            await loadTabData(initialTab);
        } catch (err: any) {
            console.error('Error loading workspace:', err);
            setError(err.message || 'Failed to load workspace');
        } finally {
            setLoading(false);
        }
    };

    const loadTabData = async (tab: Tab) => {
        try {
            switch (tab) {
                case 'organizations': {
                    const [{ organizations: orgs }, { requests }] = await Promise.all([
                        getLinkedOrganizations(workspaceId),
                        getWorkspaceLinkRequests(workspaceId),
                    ]);
                    setOrganizations(orgs);
                    setLinkRequests(requests || []);
                    break;
                }
                case 'members': {
                    const [{ members: mems }, { invites: wsInvites }] = await Promise.all([
                        getWorkspaceMembers(workspaceId),
                        getWorkspaceInvites(workspaceId),
                    ]);
                    setMembers(mems);
                    setInvites(wsInvites);
                    break;
                }
                case 'api-keys':
                    const [{ apiKeys: keys }, { scopes: sc }] = await Promise.all([
                        getApiKeys(workspaceId),
                        getApiScopes()
                    ]);
                    setApiKeys(keys);
                    setScopes(sc);
                    break;
                case 'usage':
                    const [stats, { logs }] = await Promise.all([
                        getUsageStats(workspaceId, 30),
                        getUsageLogs(workspaceId, { limit: 50 })
                    ]);
                    setUsageStats(stats);
                    setUsageLogs(logs);
                    break;
                case 'analytics': {
                    const range = analyticsRange;
                    const [overview, summary, daily, heatmap, categories] = await Promise.all([
                        getEnterpriseAnalytics(workspaceId, `${range}d`),
                        getEnterpriseAnalyticsSummary(workspaceId, range),
                        getEnterpriseAnalyticsDaily(workspaceId, range),
                        getEnterpriseAnalyticsHeatmap(workspaceId, range),
                        getEnterpriseAnalyticsCategories(workspaceId, range),
                    ]);
                    setAnalytics(overview);
                    setAnalyticsSummary(summary);
                    setAnalyticsDaily(daily);
                    setAnalyticsHeatmap(heatmap);
                    setAnalyticsCategories(categories);
                    break;
                }
            }
        } catch (err: any) {
            console.error(`Error loading ${tab} data:`, err);
        }
    };

    const handleCreateApiKey = async () => {
        if (!newApiKeyName.trim() || selectedScopes.length === 0) return;
        if (apiKeyLimitReached) {
            showQuotaLimitToast('API Keys', quotaUsage?.apiKeys, quotaLimits?.maxApiKeys);
            return;
        }

        try {
            setCreating(true);
            const result = await createApiKey(workspaceId, newApiKeyName.trim(), selectedScopes);
            setCreatedKey(result.plainTextKey);
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
        if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return;

        try {
            await revokeApiKey(workspaceId, keyId);
            await loadTabData('api-keys');
        } catch (err: any) {
            setError(err.message || 'Failed to revoke API key');
        }
    };

    const handleRotateKey = async (keyId: string) => {
        if (!confirm('Rotate this key? The old key will stop working immediately.')) return;

        try {
            const result = await rotateApiKey(workspaceId, keyId);
            setCreatedKey(result.plainTextKey);
            await loadTabData('api-keys');
        } catch (err: any) {
            setError(err.message || 'Failed to rotate API key');
        }
    };

    const handleUnlinkOrg = async (orgId: string) => {
        if (!confirm('Unlink this organization from the workspace?')) return;

        try {
            await unlinkOrganization(workspaceId, orgId);
            await loadTabData('organizations');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            setError(err.message || 'Failed to unlink organization');
        }
    };

    const handleCreateLinkRequest = async () => {
        if (!requestIdentifier.trim()) return;
        if (linkedOrgLimitReached) {
            showQuotaLimitToast('Linked Organizations', quotaUsage?.linkedOrgs, quotaLimits?.maxLinkedOrgs);
            return;
        }
        try {
            setLinkingOrg(true);
            await requestWorkspaceLink(workspaceId, {
                identifier: requestIdentifier.trim(),
                message: requestMessage.trim() || undefined,
            });
            setShowRequestLinkModal(false);
            setRequestIdentifier('');
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
        if (!confirm('Cancel this link request?')) return;
        try {
            await cancelWorkspaceLinkRequest(requestId);
            await loadTabData('organizations');
        } catch (err: any) {
            setError(err.message || 'Failed to cancel link request');
        }
    };

    const handleCreateOrganization = async () => {
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
        if (!inviteEmail.trim()) return;
        if (memberLimitReached) {
            showQuotaLimitToast('Members', quotaUsage?.members, quotaLimits?.maxMembers);
            return;
        }

        try {
            setCreatingInvite(true);
            setInviteError(null);
            const result = await createWorkspaceInvite(workspaceId, inviteEmail.trim(), inviteRole);
            setLatestInviteLink(result.inviteLink);
            setInviteEmail('');
            await loadTabData('members');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            if (handleLimitError(err)) return;
            setInviteError(err.message || 'Failed to create invite');
        } finally {
            setCreatingInvite(false);
        }
    };

    const handleRevokeInvite = async (inviteId: string) => {
        if (!confirm('Revoke this invite?')) return;

        try {
            await revokeWorkspaceInvite(workspaceId, inviteId);
            await loadTabData('members');
            await refreshEnterpriseAccess();
        } catch (err: any) {
            setError(err.message || 'Failed to revoke invite');
        }
    };

    const handleRemoveMember = async (userId: string) => {
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

    const handleAnalyticsRangeChange = async (range: '7' | '30' | '90') => {
        setAnalyticsRange(range);
        try {
            const [overview, summary, daily, heatmap, categories] = await Promise.all([
                getEnterpriseAnalytics(workspaceId, `${range}d`),
                getEnterpriseAnalyticsSummary(workspaceId, range),
                getEnterpriseAnalyticsDaily(workspaceId, range),
                getEnterpriseAnalyticsHeatmap(workspaceId, range),
                getEnterpriseAnalyticsCategories(workspaceId, range),
            ]);
            setAnalytics(overview);
            setAnalyticsSummary(summary);
            setAnalyticsDaily(daily);
            setAnalyticsHeatmap(heatmap);
            setAnalyticsCategories(categories);
        } catch {
            setAnalytics(null);
            setAnalyticsSummary(null);
            setAnalyticsDaily(null);
            setAnalyticsHeatmap(null);
            setAnalyticsCategories(null);
        }
    };

    const handleTabChange = (tab: Tab) => {
        if (tab === activeTab) return;
        setActiveTab(tab);
        router.replace(`/enterprise/${workspaceId}?tab=${tab}`, { scroll: false });
    };

    const openLinkOrganizationModal = () => {
        if (linkedOrgLimitReached) {
            showQuotaLimitToast('Linked Organizations', quotaUsage?.linkedOrgs, quotaLimits?.maxLinkedOrgs);
            return;
        }
        setShowRequestLinkModal(true);
    };

    const canManage = ['OWNER', 'ADMIN'].includes(userRole);

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
                        <div className="surface-card rounded-2xl p-5 md:p-6 border border-[var(--app-border)] shadow-lg">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                                <button
                                    onClick={() => router.push('/enterprise')}
                                    className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 rounded-md px-1"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to Dashboard
                                </button>
                            </div>

                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                                <div className="flex items-start gap-4 min-w-0">
                                    <div className="w-16 h-16 md:w-[72px] md:h-[72px] rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 border-2 border-white/20">
                                        <Building2 className="w-7 h-7 md:w-8 md:h-8 text-white" />
                                    </div>
                                    <div className="min-w-0 space-y-2">
                                        <div className="flex items-center flex-wrap gap-2">
                                            <h1 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-white truncate">
                                                {workspace?.name}
                                            </h1>
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleBadgeClass(userRole)}`}>
                                                {userRole || 'MEMBER'}
                                            </span>
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${workspace?.status === 'ACTIVE'
                                                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                                                : workspace?.status === 'SUSPENDED'
                                                    ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                                                    : 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600/50'
                                                }`}>
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                {workspace?.status || 'ACTIVE'}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                                            <span className="inline-flex items-center gap-1.5">
                                                <Building2 className="w-3.5 h-3.5" />
                                                {workspaceOrgCount} orgs
                                            </span>
                                            <span className="inline-flex items-center gap-1.5">
                                                <Users className="w-3.5 h-3.5" />
                                                {workspaceMemberCount} members
                                            </span>
                                            <span className="inline-flex items-center gap-1.5">
                                                <Key className="w-3.5 h-3.5" />
                                                {workspaceApiKeyCount} API keys
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                            <Globe className="w-4 h-4" />
                                            {primaryLinkedOrganization ? (
                                                <Link
                                                    href={`/org/${primaryLinkedOrganization.slug || primaryLinkedOrganization.id}`}
                                                    target="_blank"
                                                    className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                >
                                                    {primaryLinkedOrganization.name}
                                                    <ExternalLink className="w-3 h-3" />
                                                </Link>
                                            ) : (
                                                <span>No linked website</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
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
                                {[
                                    { id: 'organizations', label: 'Organizations', icon: Building2 },
                                    { id: 'members', label: 'Members', icon: Users },
                                    { id: 'api-keys', label: 'API Keys', icon: Key },
                                    { id: 'usage', label: 'Usage', icon: BarChart3 },
                                    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                                ].map(({ id, label, icon: Icon }) => (
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
                            {/* Organizations Tab */}
                            {activeTab === 'organizations' && (
                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                            Linked Organizations
                                        </h2>
                                        {canManage && (
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
                                    {canManage && linkedOrgLimitReached && (
                                        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
                                            Limit reached: Linked Organizations ({quotaUsage?.linkedOrgs ?? 0}/{quotaLimits?.maxLinkedOrgs ?? 0})
                                        </p>
                                    )}

                                    {organizations.length === 0 ? (
                                        <div className="py-12 text-center">
                                            <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                            <p className="text-slate-600 dark:text-slate-400">
                                                No linked organizations yet
                                            </p>
                                            {canManage && (
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
                                            {canManage && linkedOrgLimitReached && (
                                                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                                                    Limit reached: Linked Organizations ({quotaUsage?.linkedOrgs ?? 0}/{quotaLimits?.maxLinkedOrgs ?? 0})
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {organizations.map((link) => (
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
                                                    {canManage && (
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
                                        {linkRequests.length === 0 ? (
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                No link requests yet.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {linkRequests.map((request) => (
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
                                                        {canManage &&
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
                                                    setInviteError(null);
                                                }}
                                                disabled={memberLimitReached}
                                                className="inline-flex items-center gap-2 px-4 py-2 btn-primary text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Invite Member
                                            </button>
                                        )}
                                    </div>
                                    {canManage && memberLimitReached && (
                                        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
                                            Limit reached: Members ({quotaUsage?.members ?? 0}/{quotaLimits?.maxMembers ?? 0})
                                        </p>
                                    )}

                                    {members.length === 0 ? (
                                        <div className="py-12 text-center">
                                            <Users className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                            <p className="text-slate-600 dark:text-slate-400">
                                                No members yet
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {members.map((member) => (
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
                                                        <span className={`px-2.5 py-1 text-xs font-medium rounded ${member.role === 'OWNER'
                                                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                                            : member.role === 'ADMIN'
                                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                                                : 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400'
                                                            }`}>
                                                            {member.role}
                                                        </span>
                                                        {canManage && member.role !== 'OWNER' && (
                                                            <button
                                                                onClick={() => handleRemoveMember(member.userId)}
                                                                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                                                title="Remove member"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="mt-8">
                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                                            Pending & Recent Invites
                                        </h3>
                                        {invites.length === 0 ? (
                                            <p className="text-sm text-slate-500 dark:text-slate-400">No invites yet.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {invites.map((invite) => (
                                                    <div key={invite.id} className="surface-card rounded-lg p-3 flex items-center justify-between">
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                                {invite.invitedEmail || invite.invitedUserId}
                                                            </p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                {invite.role} • {invite.status} • Expires {new Date(invite.expiresAt).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                        {canManage && invite.status === 'PENDING' && (
                                                            <button
                                                                onClick={() => handleRevokeInvite(invite.id)}
                                                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
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
                                        {canManage && (
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
                                    {canManage && apiKeyLimitReached && (
                                        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
                                            Limit reached: API Keys ({quotaUsage?.apiKeys ?? 0}/{quotaLimits?.maxApiKeys ?? 0})
                                        </p>
                                    )}

                                    {apiKeys.length === 0 ? (
                                        <div className="py-12 text-center">
                                            <Key className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                            <p className="text-slate-600 dark:text-slate-400">
                                                No API keys created yet
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {apiKeys.map((key) => (
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
                                                        {!key.isRevoked && canManage && (
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => handleRotateKey(key.id)}
                                                                    className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                                                    title="Rotate"
                                                                >
                                                                    <RefreshCw className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRevokeKey(key.id)}
                                                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                                                    title="Revoke"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
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
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">
                                        API Usage (Last 30 Days)
                                    </h2>

                                    {usageStats && (
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
                                            ) : (
                                                <div className="space-y-2">
                                                    {usageLogs.slice(0, 10).map((log) => (
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
                                            <button
                                                onClick={() => exportEnterpriseAnalytics(workspaceId, 'csv', analyticsRange).catch((err) => setError(err.message || 'Failed to export CSV'))}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--app-border)] rounded-lg"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                CSV
                                            </button>
                                            <button
                                                onClick={() => exportEnterpriseAnalytics(workspaceId, 'pdf', analyticsRange).catch((err) => setError(err.message || 'Failed to export PDF'))}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--app-border)] rounded-lg"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                PDF
                                            </button>
                                        </div>
                                    </div>

                                    {organizations.length === 0 ? (
                                        <div className="py-12 text-center">
                                            <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                            <p className="text-slate-700 dark:text-slate-300 mb-2">
                                                No linked organizations yet
                                            </p>
                                            {canManage && (
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
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="teammate@example.com"
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Role
                                </label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value as any)}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                >
                                    <option value="VIEWER">Viewer</option>
                                    <option value="EDITOR">Editor</option>
                                    <option value="ANALYST">Analyst</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowInviteModal(false);
                                    setInviteEmail('');
                                    setInviteRole('VIEWER');
                                    setInviteError(null);
                                    setLatestInviteLink(null);
                                }}
                                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateInvite}
                                disabled={memberLimitReached || creatingInvite || !inviteEmail.trim()}
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
                            <input
                                type="text"
                                value={requestIdentifier}
                                onChange={(e) => setRequestIdentifier(e.target.value)}
                                placeholder="Enter org website, org login email, or public slug"
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
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
                                    setRequestIdentifier('');
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
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                            Create Organization
                        </h2>
                        <div className="space-y-4">
                            <div className="flex justify-center">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden">
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
                                            className="absolute -top-2 -right-2 bg-slate-900/80 text-white p-1.5 rounded-full shadow hover:bg-slate-900 transition-colors"
                                            aria-label="Remove logo"
                                        >
                                            <XCircle className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {orgCreateErrors.logo && (
                                <p className="text-xs text-red-500 text-center">{orgCreateErrors.logo}</p>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Org Type
                                    </label>
                                    <select
                                        value={orgCreateForm.type}
                                        onChange={(e) => handleOrgCreateFieldChange('type', e.target.value)}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    >
                                        <option value="PUBLIC">Public</option>
                                        <option value="PRIVATE">Private</option>
                                        <option value="NON_PROFIT">Non-profit</option>
                                    </select>
                                    {orgCreateErrors.type && (
                                        <p className="text-xs text-red-500 mt-1">{orgCreateErrors.type}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Organization Name
                                    </label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.orgName}
                                        onChange={(e) => handleOrgCreateFieldChange('orgName', e.target.value)}
                                        placeholder="Acme Inc."
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    />
                                    {orgCreateErrors.orgName && (
                                        <p className="text-xs text-red-500 mt-1">{orgCreateErrors.orgName}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    Organization Email
                                </label>
                                <input
                                    type="email"
                                    value={orgCreateForm.email}
                                    onChange={(e) => handleOrgCreateFieldChange('email', e.target.value)}
                                    placeholder="contact@acme.com"
                                    className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                                {orgCreateErrors.email && (
                                    <p className="text-xs text-red-500 mt-1">{orgCreateErrors.email}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Website URL
                                    </label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.website}
                                        onChange={(e) => handleOrgCreateFieldChange('website', e.target.value)}
                                        placeholder="https://acme.com"
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    />
                                    {orgCreateErrors.website && (
                                        <p className="text-xs text-red-500 mt-1">{orgCreateErrors.website}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Phone
                                    </label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.phone}
                                        onChange={(e) => handleOrgCreateFieldChange('phone', e.target.value)}
                                        placeholder="+1 234..."
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    />
                                    {orgCreateErrors.phone && (
                                        <p className="text-xs text-red-500 mt-1">{orgCreateErrors.phone}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    Country
                                </label>
                                <select
                                    value={orgCreateForm.countryId}
                                    onChange={(e) => {
                                        handleOrgCreateFieldChange('countryId', e.target.value);
                                        handleOrgCreateFieldChange('stateId', '');
                                    }}
                                    className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                >
                                    <option value="">Select Country</option>
                                    {orgCountries.map((country) => (
                                        <option key={country.id} value={country.id}>
                                            {country.name}
                                        </option>
                                    ))}
                                </select>
                                {orgCreateErrors.countryId && (
                                    <p className="text-xs text-red-500 mt-1">{orgCreateErrors.countryId}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        State (Optional)
                                    </label>
                                    <select
                                        value={orgCreateForm.stateId}
                                        onChange={(e) => handleOrgCreateFieldChange('stateId', e.target.value)}
                                        disabled={!orgCreateForm.countryId || fetchingOrgStates}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-50"
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
                                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Category
                                    </label>
                                    <select
                                        value={orgCreateForm.categoryId}
                                        onChange={(e) => handleOrgCreateFieldChange('categoryId', e.target.value)}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    >
                                        <option value="">Select Category</option>
                                        {orgCategories.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                    {orgCreateErrors.categoryId && (
                                        <p className="text-xs text-red-500 mt-1">{orgCreateErrors.categoryId}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    About Organization
                                </label>
                                <textarea
                                    value={orgCreateForm.about}
                                    onChange={(e) => handleOrgCreateFieldChange('about', e.target.value)}
                                    placeholder="Brief description..."
                                    className="mt-1 w-full px-4 py-2.5 h-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    Office Address
                                </label>
                                <input
                                    type="text"
                                    value={orgCreateForm.address}
                                    onChange={(e) => handleOrgCreateFieldChange('address', e.target.value)}
                                    placeholder="123 Main St..."
                                    className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                                {orgCreateErrors.address && (
                                    <p className="text-xs text-red-500 mt-1">{orgCreateErrors.address}</p>
                                )}
                            </div>

                            <div>
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    Password
                                </label>
                                <div className="mt-1 relative">
                                    <input
                                        type={showOrgPassword ? 'text' : 'password'}
                                        value={orgCreateForm.password}
                                        onChange={(e) => handleOrgCreateFieldChange('password', e.target.value)}
                                        placeholder="Strong password"
                                        className="w-full px-4 py-2.5 pr-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOrgPassword((prev) => !prev)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                                    >
                                        {showOrgPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                    Min 8 chars with uppercase, lowercase, number, and special character.
                                </p>
                                {orgCreateErrors.password && (
                                    <p className="text-xs text-red-500 mt-1">{orgCreateErrors.password}</p>
                                )}
                            </div>

                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Organization will be created as pending and sent to Super Admin approval.
                            </p>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowCreateOrgModal(false);
                                    resetCreateOrgForm();
                                }}
                                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
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
