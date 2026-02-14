'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronRight, Loader2, Search, Shield } from 'lucide-react';
import {
    AdminEnterpriseListItem,
    EnterpriseAccessStatus,
    fetchAdminEnterprises,
    setAdminEnterpriseStatus
} from '@/lib/admin-enterprise-api';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';

export default function EnterpriseSection() {
    const router = useRouter();
    const { showToast } = useToast();

    const [enterprises, setEnterprises] = useState<AdminEnterpriseListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

    const loadEnterprises = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchAdminEnterprises({
                search: search || undefined,
                page,
                limit: 15
            });
            setEnterprises(response.enterprises);
            setTotalPages(response.pagination.totalPages || 1);
        } catch {
            showToast('Failed to load enterprise organizations', 'error');
        } finally {
            setLoading(false);
        }
    }, [search, page, showToast]);

    useEffect(() => {
        loadEnterprises();
    }, [loadEnterprises]);

    const toggleStatus = async (enterprise: AdminEnterpriseListItem) => {
        const targetStatus: EnterpriseAccessStatus = enterprise.accessStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        const confirmed = window.confirm(
            `${targetStatus === 'SUSPENDED' ? 'Suspend' : 'Activate'} enterprise access for "${enterprise.name}"?`
        );
        if (!confirmed) return;

        setUpdatingStatusId(enterprise.id);
        try {
            await setAdminEnterpriseStatus(enterprise.id, targetStatus);
            showToast(
                targetStatus === 'SUSPENDED' ? 'Enterprise suspended' : 'Enterprise activated',
                'success'
            );
            await loadEnterprises();
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to update enterprise status', 'error');
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const hasRows = useMemo(() => enterprises.length > 0, [enterprises]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                        <Shield className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Enterprise Management</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Manage enterprise organizations, then drill into workspaces and API controls
                        </p>
                    </div>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                    type="text"
                    placeholder="Search enterprises by name or domain..."
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
            </div>

            {loading ? (
                <TableSkeleton rows={6} cols={8} />
            ) : !hasRows ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400 rounded-xl border-[var(--app-border)] surface-card">
                    <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No enterprise organizations found</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border-[var(--app-border)] shadow-sm surface-card">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-left">
                                <th className="px-4 py-3 font-semibold">Enterprise</th>
                                <th className="px-4 py-3 font-semibold">Location</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 font-semibold text-center">Workspaces</th>
                                <th className="px-4 py-3 font-semibold text-center">API Keys</th>
                                <th className="px-4 py-3 font-semibold text-right">Requests (7d / 30d)</th>
                                <th className="px-4 py-3 font-semibold">Rate Limits</th>
                                <th className="px-4 py-3 font-semibold">Updated</th>
                                <th className="px-4 py-3 font-semibold"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {enterprises.map((enterprise) => (
                                <tr key={enterprise.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-3 min-w-[220px]">
                                        <div className="font-medium text-slate-900 dark:text-white">{enterprise.name}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            {enterprise.website}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                        {enterprise.country?.code || enterprise.country?.name || '--'}
                                        {enterprise.state?.code ? ` / ${enterprise.state.code}` : ''}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => toggleStatus(enterprise)}
                                            disabled={updatingStatusId === enterprise.id}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                                                enterprise.accessStatus === 'ACTIVE'
                                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                                            } disabled:opacity-60`}
                                        >
                                            {updatingStatusId === enterprise.id ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : null}
                                            {enterprise.accessStatus}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">
                                        {enterprise.workspaceCount}
                                    </td>
                                    <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">
                                        {enterprise.apiKeyCount}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs text-slate-600 dark:text-slate-400">
                                        {enterprise.requests7d.toLocaleString()} / {enterprise.requests30d.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                                        <div>Default {enterprise.rateLimits.defaultRpm}/min</div>
                                        <div className="text-[11px] text-slate-500">
                                            WS overrides: {enterprise.rateLimits.workspaceOverrides}, key overrides: {enterprise.rateLimits.keyOverrides}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {new Date(enterprise.updatedAt).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => router.push(`/admin/enterprise/${enterprise.id}`)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                                        >
                                            View
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Previous
                    </button>
                    <span className="text-xs text-slate-500">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                        disabled={page >= totalPages}
                        className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
