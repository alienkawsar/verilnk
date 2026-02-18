'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import AnalyticsChart from '@/components/analytics/AnalyticsChart';
import TrafficHeatmap from '@/components/analytics/TrafficHeatmap';
import CategoryPerformance from '@/components/analytics/CategoryPerformance';
import { CardSkeleton, ChartSkeleton, TableSkeleton } from '@/components/ui/Loading';
import {
    exportEnterpriseAnalytics,
    getEnterpriseAnalytics,
    getEnterpriseAnalyticsCategories,
    getEnterpriseAnalyticsDaily,
    getEnterpriseAnalyticsHeatmap,
    getEnterpriseAnalyticsSummary,
    type EnterpriseAnalytics,
    type EnterpriseAnalyticsCategories,
    type EnterpriseAnalyticsDaily,
    type EnterpriseAnalyticsHeatmap,
    type EnterpriseAnalyticsSummary
} from '@/lib/enterprise-api';
import type { WorkspaceSectionProps } from '../section-types';
import { normalizeWorkspaceRole } from '../section-types';
import { sectionCardClass, sectionTitleClass } from './shared';

export default function AnalyticsSection({
    workspaceId,
    workspace,
    userRole,
    showToast
}: WorkspaceSectionProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [analyticsRange, setAnalyticsRange] = useState<'7' | '30' | '90'>('30');
    const [analytics, setAnalytics] = useState<EnterpriseAnalytics | null>(null);
    const [analyticsSummary, setAnalyticsSummary] = useState<EnterpriseAnalyticsSummary | null>(null);
    const [analyticsDaily, setAnalyticsDaily] = useState<EnterpriseAnalyticsDaily | null>(null);
    const [analyticsHeatmap, setAnalyticsHeatmap] = useState<EnterpriseAnalyticsHeatmap | null>(null);
    const [analyticsCategories, setAnalyticsCategories] = useState<EnterpriseAnalyticsCategories | null>(null);
    const [exportingAnalyticsFormat, setExportingAnalyticsFormat] = useState<'csv' | 'pdf' | null>(null);

    const normalizedRole = normalizeWorkspaceRole(userRole);
    const canExportAnalytics = normalizedRole === 'OWNER' || normalizedRole === 'ADMIN' || normalizedRole === 'ANALYST';

    const workspaceOrgCount = workspace?.organizations?.length || workspace?.orgCount || workspace?._count?.organizations || 0;

    useEffect(() => {
        let mounted = true;
        const controller = new AbortController();
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const range = analyticsRange;
                const [overview, summary, daily, heatmap, categories] = await Promise.all([
                    getEnterpriseAnalytics(workspaceId, `${range}d`, { signal: controller.signal }),
                    getEnterpriseAnalyticsSummary(workspaceId, range, { signal: controller.signal }),
                    getEnterpriseAnalyticsDaily(workspaceId, range, { signal: controller.signal }),
                    getEnterpriseAnalyticsHeatmap(workspaceId, range, { signal: controller.signal }),
                    getEnterpriseAnalyticsCategories(workspaceId, range, { signal: controller.signal }),
                ]);
                if (!mounted) return;
                setAnalytics(overview);
                setAnalyticsSummary(summary);
                setAnalyticsDaily(daily);
                setAnalyticsHeatmap(heatmap);
                setAnalyticsCategories(categories);
            } catch (err: any) {
                if (!mounted || controller.signal.aborted) return;
                const message = err?.message || 'Failed to load analytics';
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
    }, [workspaceId, analyticsRange, showToast]);

    const handleExportAnalytics = async (format: 'csv' | 'pdf') => {
        if (!canExportAnalytics) {
            showToast("You don't have permission to do that.", 'error');
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

    return (
        <div className="space-y-6">
            <div className={sectionCardClass}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h2 className={sectionTitleClass}>Multi-Org Analytics</h2>
                        <p className="text-sm text-[var(--app-text-secondary)] mt-1">
                            Cross-organization traffic and engagement insights.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={analyticsRange}
                            onChange={(e) => setAnalyticsRange(e.target.value as '7' | '30' | '90')}
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
                                {exportingAnalyticsFormat === 'csv'
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Download className="w-3.5 h-3.5" />}
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
                                {exportingAnalyticsFormat === 'pdf'
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Download className="w-3.5 h-3.5" />}
                                PDF
                            </button>
                        )}
                    </div>
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
                    <ChartSkeleton />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ChartSkeleton />
                        <ChartSkeleton />
                    </div>
                </div>
            ) : workspaceOrgCount === 0 ? (
                <div className={`${sectionCardClass} py-12 text-center`}>
                    <BarChart3 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-700 dark:text-slate-300 mb-2">No linked organizations yet</p>
                    <p className="text-sm text-slate-500 dark:text-slate-500">
                        Link organizations to this workspace to see aggregated analytics.
                    </p>
                </div>
            ) : analyticsSummary && analyticsDaily && analyticsHeatmap && analyticsCategories && analytics ? (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="surface-card rounded-xl p-5 border border-[var(--app-border)]">
                            <p className="text-sm text-[var(--app-text-secondary)] mb-1">Total Views</p>
                            <p className="text-2xl font-bold text-[var(--app-text-primary)]">
                                {analyticsSummary.totals.views.toLocaleString()}
                            </p>
                        </div>
                        <div className="surface-card rounded-xl p-5 border border-[var(--app-border)]">
                            <p className="text-sm text-[var(--app-text-secondary)] mb-1">Total Clicks</p>
                            <p className="text-2xl font-bold text-[var(--app-text-primary)]">
                                {analyticsSummary.totals.clicks.toLocaleString()}
                            </p>
                        </div>
                        <div className="surface-card rounded-xl p-5 border border-[var(--app-border)]">
                            <p className="text-sm text-[var(--app-text-secondary)] mb-1">Click-Through Rate</p>
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {analyticsSummary.totals.ctr.toFixed(1)}%
                            </p>
                        </div>
                        <div className="surface-card rounded-xl p-5 border border-[var(--app-border)]">
                            <p className="text-sm text-[var(--app-text-secondary)] mb-1">Organizations</p>
                            <p className="text-2xl font-bold text-[var(--app-text-primary)]">
                                {analyticsSummary.topOrgs.length.toLocaleString()}
                            </p>
                        </div>
                    </div>

                    <div className={`${sectionCardClass} min-h-[256px]`}>
                        <div className="overflow-x-auto touch-pan-x -mx-2 px-2">
                            <div className="min-w-[500px] h-64">
                                <AnalyticsChart
                                    data={analyticsDaily.series}
                                    type="combined"
                                    height={256}
                                    color="#187DE9"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className={`${sectionCardClass} min-h-[256px]`}>
                            <h3 className="text-md font-semibold text-slate-900 dark:text-white mb-4">Traffic by Time</h3>
                            <TrafficHeatmap
                                heatmap={analyticsHeatmap.heatmap}
                                maxViews={analyticsHeatmap.maxViews}
                                maxClicks={analyticsHeatmap.maxClicks}
                                range={`${analyticsRange}d`}
                                onRangeChange={(nextRange) => setAnalyticsRange(nextRange.replace('d', '') as '7' | '30' | '90')}
                            />
                        </div>
                        <div className={`${sectionCardClass} min-h-[256px]`}>
                            <h3 className="text-md font-semibold text-slate-900 dark:text-white mb-4">Category Performance</h3>
                            <CategoryPerformance
                                topCategories={analyticsCategories.topCategories}
                                trends={analyticsCategories.trends}
                                range={`${analyticsRange}d`}
                                onRangeChange={(nextRange) => setAnalyticsRange(nextRange.replace('d', '') as '7' | '30' | '90')}
                            />
                        </div>
                    </div>

                    <div className={sectionCardClass}>
                        <h3 className="text-md font-semibold text-slate-900 dark:text-white mb-4">By Organization</h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-[680px] w-full text-sm border border-[var(--app-border)] rounded-lg overflow-hidden">
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
                                        <tr key={org.organizationId} className="border-t border-[var(--app-border)]">
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
                    </div>
                </>
            ) : (
                <div className={`${sectionCardClass} py-12 text-center`}>
                    <BarChart3 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-600 dark:text-slate-400 mb-2">No analytics data available</p>
                </div>
            )}
        </div>
    );
}

