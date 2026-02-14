'use client';

import { useEffect, useState } from 'react';
import { fetchAdminSessions, revokeAdminSession } from '@/lib/api';
import { ShieldOff } from 'lucide-react';

interface AdminSession {
    id: string;
    jti: string;
    actorType: string;
    actorId: string;
    role?: string | null;
    issuedAt: string;
    expiresAt: string;
    lastSeenAt?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    admin?: {
        id: string;
        email: string;
        firstName?: string | null;
        lastName?: string | null;
        role?: string | null;
    } | null;
}

const formatDate = (value?: string | null) => {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
};

export default function AdminSessionsSection() {
    const [sessions, setSessions] = useState<AdminSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadSessions = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await fetchAdminSessions();
            setSessions(data || []);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to load admin sessions');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSessions();
    }, []);

    const handleRevoke = async (id: string) => {
        if (!confirm('Force logout this session?')) return;
        try {
            await revokeAdminSession(id);
            await loadSessions();
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Failed to revoke session');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Admin Sessions</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Active admin sessions (Super Admin only).</p>
                </div>
                <button
                    onClick={loadSessions}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                    Refresh
                </button>
            </div>

            {loading ? (
                <div className="text-slate-400">Loading sessions...</div>
            ) : error ? (
                <div className="text-red-400">{error}</div>
            ) : sessions.length === 0 ? (
                <div className="text-slate-400">No active sessions found.</div>
            ) : (
                <div className="overflow-x-auto border-[var(--app-border)] rounded-xl surface-card">
                    <table className="min-w-full text-sm text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 text-left">
                            <tr>
                                <th className="text-left px-4 py-3">Admin</th>
                                <th className="text-left px-4 py-3">Role</th>
                                <th className="text-left px-4 py-3">Issued</th>
                                <th className="text-left px-4 py-3">Last Active</th>
                                <th className="text-left px-4 py-3">Expires</th>
                                <th className="text-left px-4 py-3">IP</th>
                                <th className="text-left px-4 py-3">Agent</th>
                                <th className="text-right px-4 py-3">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.map((session) => (
                                <tr key={session.id} className="border-t border-slate-200 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-900 dark:text-white">
                                            {session.admin?.firstName || ''} {session.admin?.lastName || ''}
                                        </div>
                                        <div className="text-xs text-slate-500">{session.admin?.email || session.actorId}</div>
                                    </td>
                                    <td className="px-4 py-3">{session.admin?.role || session.role || '—'}</td>
                                    <td className="px-4 py-3">{formatDate(session.issuedAt)}</td>
                                    <td className="px-4 py-3">{formatDate(session.lastSeenAt)}</td>
                                    <td className="px-4 py-3">{formatDate(session.expiresAt)}</td>
                                    <td className="px-4 py-3 text-xs">{session.ipAddress || '—'}</td>
                                    <td className="px-4 py-3 text-xs max-w-[220px] truncate" title={session.userAgent || ''}>
                                        {session.userAgent || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => handleRevoke(session.id)}
                                            className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            <ShieldOff className="w-4 h-4" />
                                            Force logout
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
