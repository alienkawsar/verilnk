'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw, Shield } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Loading';
import { useDebounce } from '@/hooks/useDebounce';
import {
    exportWorkspaceAuditLogs,
    getWorkspaceAuditLogs,
    getWorkspaceSessions,
    revokeWorkspaceSession,
    type WorkspaceAuditLog,
    type WorkspaceSession
} from '@/lib/enterprise-api';
import type { WorkspaceSectionProps } from '../section-types';
import { normalizeWorkspaceRole } from '../section-types';
import { sectionCardClass, sectionTitleClass, statusBadgeClass, tableHeadClass, tableRowClass, tableWrapperClass } from './shared';

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

const displayRole = (role: string | null | undefined) => normalizeWorkspaceRole(role) || role || 'UNKNOWN';

export default function SecuritySection({
    workspaceId,
    userRole,
    showToast
}: WorkspaceSectionProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [auditLogs, setAuditLogs] = useState<WorkspaceAuditLog[]>([]);
    const [auditPagination, setAuditPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
    const [workspaceSessions, setWorkspaceSessions] = useState<WorkspaceSession[]>([]);
    const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
    const [exportingAuditFormat, setExportingAuditFormat] = useState<'csv' | 'json' | null>(null);
    const [analyticsRange] = useState<'7' | '30' | '90'>('30');

    const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
    const [auditStartDate, setAuditStartDate] = useState('');
    const [auditEndDate, setAuditEndDate] = useState('');

    const debouncedAuditActionFilter = useDebounce(auditActionFilter, 300);
    const debouncedAuditStartDate = useDebounce(auditStartDate, 300);
    const debouncedAuditEndDate = useDebounce(auditEndDate, 300);

    const normalizedRole = normalizeWorkspaceRole(userRole);
    const canManage = normalizedRole === 'OWNER' || normalizedRole === 'ADMIN';
    const canExportAuditLogs = normalizedRole === 'OWNER' || normalizedRole === 'ADMIN' || normalizedRole === 'AUDITOR';

    useEffect(() => {
        setAuditPagination((prev) => ({ ...prev, page: 1 }));
    }, [debouncedAuditActionFilter, debouncedAuditStartDate, debouncedAuditEndDate]);

    const loadSecurity = async (signal?: AbortSignal) => {
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
                { signal }
            ),
            getWorkspaceSessions(workspaceId, { signal })
        ]);
        setAuditLogs(auditRes.logs || []);
        setAuditPagination(auditRes.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
        setWorkspaceSessions(sessionsRes.sessions || []);
    };

    useEffect(() => {
        let mounted = true;
        const controller = new AbortController();
        const run = async () => {
            try {
                setLoading(true);
                setError(null);
                await loadSecurity(controller.signal);
            } catch (err: any) {
                if (!mounted || controller.signal.aborted) return;
                const message = err?.message || 'Failed to load security data';
                setError(message);
                showToast(message, 'error');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        void run();
        return () => {
            mounted = false;
            controller.abort();
        };
    }, [
        workspaceId,
        auditPagination.page,
        auditPagination.limit,
        debouncedAuditActionFilter,
        debouncedAuditStartDate,
        debouncedAuditEndDate,
        showToast
    ]);

    const handleRefresh = async () => {
        try {
            setLoading(true);
            await loadSecurity();
        } catch (err: any) {
            showToast(err?.message || 'Failed to refresh security data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleExportAuditLogs = async (format: 'csv' | 'json') => {
        if (!canExportAuditLogs) {
            showToast("You don't have permission to do that.", 'error');
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

    const handleRevokeSession = async (sessionId: string) => {
        if (!canManage) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (!window.confirm('Revoke this session? The user will need to login again on that device.')) return;
        try {
            setRevokingSessionId(sessionId);
            await revokeWorkspaceSession(workspaceId, sessionId);
            showToast('Session revoked', 'success');
            await handleRefresh();
        } catch (err: any) {
            showToast(err?.message || 'Failed to revoke session', 'error');
        } finally {
            setRevokingSessionId(null);
        }
    };

    const hasAuditResults = useMemo(() => auditLogs.length > 0, [auditLogs.length]);

    return (
        <div className="space-y-8">
            {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            <section>
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
                    <div>
                        <h2 className={sectionTitleClass}>Audit Logs</h2>
                        <p className="text-sm text-[var(--app-text-secondary)]">
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
                                {exportingAuditFormat === 'csv'
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Download className="w-3.5 h-3.5" />}
                                Export CSV
                            </button>
                        )}
                        {canExportAuditLogs && (
                            <button
                                type="button"
                                onClick={() => handleExportAuditLogs('json')}
                                disabled={Boolean(exportingAuditFormat)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-[var(--app-border)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                {exportingAuditFormat === 'json'
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Download className="w-3.5 h-3.5" />}
                                Export JSON
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleRefresh}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-[var(--app-border)] hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </div>

                <div className={`${sectionCardClass} mb-4`}>
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

                {loading ? (
                    <TableSkeleton cols={5} rows={6} />
                ) : !hasAuditResults ? (
                    <div className={`${sectionCardClass} text-sm text-[var(--app-text-secondary)] py-6 text-center`}>
                        No audit logs found for this filter.
                    </div>
                ) : (
                    <>
                        <div className={tableWrapperClass}>
                            <table className="min-w-full text-sm">
                                <thead className={tableHeadClass}>
                                    <tr>
                                        <th className="px-3 py-2 text-left">Action</th>
                                        <th className="px-3 py-2 text-left">Actor</th>
                                        <th className="px-3 py-2 text-left">Entity</th>
                                        <th className="px-3 py-2 text-left">Details</th>
                                        <th className="px-3 py-2 text-left">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map((log) => (
                                        <tr key={log.id} className={tableRowClass}>
                                            <td className="px-3 py-3">
                                                <span className={statusBadgeClass(log.action)}>
                                                    {formatAuditActionLabel(log.action)}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-[var(--app-text-primary)]">
                                                {log.actor?.label || `${log.admin?.firstName || ''} ${log.admin?.lastName || ''}`.trim() || 'System'}
                                            </td>
                                            <td className="px-3 py-3 text-[var(--app-text-primary)]">{log.entity || 'Workspace'}</td>
                                            <td className="px-3 py-3 text-[var(--app-text-secondary)] max-w-[320px] truncate">
                                                {sanitizeAuditDetails(log.details) || '-'}
                                            </td>
                                            <td className="px-3 py-3 text-[var(--app-text-secondary)] whitespace-nowrap">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between mt-3 text-xs text-[var(--app-text-secondary)]">
                            <span>
                                Page {auditPagination.page} of {auditPagination.totalPages}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setAuditPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                                    }
                                    disabled={auditPagination.page <= 1}
                                    className="px-3 py-1.5 rounded-lg border border-[var(--app-border)] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setAuditPagination((prev) => ({
                                            ...prev,
                                            page: Math.min(prev.totalPages || 1, prev.page + 1)
                                        }))
                                    }
                                    disabled={auditPagination.page >= auditPagination.totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-[var(--app-border)] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </section>

            <section>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className={sectionTitleClass}>Active Sessions</h2>
                        <p className="text-sm text-[var(--app-text-secondary)]">
                            Review and revoke active workspace member sessions.
                        </p>
                    </div>
                </div>

                {loading ? (
                    <TableSkeleton cols={5} rows={4} />
                ) : workspaceSessions.length === 0 ? (
                    <div className={`${sectionCardClass} text-sm text-[var(--app-text-secondary)] py-6 text-center`}>
                        No active sessions found.
                    </div>
                ) : (
                    <div className={tableWrapperClass}>
                        <table className="min-w-full text-sm">
                            <thead className={tableHeadClass}>
                                <tr>
                                    <th className="px-3 py-2 text-left">Member</th>
                                    <th className="px-3 py-2 text-left">Role</th>
                                    <th className="px-3 py-2 text-left">IP</th>
                                    <th className="px-3 py-2 text-left">Last Seen</th>
                                    {canManage && <th className="px-3 py-2 text-right">Action</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {workspaceSessions.map((session) => (
                                    <tr key={session.id} className={tableRowClass}>
                                        <td className="px-3 py-3 text-[var(--app-text-primary)]">
                                            <div className="font-medium">
                                                {session.member?.user?.name
                                                    || `${session.member?.user?.firstName || ''} ${session.member?.user?.lastName || ''}`.trim()
                                                    || session.member?.user?.email
                                                    || session.actorId}
                                            </div>
                                            <div className="text-xs text-[var(--app-text-secondary)] truncate max-w-[280px]">
                                                {session.userAgent || 'Unknown device'}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-[var(--app-text-primary)]">
                                            {session.member?.role ? displayRole(session.member.role) : '-'}
                                        </td>
                                        <td className="px-3 py-3 text-[var(--app-text-secondary)]">{session.ipAddress || '-'}</td>
                                        <td className="px-3 py-3 text-[var(--app-text-secondary)] whitespace-nowrap">
                                            {session.lastSeenAt
                                                ? new Date(session.lastSeenAt).toLocaleString()
                                                : new Date(session.issuedAt).toLocaleString()}
                                        </td>
                                        {canManage && (
                                            <td className="px-3 py-3 text-right">
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
    );
}
