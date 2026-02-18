'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    Activity,
    ArrowLeft,
    Building2,
    Clock,
    Key,
    Loader2,
    Plus,
    Settings,
    ShieldAlert,
    Trash2,
    Users
} from 'lucide-react';
import {
    AdminEnterpriseDetailResponse,
    AdminWorkspace,
    AdminUsageLog,
    createAdminEnterpriseApiKey,
    createAdminEnterpriseWorkspace,
    deleteAdminWorkspace,
    fetchAdminEnterpriseDetail,
    fetchAdminEnterpriseUsage,
    fetchAdminEnterpriseWorkspaces,
    revokeAdminWorkspaceApiKey,
    updateAdminEnterpriseRateLimits
} from '@/lib/admin-enterprise-api';
import { TableSkeleton } from '@/components/ui/Loading';
import { useToast } from '@/components/ui/Toast';

type DetailTab = 'overview' | 'workspaces' | 'apikeys' | 'rate-limits' | 'members' | 'usage';

const DEFAULT_SCOPES = ['read:verify', 'read:directory'];
const WORKSPACE_PAGE_SIZE = 15;
const USAGE_LOG_PAGE_SIZE = 30;
const MIN_RATE_LIMIT_RPM = 1;
const MAX_RATE_LIMIT_RPM = 1_000_000;

