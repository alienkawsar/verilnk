'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Loader2, Users, Building2, Key, Activity, Plus, Trash2 } from 'lucide-react';
import {
    AdminApiKey,
    AdminLinkedOrg,
    AdminWorkspaceMemberRole,
    AdminUsageLog,
    AdminWorkspaceDetail,
    AdminWorkspaceMember,
    addAdminEnterpriseWorkspaceMember,
    deleteAdminWorkspace,
    fetchAdminEnterpriseWorkspaceDetail,
    revokeAdminWorkspaceApiKey
} from '@/lib/admin-enterprise-api';
import { TableSkeleton } from '@/components/ui/Loading';
import { useToast } from '@/components/ui/Toast';

const USAGE_PAGE_SIZE = 30;
const MEMBER_ROLE_OPTIONS: AdminWorkspaceMemberRole[] = ['ADMIN', 'EDITOR', 'ANALYST', 'VIEWER'];

export default function AdminEnterpriseWorkspaceDetailPage() {
    const params = useParams<{ orgId: string; workspaceId: string }>();
    const router = useRouter();
    const { showToast } = useToast();

    const orgId = params.orgId;
    const workspaceId = params.workspaceId;

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [usagePage, setUsagePage] = useState(1);

    const [enterpriseName, setEnterpriseName] = useState('');
    const [workspace, setWorkspace] = useState<AdminWorkspaceDetail | null>(null);
    const [members, setMembers] = useState<AdminWorkspaceMember[]>([]);
    const [linkedOrgs, setLinkedOrgs] = useState<AdminLinkedOrg[]>([]);
    const [apiKeys, setApiKeys] = useState<AdminApiKey[]>([]);
    const [usageLogs, setUsageLogs] = useState<AdminUsageLog[]>([]);
    const [usageTotal, setUsageTotal] = useState(0);
    const [showAddMemberForm, setShowAddMemberForm] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmName, setDeleteConfirmName] = useState('');
    const [deletingWorkspace, setDeletingWorkspace] = useState(false);
    const [addingMember, setAddingMember] = useState(false);
    const [memberEmail, setMemberEmail] = useState('');
    const [memberRole, setMemberRole] = useState<AdminWorkspaceMemberRole>('VIEWER');

    const loadWorkspace = useCallback(async () => {
        if (!orgId || !workspaceId) return;
        setLoading(true);
        try {
            const response = await fetchAdminEnterpriseWorkspaceDetail(orgId, workspaceId, {
                limit: USAGE_PAGE_SIZE,
                offset: (usagePage - 1) * USAGE_PAGE_SIZE
            });
            setEnterpriseName(response.enterprise.name);
            setWorkspace(response.workspace);
            setMembers(response.members);
            setLinkedOrgs(response.linkedOrgs);
            setApiKeys(response.apiKeys);
            setUsageLogs(response.usage.logs);
            setUsageTotal(response.usage.total);
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to load workspace details', 'error');
        } finally {
            setLoading(false);
        }
    }, [orgId, workspaceId, usagePage, showToast]);

    useEffect(() => {
        loadWorkspace();
    }, [loadWorkspace]);

    const totalUsagePages = useMemo(
        () => Math.max(1, Math.ceil(usageTotal / USAGE_PAGE_SIZE)),
        [usageTotal]
    );

    const handleRevoke = async (key: AdminApiKey) => {
        const confirmed = window.confirm(`Revoke API key "${key.name}"?`);
        if (!confirmed) return;

        setSubmitting(true);
        try {
            await revokeAdminWorkspaceApiKey(key.workspaceId, key.id);
            showToast('API key revoked', 'success');
            await loadWorkspace();
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to revoke API key', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddMember = async () => {
        if (!orgId || !workspaceId) return;

        const normalizedEmail = memberEmail.trim().toLowerCase();
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
            showToast('Enter a valid email address', 'error');
            return;
        }

        setAddingMember(true);
        try {
            await addAdminEnterpriseWorkspaceMember(orgId, workspaceId, {
                email: normalizedEmail,
                role: memberRole
            });
            showToast('Member added to workspace', 'success');
            setMemberEmail('');
            setMemberRole('VIEWER');
            setShowAddMemberForm(false);
            await loadWorkspace();
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to add member', 'error');
        } finally {
            setAddingMember(false);
        }
    };

    const handleDeleteWorkspace = async () => {
        if (!workspace) return;
        if (deleteConfirmName.trim() !== workspace.name) {
            showToast(`Type "${workspace.name}" to confirm deletion`, 'error');
            return;
        }

        setDeletingWorkspace(true);
        try {
            await deleteAdminWorkspace(workspace.id);
            showToast('Workspace deleted', 'success');
            router.push(`/admin/enterprise/${orgId}`);
            router.refresh();
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to delete workspace', 'error');
        } finally {
            setDeletingWorkspace(false);
        }
    };

    if (loading || !workspace) {
        return (
            <div className="p-6">
                <TableSkeleton rows={8} cols={4} />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => router.push(`/admin/enterprise/${orgId}`)}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">{workspace.name}</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            Enterprise: {enterpriseName} • Status: {workspace.status}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href={`/admin/enterprise/${orgId}`}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        Back to enterprise
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat icon={Users} label="Members" value={members.length} />
                <MiniStat icon={Building2} label="Linked Orgs" value={linkedOrgs.length} />
                <MiniStat icon={Key} label="API Keys" value={apiKeys.length} />
                <MiniStat icon={Activity} label="Usage Logs" value={usageTotal} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border-[var(--app-border)] surface-card overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2">
                        <span>Members</span>
                        <button
                            onClick={() => setShowAddMemberForm((value) => !value)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            {showAddMemberForm ? 'Close' : 'Add Member'}
                        </button>
                    </div>
                    {showAddMemberForm && (
                        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <input
                                    type="email"
                                    value={memberEmail}
                                    onChange={(event) => setMemberEmail(event.target.value)}
                                    placeholder="user@example.com"
                                    className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                                />
                                <select
                                    value={memberRole}
                                    onChange={(event) => setMemberRole(event.target.value as AdminWorkspaceMemberRole)}
                                    className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                                >
                                    {MEMBER_ROLE_OPTIONS.map((role) => (
                                        <option key={role} value={role}>
                                            {role}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleAddMember}
                                        disabled={addingMember}
                                        className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                                    >
                                        {addingMember ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                        Add
                                    </button>
                                    <button
                                        onClick={() => setShowAddMemberForm(false)}
                                        className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 dark:text-slate-400">
                                    <th className="px-4 py-2 font-semibold">User</th>
                                    <th className="px-4 py-2 font-semibold">Role</th>
                                    <th className="px-4 py-2 font-semibold">Joined</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {members.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                                            No members found
                                        </td>
                                    </tr>
                                ) : (
                                    members.map((member) => (
                                        <tr key={member.id}>
                                            <td className="px-4 py-2.5">
                                                <div>{member.user?.name || member.userId}</div>
                                                <div className="text-xs text-slate-500">{member.user?.email || ''}</div>
                                            </td>
                                            <td className="px-4 py-2.5">{member.role}</td>
                                            <td className="px-4 py-2.5 text-xs text-slate-500">
                                                {new Date(member.joinedAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-xl border-[var(--app-border)] surface-card overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Linked Organizations
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 dark:text-slate-400">
                                    <th className="px-4 py-2 font-semibold">Organization</th>
                                    <th className="px-4 py-2 font-semibold">Plan</th>
                                    <th className="px-4 py-2 font-semibold">Linked</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {linkedOrgs.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                                            No linked organizations yet
                                        </td>
                                    </tr>
                                ) : (
                                    linkedOrgs.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-4 py-2.5">{item.organization?.name || item.organizationId}</td>
                                            <td className="px-4 py-2.5 text-xs">{item.organization?.planType || '--'}</td>
                                            <td className="px-4 py-2.5 text-xs text-slate-500">
                                                {new Date(item.linkedAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border-[var(--app-border)] surface-card overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    API Keys
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-slate-500 dark:text-slate-400">
                                <th className="px-4 py-2 font-semibold">Key</th>
                                <th className="px-4 py-2 font-semibold">Scopes</th>
                                <th className="px-4 py-2 font-semibold">Rate</th>
                                <th className="px-4 py-2 font-semibold">Last Used</th>
                                <th className="px-4 py-2 font-semibold">Status</th>
                                <th className="px-4 py-2 font-semibold"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {apiKeys.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                                        No API keys found
                                    </td>
                                </tr>
                            ) : (
                                apiKeys.map((key) => (
                                    <tr key={key.id}>
                                        <td className="px-4 py-2.5">
                                            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{key.prefix}...</code>
                                            <div className="text-xs text-slate-500 mt-1">{key.name}</div>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs">{key.scopes.join(', ')}</td>
                                        <td className="px-4 py-2.5 text-xs">{key.rateLimitRpm ?? 'default'}</td>
                                        <td className="px-4 py-2.5 text-xs">
                                            {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs ${
                                                    key.isRevoked ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                                }`}
                                            >
                                                {key.isRevoked ? 'Revoked' : 'Active'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {!key.isRevoked ? (
                                                <button
                                                    onClick={() => handleRevoke(key)}
                                                    disabled={submitting}
                                                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline disabled:opacity-60"
                                                >
                                                    {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
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

            <div className="rounded-xl border-[var(--app-border)] surface-card overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Usage Logs
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-slate-500 dark:text-slate-400">
                                <th className="px-4 py-2 font-semibold">Time</th>
                                <th className="px-4 py-2 font-semibold">Key</th>
                                <th className="px-4 py-2 font-semibold">Method</th>
                                <th className="px-4 py-2 font-semibold">Endpoint</th>
                                <th className="px-4 py-2 font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {usageLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                                        No API usage logs found
                                    </td>
                                </tr>
                            ) : (
                                usageLogs.map((log) => (
                                    <tr key={log.id}>
                                        <td className="px-4 py-2.5 text-xs">{new Date(log.createdAt).toLocaleString()}</td>
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
                {usageTotal > USAGE_PAGE_SIZE && (
                    <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2">
                        <button
                            onClick={() => setUsagePage((page) => Math.max(1, page - 1))}
                            disabled={usagePage <= 1}
                            className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <span className="text-xs text-slate-500">
                            Page {usagePage} of {totalUsagePages}
                        </span>
                        <button
                            onClick={() => setUsagePage((page) => Math.min(totalUsagePages, page + 1))}
                            disabled={usagePage >= totalUsagePages}
                            className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-red-200 dark:border-red-900/50 surface-card p-4">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-2">
                        <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            Deleting this workspace unlinks all members and organizations and removes workspace resources.
                            This action cannot be undone.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setDeleteConfirmName('');
                            setShowDeleteModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                    </button>
                </div>
            </div>

            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-xl border border-[var(--app-border)] surface-card shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--app-border)]">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Delete workspace</h3>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                Type <span className="font-semibold text-slate-900 dark:text-white">{workspace.name}</span> to confirm deletion.
                            </p>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <input
                                type="text"
                                value={deleteConfirmName}
                                onChange={(event) => setDeleteConfirmName(event.target.value)}
                                placeholder={workspace.name}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
                            />
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteModal(false)}
                                    disabled={deletingWorkspace}
                                    className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteWorkspace}
                                    disabled={deletingWorkspace || deleteConfirmName.trim() !== workspace.name}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {deletingWorkspace && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Confirm Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
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
