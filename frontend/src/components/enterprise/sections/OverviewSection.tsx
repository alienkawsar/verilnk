'use client';

import type { ComponentType } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
    BarChart3,
    Key,
    Link2,
    Shield,
    Activity,
    LayoutDashboard,
    Users
} from 'lucide-react';
import { CardSkeleton, TableSkeleton } from '@/components/ui/Loading';
import {
    getUsageStats,
    getWorkspaceAuditLogs,
    type WorkspaceAuditLog
} from '@/lib/enterprise-api';
import type { WorkspaceSectionProps } from '../section-types';
import { canAccessSection } from '../section-types';
import {
    sectionCardClass,
    sectionTitleClass,
    statusBadgeClass,
    tableHeadClass,
    tableRowClass,
    tableWrapperClass
} from './shared';

interface OverviewSectionProps extends WorkspaceSectionProps {
    userName?: string;
    onNavigate: (section: string) => void;
}

const formatAuditAction = (action: string) =>
    action
        .toLowerCase()
        .split('_')
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');

export default function OverviewSection({
    workspaceId,
    workspace,
    userRole,
    userName,
    onNavigate,
}: OverviewSectionProps) {
    const [loading, setLoading] = useState(true);
    const [recentLogs, setRecentLogs] = useState<WorkspaceAuditLog[]>([]);
    const [totalRequests, setTotalRequests] = useState(0);

    const canViewOrganizations = canAccessSection(userRole, 'organizations');
    const canViewMembers = canAccessSection(userRole, 'members');
    const canViewApiKeys = canAccessSection(userRole, 'api-keys');
    const canViewUsage = canAccessSection(userRole, 'usage');
    const canViewAnalytics = canAccessSection(userRole, 'analytics');
    const canViewSecurity = canAccessSection(userRole, 'security');

    const shouldLoadUsageStats = canViewUsage;
    const shouldLoadAuditLogs = canViewSecurity;
    const shouldFetchOverviewData = shouldLoadUsageStats || shouldLoadAuditLogs;

    const workspaceOrgCount = workspace?.organizations?.length || workspace?.orgCount || workspace?._count?.organizations || 0;
    const workspaceMemberCount = workspace?.members?.length || workspace?.memberCount || workspace?._count?.members || 0;
    const workspaceApiKeyCount = workspace?.apiKeys?.length || workspace?.apiKeyCount || workspace?._count?.apiKeys || 0;

    useEffect(() => {
        let isActive = true;
        const controller = new AbortController();

        const loadOverview = async () => {
            if (!shouldFetchOverviewData) {
                setRecentLogs([]);
                setTotalRequests(0);
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const jobs: Array<Promise<void>> = [];

                if (shouldLoadAuditLogs) {
                    jobs.push(
                        getWorkspaceAuditLogs(workspaceId, { page: 1, limit: 5 }, { signal: controller.signal })
                            .then((auditRes) => {
                                if (!isActive) return;
                                setRecentLogs(auditRes.logs || []);
                            })
                            .catch(() => {
                                if (!isActive) return;
                                setRecentLogs([]);
                            })
                    );
                } else {
                    setRecentLogs([]);
                }

                if (shouldLoadUsageStats) {
                    jobs.push(
                        getUsageStats(workspaceId, 30, { signal: controller.signal })
                            .then((usage) => {
                                if (!isActive) return;
                                setTotalRequests(usage.totalRequests || 0);
                            })
                            .catch(() => {
                                if (!isActive) return;
                                setTotalRequests(0);
                            })
                    );
                } else {
                    setTotalRequests(0);
                }

                await Promise.all(jobs);
            } finally {
                if (isActive) setLoading(false);
            }
        };
        void loadOverview();
        return () => {
            isActive = false;
            controller.abort();
        };
    }, [workspaceId, shouldFetchOverviewData, shouldLoadAuditLogs, shouldLoadUsageStats]);

    const welcomeName = useMemo(() => workspace?.name || 'Workspace', [workspace?.name]);
    const greetingName = useMemo(() => {
        const normalized = typeof userName === 'string' ? userName.trim() : '';
        return normalized || 'User';
    }, [userName]);

    const kpiCards = useMemo(() => {
        const cards: Array<{ label: string; value: number }> = [];
        if (canViewOrganizations) cards.push({ label: 'Organizations', value: Number(workspaceOrgCount || 0) });
        if (canViewMembers) cards.push({ label: 'Members', value: Number(workspaceMemberCount || 0) });
        if (canViewApiKeys) cards.push({ label: 'API Keys', value: Number(workspaceApiKeyCount || 0) });
        if (canViewUsage) cards.push({ label: 'Total Requests', value: Number(totalRequests || 0) });
        return cards;
    }, [canViewApiKeys, canViewMembers, canViewOrganizations, canViewUsage, totalRequests, workspaceApiKeyCount, workspaceMemberCount, workspaceOrgCount]);

    const quickActions = useMemo(() => {
        const actions: Array<{
            key: string;
            section: string;
            title: string;
            subtitle: string;
            icon: ComponentType<{ className?: string }>;
        }> = [];

        if (canViewAnalytics) {
            actions.push({
                key: 'analytics',
                section: 'analytics',
                title: 'Analytics',
                subtitle: 'View multi-org insights',
                icon: BarChart3
            });
        }
        if (canViewUsage) {
            actions.push({
                key: 'usage',
                section: 'usage',
                title: 'Usage',
                subtitle: 'Inspect API request traffic',
                icon: Activity
            });
        }
        if (canViewApiKeys) {
            actions.push({
                key: 'api-keys',
                section: 'api-keys',
                title: 'Manage API Keys',
                subtitle: 'Create, rotate and revoke keys',
                icon: Key
            });
        }
        if (canViewMembers) {
            actions.push({
                key: 'members',
                section: 'members',
                title: 'Members',
                subtitle: 'Add workspace collaborators',
                icon: Users
            });
        }
        if (canViewOrganizations) {
            actions.push({
                key: 'organizations',
                section: 'organizations',
                title: 'Organizations',
                subtitle: 'Link and manage organizations',
                icon: Link2
            });
        }
        if (canViewSecurity) {
            actions.push({
                key: 'security',
                section: 'security',
                title: 'Security',
                subtitle: 'Review logs and active sessions',
                icon: Shield
            });
        }

        return actions;
    }, [canViewAnalytics, canViewApiKeys, canViewMembers, canViewOrganizations, canViewSecurity, canViewUsage]);

    return (
        <div className="space-y-6">
            <div className={sectionCardClass}>
                <h1 className="text-2xl font-bold text-[var(--app-text-primary)]">Welcome back, {greetingName}</h1>
                <p className="text-sm text-[var(--app-text-secondary)] mt-1">
                    {welcomeName} activity snapshot for the current workspace.
                </p>
            </div>

            {kpiCards.length > 0 && (
                loading && shouldFetchOverviewData ? (
                    <CardSkeleton count={kpiCards.length} />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {kpiCards.map((card) => (
                            <div
                                key={card.label}
                                className="surface-card rounded-xl p-5 border border-[var(--app-border)] hover:border-blue-500/20 transition-all duration-200"
                            >
                                <p className="text-sm text-[var(--app-text-secondary)] mb-1">{card.label}</p>
                                <p className="text-2xl font-bold text-[var(--app-text-primary)]">
                                    {card.value.toLocaleString()}
                                </p>
                            </div>
                        ))}
                    </div>
                )
            )}

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                {canViewSecurity && (
                    <div className={`xl:col-span-3 ${sectionCardClass}`}>
                        <h2 className={sectionTitleClass}>Recent Activity</h2>
                        <p className="text-xs text-[var(--app-text-secondary)] mt-1 mb-4">
                            Latest audit events in this workspace.
                        </p>
                        {loading ? (
                            <TableSkeleton cols={3} rows={4} />
                        ) : recentLogs.length === 0 ? (
                            <div className="py-10 text-center text-sm text-[var(--app-text-secondary)]">
                                No recent audit activity.
                            </div>
                        ) : (
                            <div className={tableWrapperClass}>
                                <table className="min-w-full text-sm">
                                    <thead className={tableHeadClass}>
                                        <tr>
                                            <th className="px-3 py-2 text-left">Action</th>
                                            <th className="px-3 py-2 text-left">Entity</th>
                                            <th className="px-3 py-2 text-left">Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentLogs.map((log) => (
                                            <tr key={log.id} className={tableRowClass}>
                                                <td className="px-3 py-2">
                                                    <span className={statusBadgeClass(log.action)}>
                                                        {formatAuditAction(log.action)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-[var(--app-text-primary)]">
                                                    {log.entity || 'Workspace'}
                                                </td>
                                                <td className="px-3 py-2 text-[var(--app-text-secondary)] whitespace-nowrap">
                                                    {new Date(log.createdAt).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                <div className={`${canViewSecurity ? 'xl:col-span-2' : 'xl:col-span-5'} ${sectionCardClass}`}>
                    <h2 className={sectionTitleClass}>Quick Actions</h2>
                    <p className="text-xs text-[var(--app-text-secondary)] mt-1 mb-4">
                        Jump to sections you can access.
                    </p>
                    {quickActions.length === 0 ? (
                        <div className="py-8 text-center">
                            <LayoutDashboard className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                            <p className="text-sm font-medium text-[var(--app-text-primary)]">No actions available</p>
                            <p className="text-xs text-[var(--app-text-secondary)] mt-1">
                                Your role currently has read-only overview access.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {quickActions.map((action) => (
                                <button
                                    key={action.key}
                                    onClick={() => onNavigate(action.section)}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--app-border)] hover:bg-[var(--app-surface-hover)] hover:border-blue-500/20 transition-all text-left"
                                >
                                    <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center">
                                        <action.icon className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-[var(--app-text-primary)]">{action.title}</p>
                                        <p className="text-xs text-[var(--app-text-secondary)]">{action.subtitle}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
