'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    CheckCircle2,
    Download,
    Loader2,
    Search,
    XCircle
} from 'lucide-react';
import { CardSkeleton, TableSkeleton } from '@/components/ui/Loading';
import {
    exportWorkspaceUsage,
    getUsageLogs,
    getUsageStats,
    type UsageLog,
    type UsageStats
} from '@/lib/enterprise-api';
import type { WorkspaceSectionProps } from '../section-types';
import { normalizeWorkspaceRole } from '../section-types';
import { searchInputClass, sectionCardClass, sectionTitleClass } from './shared';

export default function UsageSection({
    workspaceId,
    userRole,
    showToast
}: WorkspaceSectionProps) {
    const [loading, setLoading] = useState(true);
    const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
    const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [exportingUsage, setExportingUsage] = useState(false);

    const normalizedRole = normalizeWorkspaceRole(userRole);
    const canExportUsage = normalizedRole === 'OWNER' || normalizedRole === 'ADMIN';

    const searchNormalized = search.trim().toLowerCase();
    const filteredUsageLogs = useMemo(() => {
        if (!searchNormalized) return usageLogs;
        return usageLogs.filter((log) => {
            const haystack = `${log.method} ${log.endpoint} ${log.apiKeyName} ${log.statusCode}`.toLowerCase();
            return haystack.includes(searchNormalized);
        });
    }, [usageLogs, searchNormalized]);

    useEffect(() => {
        let mounted = true;
        const controller = new AbortController();
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const [stats, { logs }] = await Promise.all([
                    getUsageStats(workspaceId, 30, { signal: controller.signal }),
                    getUsageLogs(workspaceId, { limit: 50 }, { signal: controller.signal })
                ]);
                if (!mounted) return;
                setUsageStats(stats);
                setUsageLogs(logs || []);
            } catch (err: any) {
                if (!mounted || controller.signal.aborted) return;
                const message = err?.message || 'Failed to load usage data';
                setError(message);
                showToast(message, 'error');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        void load();
        return () => {
            mounted = false;
            controller.abort();
        };
    }, [workspaceId, showToast]);

    const handleExportUsage = async () => {
        if (!canExportUsage) {
            showToast("You don't have permission to do that.", 'error');
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

    return (
        <div className="space-y-6">
            <div className={sectionCardClass}>
                <div className="flex items-center justify-between mb-4 gap-3">
                    <div>
                        <h2 className={sectionTitleClass}>API Usage (Last 30 Days)</h2>
                        <p className="text-sm text-[var(--app-text-secondary)] mt-1">
                            Request volume and recent API calls by workspace keys.
                        </p>
                    </div>
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
                <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search API usage logs..."
                        className={`pl-9 ${searchInputClass}`}
                    />
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="space-y-4">
                    <CardSkeleton count={3} />
                    <TableSkeleton cols={4} rows={6} />
                </div>
            ) : usageStats ? (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="surface-card rounded-xl p-5 border border-[var(--app-border)]">
                            <p className="text-sm text-[var(--app-text-secondary)] mb-1">Total Requests</p>
                            <p className="text-2xl font-bold text-[var(--app-text-primary)]">
                                {usageStats.totalRequests.toLocaleString()}
                            </p>
                        </div>
                        <div className="surface-card rounded-xl p-5 border border-[var(--app-border)]">
                            <p className="text-sm text-[var(--app-text-secondary)] mb-1">Success Rate</p>
                            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                {usageStats.successRate.toFixed(1)}%
                            </p>
                        </div>
                        <div className="surface-card rounded-xl p-5 border border-[var(--app-border)]">
                            <p className="text-sm text-[var(--app-text-secondary)] mb-1">Avg. Daily</p>
                            <p className="text-2xl font-bold text-[var(--app-text-primary)]">
                                {Math.round(usageStats.totalRequests / 30).toLocaleString()}
                            </p>
                        </div>
                        <div className="surface-card rounded-xl p-5 border border-[var(--app-border)]">
                            <p className="text-sm text-[var(--app-text-secondary)] mb-1">Active Endpoints</p>
                            <p className="text-2xl font-bold text-[var(--app-text-primary)]">
                                {usageStats.requestsByEndpoint.length.toLocaleString()}
                            </p>
                        </div>
                    </div>

                    <div className={sectionCardClass}>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Recent API Calls</h3>
                        {usageLogs.length === 0 ? (
                            <p className="text-[var(--app-text-secondary)] text-center py-8">No API calls recorded yet</p>
                        ) : filteredUsageLogs.length === 0 ? (
                            <p className="text-[var(--app-text-secondary)] text-center py-8">No API usage logs match your search</p>
                        ) : (
                            <div className="space-y-2">
                                {filteredUsageLogs.slice(0, 20).map((log) => (
                                    <div
                                        key={log.id}
                                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 surface-card rounded-lg text-sm border border-[var(--app-border)]"
                                    >
                                        <div className="flex items-center gap-3">
                                            {log.statusCode < 400 ? (
                                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <XCircle className="w-4 h-4 text-red-500" />
                                            )}
                                            <code className="text-slate-600 dark:text-slate-400 break-all">
                                                {log.method} {log.endpoint}
                                            </code>
                                        </div>
                                        <div className="flex items-center gap-4 text-[var(--app-text-secondary)] text-xs sm:text-sm">
                                            <span>{log.apiKeyName}</span>
                                            <span className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className={sectionCardClass}>
                    <p className="text-[var(--app-text-secondary)] text-center py-8">No data yet</p>
                </div>
            )}
        </div>
    );
}