export default function AdminEnterpriseDetailPage() {
    const params = useParams<{ orgId: string }>();
    const router = useRouter();
    const { showToast } = useToast();
    const orgId = params.orgId;

    const [tab, setTab] = useState<DetailTab>('overview');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [detail, setDetail] = useState<AdminEnterpriseDetailResponse | null>(null);

    const [workspaceSearch, setWorkspaceSearch] = useState('');
    const [workspacePage, setWorkspacePage] = useState(1);
    const [workspaceRows, setWorkspaceRows] = useState<AdminWorkspace[]>([]);
    const [workspaceTotalPages, setWorkspaceTotalPages] = useState(1);
    const [workspaceLoading, setWorkspaceLoading] = useState(false);
    const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);

    const [usageRange, setUsageRange] = useState<7 | 30>(30);
    const [usagePage, setUsagePage] = useState(1);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageTotals, setUsageTotals] = useState<{ requestsInRange: number; requests7d: number; requests30d: number }>({
        requestsInRange: 0,
        requests7d: 0,
        requests30d: 0
    });
    const [usageDaily, setUsageDaily] = useState<Array<{ date: string; count: number }>>([]);
    const [usageLogs, setUsageLogs] = useState<AdminUsageLog[]>([]);
    const [usageLogTotal, setUsageLogTotal] = useState(0);

    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyWorkspaceId, setNewKeyWorkspaceId] = useState('');
    const [rateWorkspaceId, setRateWorkspaceId] = useState('');
    const [rateWorkspaceValue, setRateWorkspaceValue] = useState('');
    const [rateKeyId, setRateKeyId] = useState('');
    const [rateKeyValue, setRateKeyValue] = useState('');
    const [defaultRateValue, setDefaultRateValue] = useState('');

    const loadEnterpriseDetail = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const data = await fetchAdminEnterpriseDetail(orgId);
            setDetail(data);
            setWorkspaceRows(data.workspaces || []);
            setDefaultRateValue(String(data.rateLimits.defaultRpm));
            if (!newKeyWorkspaceId && data.workspaces.length > 0) {
                setNewKeyWorkspaceId(data.workspaces[0].id);
            }
            if (!rateWorkspaceId && data.workspaces.length > 0) {
                setRateWorkspaceId(data.workspaces[0].id);
            }
            if (!rateKeyId && data.apiKeys.length > 0) {
                setRateKeyId(data.apiKeys[0].id);
            }
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to load enterprise details', 'error');
        } finally {
            setLoading(false);
        }
    }, [orgId, showToast, newKeyWorkspaceId, rateWorkspaceId, rateKeyId]);

    const loadWorkspaces = useCallback(async () => {
        if (!orgId) return;
        setWorkspaceLoading(true);
        try {
            const response = await fetchAdminEnterpriseWorkspaces(orgId, {
                search: workspaceSearch || undefined,
                page: workspacePage,
                limit: WORKSPACE_PAGE_SIZE
            });
            setWorkspaceRows(response.workspaces);
            setWorkspaceTotalPages(response.pagination.totalPages || 1);
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to load workspaces', 'error');
        } finally {
            setWorkspaceLoading(false);
        }
    }, [orgId, workspacePage, workspaceSearch, showToast]);

    const loadUsage = useCallback(async () => {
        if (!orgId) return;
        setUsageLoading(true);
        try {
            const response = await fetchAdminEnterpriseUsage(orgId, {
                range: usageRange,
                limit: USAGE_LOG_PAGE_SIZE,
                offset: (usagePage - 1) * USAGE_LOG_PAGE_SIZE
            });
            setUsageTotals(response.totals);
            setUsageDaily(response.daily);
            setUsageLogs(response.logs);
            setUsageLogTotal(response.pagination.total);
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to load usage data', 'error');
        } finally {
            setUsageLoading(false);
        }
    }, [orgId, showToast, usageRange, usagePage]);

    useEffect(() => {
        loadEnterpriseDetail();
    }, [loadEnterpriseDetail]);

    useEffect(() => {
        if (tab === 'workspaces') {
            loadWorkspaces();
        }
    }, [tab, loadWorkspaces]);

    useEffect(() => {
        if (tab === 'usage') {
            loadUsage();
        }
    }, [tab, loadUsage]);

    const selectedKeyWorkspaceId = useMemo(() => {
        const found = detail?.apiKeys.find((item) => item.id === rateKeyId);
        return found?.workspaceId || '';
    }, [detail?.apiKeys, rateKeyId]);

    const handleCreateWorkspace = async () => {
        if (!orgId) return;
        const name = window.prompt('Workspace name');
        if (!name || name.trim().length < 2) return;
        const ownerEmail = window.prompt('Owner email');
        if (!ownerEmail || !ownerEmail.includes('@')) {
            showToast('Owner email is required', 'error');
            return;
        }

        setSubmitting(true);
        try {
            await createAdminEnterpriseWorkspace(orgId, {
                name: name.trim(),
                ownerEmail: ownerEmail.trim()
            });
            showToast('Workspace created', 'success');
            await Promise.all([loadEnterpriseDetail(), loadWorkspaces()]);
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to create workspace', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteWorkspace = async (workspace: AdminWorkspace) => {
        const confirmed = window.confirm(
            `Delete workspace "${workspace.name}"?\n\nThis will unlink members and organizations and remove workspace resources. This action cannot be undone.`
        );
        if (!confirmed) return;

        setDeletingWorkspaceId(workspace.id);
        try {
            await deleteAdminWorkspace(workspace.id);
            showToast('Workspace deleted', 'success');

            setWorkspaceRows((prev) => prev.filter((row) => row.id !== workspace.id));
            setDetail((prev) => {
                if (!prev) return prev;
                const remainingWorkspaces = prev.workspaces.filter((row) => row.id !== workspace.id);
                return {
                    ...prev,
                    workspaces: remainingWorkspaces,
                    apiKeys: prev.apiKeys.filter((key) => key.workspaceId !== workspace.id),
                    members: prev.members.filter((member) => member.workspaceId !== workspace.id),
                    stats: {
                        ...prev.stats,
                        workspaceCount: Math.max(0, prev.stats.workspaceCount - 1),
                        apiKeyCount: Math.max(0, prev.stats.apiKeyCount - (workspace.apiKeyCount || 0)),
                        memberCount: Math.max(0, prev.stats.memberCount - (workspace.memberCount || 0)),
                        linkedOrganizationCount: Math.max(0, prev.stats.linkedOrganizationCount - (workspace.orgCount || 0)),
                    }
                };
            });

            setNewKeyWorkspaceId((prev) => (prev === workspace.id ? '' : prev));
            setRateWorkspaceId((prev) => (prev === workspace.id ? '' : prev));
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to delete workspace', 'error');
        } finally {
            setDeletingWorkspaceId(null);
        }
    };

    const handleCreateKey = async () => {
        if (!orgId) return;
        if (!newKeyWorkspaceId) {
            showToast('Select a workspace first', 'error');
            return;
        }
        if (!newKeyName || newKeyName.trim().length < 2) {
            showToast('Key name must be at least 2 characters', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const response = await createAdminEnterpriseApiKey(orgId, {
                workspaceId: newKeyWorkspaceId,
                name: newKeyName.trim(),
                scopes: DEFAULT_SCOPES
            });
            await navigator.clipboard.writeText(response.plainTextKey);
            showToast('API key created and copied to clipboard', 'success');
            setNewKeyName('');
            await loadEnterpriseDetail();
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to create API key', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevokeKey = async (workspaceId: string, keyId: string) => {
        setSubmitting(true);
        try {
            await revokeAdminWorkspaceApiKey(workspaceId, keyId);
            showToast('API key revoked', 'success');
            await loadEnterpriseDetail();
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to revoke API key', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const parseRateInput = (value: string): number | null => {
        const normalized = value.trim();
        if (!normalized) return null;
        const parsed = Number(normalized);
        if (
            !Number.isInteger(parsed)
            || parsed < MIN_RATE_LIMIT_RPM
            || parsed > MAX_RATE_LIMIT_RPM
        ) {
            throw new Error(`Rate must be an integer between ${MIN_RATE_LIMIT_RPM} and ${MAX_RATE_LIMIT_RPM}`);
        }
        return parsed;
    };

    const applyDefaultRate = async () => {
        if (!orgId) return;
        setSubmitting(true);
        try {
            const parsed = parseRateInput(defaultRateValue);
            await updateAdminEnterpriseRateLimits(orgId, {
                defaultApiRateLimitRpm: parsed
            });
            showToast('Default rate applied across enterprise workspaces', 'success');
            await loadEnterpriseDetail();
        } catch (error: any) {
            showToast(error?.message || error?.response?.data?.message || 'Failed to update default rate', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const applyWorkspaceRate = async () => {
        if (!orgId || !rateWorkspaceId) return;
        setSubmitting(true);
        try {
            const parsed = parseRateInput(rateWorkspaceValue);
            await updateAdminEnterpriseRateLimits(orgId, {
                workspaceOverrides: [{ workspaceId: rateWorkspaceId, apiRateLimitRpm: parsed }]
            });
            showToast('Workspace override updated', 'success');
            await loadEnterpriseDetail();
        } catch (error: any) {
            showToast(error?.message || error?.response?.data?.message || 'Failed to update workspace rate', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const applyKeyRate = async () => {
        if (!orgId || !rateKeyId || !selectedKeyWorkspaceId) return;
        setSubmitting(true);
        try {
            const parsed = parseRateInput(rateKeyValue);
            await updateAdminEnterpriseRateLimits(orgId, {
                keyOverrides: [{ workspaceId: selectedKeyWorkspaceId, keyId: rateKeyId, rateLimitRpm: parsed }]
            });
            showToast('API key override updated', 'success');
            await loadEnterpriseDetail();
        } catch (error: any) {
            showToast(error?.message || error?.response?.data?.message || 'Failed to update key rate', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading || !detail) {
        return (
            <div className="p-6 space-y-4">
                <TableSkeleton rows={8} cols={4} />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => router.push('/admin/enterprise')}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">{detail.enterprise.name}</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{detail.enterprise.website}</p>
                    </div>
                </div>
                <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        detail.enterprise.accessStatus === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-red-500/10 text-red-500'
                    }`}
                >
                    {detail.enterprise.accessStatus}
                </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
                <StatCard icon={Building2} label="Workspaces" value={detail.stats.workspaceCount} />
                <StatCard icon={Users} label="Members" value={detail.stats.memberCount} />
                <StatCard icon={Key} label="API Keys" value={detail.stats.apiKeyCount} />
                <StatCard icon={Activity} label="Requests 7d" value={detail.stats.requests7d} />
                <StatCard icon={Clock} label="Requests 30d" value={detail.stats.requests30d} />
                <StatCard icon={Settings} label="Default RPM" value={detail.rateLimits.defaultRpm} />
            </div>

            <div className="flex flex-wrap gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
                {([
                    ['overview', 'Overview'],
                    ['workspaces', 'Workspaces'],
                    ['apikeys', 'API Keys'],
                    ['rate-limits', 'Rate Limits'],
                    ['members', 'Members'],
                    ['usage', 'Usage']
                ] as Array<[DetailTab, string]>).map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            tab === id
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'overview' && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-xl border-[var(--app-border)] surface-card overflow-hidden">
                        <div className="px-4 py-3 text-sm font-semibold bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300">
                            Recent API usage
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400">
                                        <th className="px-4 py-2 font-semibold">Workspace</th>
                                        <th className="px-4 py-2 font-semibold">Key</th>
                                        <th className="px-4 py-2 font-semibold">Endpoint</th>
                                        <th className="px-4 py-2 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {detail.recentUsage.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                                                No API usage logs found
                                            </td>
                                        </tr>
                                    ) : (
                                        detail.recentUsage.map((log) => (
                                            <tr key={log.id}>
                                                <td className="px-4 py-2">{log.workspaceName || log.workspaceId}</td>
                                                <td className="px-4 py-2">{log.apiKeyName}</td>
                                                <td className="px-4 py-2 font-mono">{log.endpoint}</td>
                                                <td className="px-4 py-2">{log.statusCode}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-xl border-[var(--app-border)] surface-card overflow-hidden">
                        <div className="px-4 py-3 text-sm font-semibold bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300">
                            Compliance events
                        </div>
                        <div className="divide-y divide-slate-200 dark:divide-slate-700">
                            {detail.complianceEvents.length === 0 ? (
                                <div className="px-4 py-6 text-center text-sm text-slate-400">No compliance events found</div>
                            ) : (
                                detail.complianceEvents.map((event) => (
                                    <div key={event.id} className="px-4 py-3 flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{event.type}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {new Date(event.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
                                            {event.severity}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {tab === 'workspaces' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                        <input
                            type="text"
                            placeholder="Search workspaces..."
                            value={workspaceSearch}
                            onChange={(event) => {
                                setWorkspaceSearch(event.target.value);
                                setWorkspacePage(1);
                            }}
                            className="w-full sm:w-72 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <button
                            onClick={handleCreateWorkspace}
                            disabled={submitting}
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                        >
                            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Create Workspace
                        </button>
                    </div>

                    {workspaceLoading ? (
                        <TableSkeleton rows={5} cols={5} />
                    ) : workspaceRows.length === 0 ? (
                        <div className="rounded-xl border-[var(--app-border)] surface-card p-8 text-center text-slate-500 dark:text-slate-400">
                            <p className="font-medium mb-2">No workspaces yet</p>
                            <button
                                onClick={handleCreateWorkspace}
                                className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                            >
                                Create Workspace
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border-[var(--app-border)] surface-card">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-left">
                                        <th className="px-4 py-3 font-semibold">Workspace</th>
                                        <th className="px-4 py-3 font-semibold">Owner</th>
                                        <th className="px-4 py-3 font-semibold text-center">Members</th>
                                        <th className="px-4 py-3 font-semibold text-center">API Keys</th>
                                        <th className="px-4 py-3 font-semibold">Status</th>
                                        <th className="px-4 py-3 font-semibold"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {workspaceRows.map((workspace) => (
                                        <tr key={workspace.id}>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-900 dark:text-white">{workspace.name}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                                    Created {new Date(workspace.createdAt).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                                {workspace.owner?.name || workspace.owner?.email}
                                            </td>
                                            <td className="px-4 py-3 text-center">{workspace.memberCount}</td>
                                            <td className="px-4 py-3 text-center">{workspace.apiKeyCount}</td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 rounded-full text-xs bg-slate-500/10 text-slate-500">
                                                    {workspace.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Link
                                                        href={`/admin/enterprise/${orgId}/workspaces/${workspace.id}`}
                                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        Open Workspace
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteWorkspace(workspace)}
                                                        disabled={deletingWorkspaceId === workspace.id}
                                                        title="Delete workspace"
                                                        aria-label="Delete workspace"
                                                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {deletingWorkspaceId === workspace.id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {workspaceTotalPages > 1 && (
                        <div className="flex items-center justify-center gap-2">
                            <button
                                onClick={() => setWorkspacePage((value) => Math.max(1, value - 1))}
                                disabled={workspacePage <= 1}
                                className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <span className="text-xs text-slate-500">
                                Page {workspacePage} of {workspaceTotalPages}
                            </span>
                            <button
                                onClick={() => setWorkspacePage((value) => Math.min(workspaceTotalPages, value + 1))}
                                disabled={workspacePage >= workspaceTotalPages}
                                className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            {tab === 'apikeys' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <select
                            value={newKeyWorkspaceId}
                            onChange={(event) => setNewKeyWorkspaceId(event.target.value)}
                            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                            <option value="">Select workspace</option>
                            {detail.workspaces.map((workspace) => (
                                <option key={workspace.id} value={workspace.id}>
                                    {workspace.name}
                                </option>
                            ))}
                        </select>
                        <input
                            value={newKeyName}
                            onChange={(event) => setNewKeyName(event.target.value)}
                            placeholder="API key name"
                            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <div className="md:col-span-2">
                            <button
                                onClick={handleCreateKey}
                                disabled={submitting}
                                className="w-full md:w-auto inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                            >
                                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                Create Key for Workspace
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border-[var(--app-border)] surface-card">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-left">
                                    <th className="px-4 py-3 font-semibold">Workspace</th>
                                    <th className="px-4 py-3 font-semibold">Key</th>
                                    <th className="px-4 py-3 font-semibold">Scopes</th>
                                    <th className="px-4 py-3 font-semibold">Rate</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                    <th className="px-4 py-3 font-semibold"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {detail.apiKeys.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                                            No API keys found
                                        </td>
                                    </tr>
                                ) : (
                                    detail.apiKeys.map((key) => (
                                        <tr key={key.id}>
                                            <td className="px-4 py-3">{key.workspaceName || key.workspaceId}</td>
                                            <td className="px-4 py-3">
                                                <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{key.prefix}...</code>
                                                <div className="text-xs text-slate-500 mt-1">{key.name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs">{key.scopes.join(', ')}</td>
                                            <td className="px-4 py-3 text-xs">{key.rateLimitRpm ?? 'default'}</td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-xs ${
                                                        key.isRevoked ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                                    }`}
                                                >
                                                    {key.isRevoked ? 'Revoked' : 'Active'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {!key.isRevoked ? (
                                                    <button
                                                        onClick={() => handleRevokeKey(key.workspaceId, key.id)}
                                                        className="text-xs text-red-500 hover:underline"
                                                    >
                                                        Revoke
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'rate-limits' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="rounded-xl border-[var(--app-border)] surface-card p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Default Enterprise Limit</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Applies to all linked workspaces in this enterprise.
                        </p>
                        <input
                            type="number"
                            min={MIN_RATE_LIMIT_RPM}
                            max={MAX_RATE_LIMIT_RPM}
                            value={defaultRateValue}
                            onChange={(event) => setDefaultRateValue(event.target.value)}
                            placeholder={`Current default: ${detail.rateLimits.defaultRpm}`}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <button
                            onClick={applyDefaultRate}
                            disabled={submitting}
                            className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                        >
                            Apply Default
                        </button>
                    </div>

                    <div className="rounded-xl border-[var(--app-border)] surface-card p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Workspace Override</h3>
                        <select
                            value={rateWorkspaceId}
                            onChange={(event) => setRateWorkspaceId(event.target.value)}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                            <option value="">Select workspace</option>
                            {detail.workspaces.map((workspace) => (
                                <option key={workspace.id} value={workspace.id}>
                                    {workspace.name}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            min={MIN_RATE_LIMIT_RPM}
                            max={MAX_RATE_LIMIT_RPM}
                            value={rateWorkspaceValue}
                            onChange={(event) => setRateWorkspaceValue(event.target.value)}
                            placeholder="req/min (empty clears)"
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <button
                            onClick={applyWorkspaceRate}
                            disabled={submitting || !rateWorkspaceId}
                            className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                        >
                            Save Workspace Override
                        </button>
                    </div>

                    <div className="rounded-xl border-[var(--app-border)] surface-card p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">API Key Override</h3>
                        <select
                            value={rateKeyId}
                            onChange={(event) => setRateKeyId(event.target.value)}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                            <option value="">Select API key</option>
                            {detail.apiKeys.map((key) => (
                                <option key={key.id} value={key.id}>
                                    {(key.workspaceName || key.workspaceId)} / {key.name}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            min={MIN_RATE_LIMIT_RPM}
                            max={MAX_RATE_LIMIT_RPM}
                            value={rateKeyValue}
                            onChange={(event) => setRateKeyValue(event.target.value)}
                            placeholder="req/min (empty clears)"
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <button
                            onClick={applyKeyRate}
                            disabled={submitting || !rateKeyId}
                            className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                        >
                            Save Key Override
                        </button>
                    </div>
                </div>
            )}

            {tab === 'members' && (
                <div className="overflow-x-auto rounded-xl border-[var(--app-border)] surface-card">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-left">
                                <th className="px-4 py-3 font-semibold">User</th>
                                <th className="px-4 py-3 font-semibold">Email</th>
                                <th className="px-4 py-3 font-semibold">Workspace</th>
                                <th className="px-4 py-3 font-semibold">Role</th>
                                <th className="px-4 py-3 font-semibold">Joined</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {detail.members.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                                        No members found
                                    </td>
                                </tr>
                            ) : (
                                detail.members.map((member) => (
                                    <tr key={member.id}>
                                        <td className="px-4 py-3">{member.user?.name || member.userId}</td>
                                        <td className="px-4 py-3">{member.user?.email || '--'}</td>
                                        <td className="px-4 py-3">{member.workspaceName || member.workspaceId || '--'}</td>
                                        <td className="px-4 py-3">{member.role}</td>
                                        <td className="px-4 py-3">{new Date(member.joinedAt).toLocaleDateString()}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'usage' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                setUsageRange(7);
                                setUsagePage(1);
                            }}
                            className={`px-3 py-1.5 text-xs rounded-lg ${usageRange === 7 ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                        >
                            7 days
                        </button>
                        <button
                            onClick={() => {
                                setUsageRange(30);
                                setUsagePage(1);
                            }}
                            className={`px-3 py-1.5 text-xs rounded-lg ${usageRange === 30 ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                        >
                            30 days
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <MetricBox label={`Requests (${usageRange}d)`} value={usageTotals.requestsInRange} />
                        <MetricBox label="Requests (7d)" value={usageTotals.requests7d} />
                        <MetricBox label="Requests (30d)" value={usageTotals.requests30d} />
                    </div>

                    <div className="rounded-xl border-[var(--app-border)] surface-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-left">
                                    <th className="px-4 py-3 font-semibold">Date</th>
                                    <th className="px-4 py-3 font-semibold text-right">Requests</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {usageDaily.length === 0 ? (
                                    <tr>
                                        <td colSpan={2} className="px-4 py-6 text-center text-slate-400">
                                            No API usage logs found
                                        </td>
                                    </tr>
                                ) : (
                                    usageDaily.map((item) => (
                                        <tr key={item.date}>
                                            <td className="px-4 py-2.5">{item.date}</td>
                                            <td className="px-4 py-2.5 text-right">{item.count.toLocaleString()}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="rounded-xl border-[var(--app-border)] surface-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-left">
                                    <th className="px-4 py-3 font-semibold">Time</th>
                                    <th className="px-4 py-3 font-semibold">Workspace</th>
                                    <th className="px-4 py-3 font-semibold">Key</th>
                                    <th className="px-4 py-3 font-semibold">Method</th>
                                    <th className="px-4 py-3 font-semibold">Endpoint</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {usageLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                                            Loading usage...
                                        </td>
                                    </tr>
                                ) : usageLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                                            No API usage logs found
                                        </td>
                                    </tr>
                                ) : (
                                    usageLogs.map((log) => (
                                        <tr key={log.id}>
                                            <td className="px-4 py-2.5 text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                                            <td className="px-4 py-2.5">{log.workspaceName || log.workspaceId}</td>
                                            <td className="px-4 py-2.5">{log.apiKeyName}</td>
                                            <td className="px-4 py-2.5">{log.method}</td>
                                            <td className="px-4 py-2.5 font-mono text-xs">{log.endpoint}</td>
                                            <td className="px-4 py-2.5">{log.statusCode}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {usageLogTotal > USAGE_LOG_PAGE_SIZE && (
                        <div className="flex items-center justify-center gap-2">
                            <button
                                onClick={() => setUsagePage((value) => Math.max(1, value - 1))}
                                disabled={usagePage <= 1}
                                className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <span className="text-xs text-slate-500">
                                Page {usagePage} of {Math.max(1, Math.ceil(usageLogTotal / USAGE_LOG_PAGE_SIZE))}
                            </span>
                            <button
                                onClick={() =>
                                    setUsagePage((value) =>
                                        Math.min(Math.ceil(usageLogTotal / USAGE_LOG_PAGE_SIZE), value + 1)
                                    )
                                }
                                disabled={usagePage >= Math.ceil(usageLogTotal / USAGE_LOG_PAGE_SIZE)}
                                className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                Super Admin controls apply only within this enterprise context.
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
    return (
        <div className="rounded-xl border-[var(--app-border)] surface-card px-3 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Icon className="w-3.5 h-3.5" />
                {label}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{value.toLocaleString()}</div>
        </div>
    );
}

function MetricBox({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-xl border-[var(--app-border)] surface-card p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{value.toLocaleString()}</p>
        </div>
    );
}
