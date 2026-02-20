'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Download, Search, AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

interface AuditLog {
    id: string;
    actorRole?: string | null;
    admin: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
    };
    action: string;
    entity: string;
    targetId: string;
    details: string;
    createdAt: string;
    ipAddress: string;
    currentHash: string;
}

import AuditAnalyticsSection from './AuditAnalyticsSection';
import RealTimeFeed from './RealTimeFeed';
import AlertsList from './AlertsList';

export default function AuditLogsSection() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);

    // Filters
    const [actionFilter, setActionFilter] = useState('');
    const [entityFilter, setEntityFilter] = useState('');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
                action: actionFilter,
                entity: entityFilter
            });
            const res = await api.get(`/admin/audit/logs?${params}`);
            setLogs(res.data.logs);
            setTotalPages(Math.ceil(res.data.total / 20));
        } catch (error) {
            console.error('Failed to fetch admin logs', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [page, actionFilter, entityFilter]);

    const handleExport = async () => {
        try {
            // Trigger download directly via browser
            const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/admin/audit/export`;
            // We need to pass auth token. Since api wrapper handles it for XHR, but for direct link we need another way?
            // Actually, best to use api.get with responseType blob
            const res = await api.get('/admin/audit/export', { responseType: 'blob' });

            const urlBlob = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = urlBlob;
            link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Export failed', error);
            alert('Failed to export logs');
        }
    };

    return (
        <div className="space-y-6">
            {/* 1. Alerts Channel */}
            <AlertsList />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Shield className="text-blue-600 dark:text-blue-500" /> Admin Logs
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Immutable record of all administrative actions type.</p>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                >
                    <Download className="w-4 h-4" /> Export CSV
                </button>
            </div>

            {/* 2. Live Intelligence Layer */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <AuditAnalyticsSection />
                </div>
                <div className="lg:col-span-1">
                    <RealTimeFeed onLogReceived={fetchLogs} />
                </div>
            </div>

            {/* 3. Historical Data Table */}
            {/* Filters */}
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 surface-card p-4 rounded-xl shadow-sm">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <select
                        className="w-full pl-10 pr-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 appearance-none"
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                    >
                        <option value="">All Actions</option>
                        <option value="CREATE">Create</option>
                        <option value="UPDATE">Update</option>
                        <option value="DELETE">Delete</option>
                        <option value="APPROVE">Approve</option>
                        <option value="REJECT">Reject</option>
                        <option value="LOGIN">Login</option>
                        <option value="SUSPEND">Suspend</option>
                        <option value="INVOICE_UPDATE">Invoice Update</option>
                    </select>
                </div>
                <div>
                    <input
                        type="text"
                        placeholder="Filter by Entity (e.g. Site, User)"
                        className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                        value={entityFilter}
                        onChange={(e) => setEntityFilter(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="surface-card rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-600 dark:text-slate-400">
                        <thead className="text-xs text-[var(--app-text-secondary)] uppercase bg-app-secondary/50 border-b border-[var(--app-border)]">
                            <tr>
                                <th className="px-6 py-3">Timestamp</th>
                                <th className="px-6 py-3">Admin</th>
                                <th className="px-6 py-3">Action</th>
                                <th className="px-6 py-3">Entity</th>
                                <th className="px-6 py-3">Details</th>
                                <th className="px-6 py-3 text-right">Integrity</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b border-[var(--app-border)]">
                                        <td className="px-6 py-4" colSpan={6}>
                                            <Skeleton className="h-4 w-full rounded" />
                                        </td>
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500 dark:text-slate-500">
                                        No admin logs found.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-6 py-4 font-mono text-xs">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-900 dark:text-slate-200">{log.admin.email}</div>
                                            <div className="text-xs text-slate-500 dark:opacity-70">{log.actorRole || log.admin.role}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${log.action === 'DELETE' || log.action === 'REJECT' || log.action === 'SUSPEND' ? 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400' :
                                                log.action === 'APPROVE' || log.action === 'CREATE' ? 'bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400' :
                                                    'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                                }`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                                            {log.entity || '-'}
                                        </td>
                                        <td className="px-6 py-4 max-w-md truncate" title={log.details}>
                                            {log.details}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {log.currentHash ? (
                                                <div className="flex items-center justify-end gap-1 text-green-500/80 text-xs" title="Hash Verified">
                                                    <CheckCircle className="w-3 h-3" />
                                                    <span className="font-mono">SECURE</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-1 text-yellow-500/80 text-xs">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    <span>Legacy</span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <button
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-xs text-slate-600 dark:text-slate-400"
                    >
                        Previous
                    </button>
                    <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-xs text-slate-600 dark:text-slate-400"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
