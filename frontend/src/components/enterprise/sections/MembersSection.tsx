'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, Loader2, Plus, Search, Trash2, Users } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Loading';
import {
    cancelWorkspaceInvite,
    createWorkspaceInvite,
    getWorkspaceInvites,
    getWorkspaceMembers,
    isLimitReachedError,
    removeMember,
    updateMemberRole,
    type WorkspaceInvite,
    type WorkspaceMember
} from '@/lib/enterprise-api';
import type { WorkspaceSectionProps } from '../section-types';
import { normalizeWorkspaceRole } from '../section-types';
import {
    ORG_ID_REGEX,
    type InviteMethod,
    emptyStateIconClass,
    searchInputClass,
    sectionCardClass,
    sectionTitleClass,
    statusBadgeClass,
    tableHeadClass,
    tableRowClass,
    tableWrapperClass
} from './shared';

const roleBadgeClass = (role: string) => {
    const normalized = role.toUpperCase();
    if (normalized === 'OWNER') return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    if (normalized === 'ADMIN') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    if (normalized === 'DEVELOPER') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    if (normalized === 'ANALYST') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400';
};

const displayRole = (role: string | null | undefined) => {
    const value = normalizeWorkspaceRole(role);
    return value || role || 'UNKNOWN';
};

export default function MembersSection({
    workspaceId,
    userRole,
    enterpriseAccess,
    showToast
}: WorkspaceSectionProps) {
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
    const [search, setSearch] = useState('');
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteMethod, setInviteMethod] = useState<InviteMethod>('EMAIL');
    const [inviteIdentifier, setInviteIdentifier] = useState('');
    const [inviteRole, setInviteRole] = useState<'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR'>('AUDITOR');
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);
    const [showInviteSafetyConfirm, setShowInviteSafetyConfirm] = useState(false);
    const [inviteSafetyCountdown, setInviteSafetyCountdown] = useState(10);
    const [updatingMemberRoles, setUpdatingMemberRoles] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    const normalizedRole = normalizeWorkspaceRole(userRole);
    const canManage = normalizedRole === 'OWNER' || normalizedRole === 'ADMIN';
    const quotaLimits = enterpriseAccess?.entitlements;
    const quotaUsage = enterpriseAccess?.usage;
    const memberLimitReached = Boolean(
        quotaLimits
        && quotaUsage
        && quotaLimits.maxMembers > 0
        && quotaUsage.members >= quotaLimits.maxMembers
    );

    const searchNormalized = search.trim().toLowerCase();
    const filteredMembers = useMemo(() => {
        if (!searchNormalized) return members;
        return members.filter((member) => {
            const firstName = member.user?.firstName?.toLowerCase() || '';
            const lastName = member.user?.lastName?.toLowerCase() || '';
            const email = member.user?.email?.toLowerCase() || '';
            const role = String(member.role || '').toLowerCase();
            return (
                firstName.includes(searchNormalized)
                || lastName.includes(searchNormalized)
                || email.includes(searchNormalized)
                || role.includes(searchNormalized)
            );
        });
    }, [members, searchNormalized]);

    const filteredInvites = useMemo(() => {
        if (!searchNormalized) return invites;
        return invites.filter((invite) => {
            const target = `${invite.invitedEmail || ''} ${invite.invitedUserId || ''}`.toLowerCase();
            const role = invite.role.toLowerCase();
            const status = invite.status.toLowerCase();
            return (
                target.includes(searchNormalized)
                || role.includes(searchNormalized)
                || status.includes(searchNormalized)
            );
        });
    }, [invites, searchNormalized]);

    useEffect(() => {
        let mounted = true;
        const controller = new AbortController();
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const [{ members: mems }, { invites: wsInvites }] = await Promise.all([
                    getWorkspaceMembers(workspaceId, { signal: controller.signal }),
                    getWorkspaceInvites(workspaceId, { signal: controller.signal }),
                ]);
                if (!mounted) return;
                setMembers(mems || []);
                setInvites(wsInvites || []);
            } catch (err: any) {
                if (!mounted || controller.signal.aborted) return;
                const message = err?.message || 'Failed to load members';
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

    useEffect(() => {
        if (!showInviteSafetyConfirm) return;
        setInviteSafetyCountdown(10);
        const intervalId = window.setInterval(() => {
            setInviteSafetyCountdown((previous) => {
                if (previous <= 1) {
                    window.clearInterval(intervalId);
                    return 0;
                }
                return previous - 1;
            });
        }, 1000);
        return () => window.clearInterval(intervalId);
    }, [showInviteSafetyConfirm]);

    const refreshData = async () => {
        const [{ members: mems }, { invites: wsInvites }] = await Promise.all([
            getWorkspaceMembers(workspaceId),
            getWorkspaceInvites(workspaceId),
        ]);
        setMembers(mems || []);
        setInvites(wsInvites || []);
    };

    const resetInviteForm = () => {
        setInviteMethod('EMAIL');
        setInviteIdentifier('');
        setInviteRole('AUDITOR');
        setInviteError(null);
        setLatestInviteLink(null);
    };

    const closeInviteModal = () => {
        setShowInviteModal(false);
        setShowInviteSafetyConfirm(false);
        setInviteSafetyCountdown(10);
        resetInviteForm();
    };

    const showQuotaLimitToast = () => {
        showToast(
            `Limit reached: Members (${quotaUsage?.members ?? 0}/${quotaLimits?.maxMembers ?? 0})`,
            'error'
        );
    };

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
        showToast('Copied', 'success');
    };

    const validateInviteTarget = () => {
        if (!canManage) {
            showToast("You don't have permission to do that.", 'error');
            return null;
        }
        if (memberLimitReached) {
            showQuotaLimitToast();
            return null;
        }

        const targetValue = inviteIdentifier.trim();
        if (!targetValue) return null;
        if (inviteMethod === 'EMAIL' && !targetValue.includes('@')) {
            setInviteError('Please enter a valid email address');
            return null;
        }
        if (inviteMethod === 'USER_ID' && !ORG_ID_REGEX.test(targetValue)) {
            setInviteError('Please enter a valid user ID (UUID)');
            return null;
        }

        return targetValue;
    };

    const executeCreateInvite = async (targetValue: string) => {
        try {
            setCreatingInvite(true);
            setInviteError(null);
            const result = await createWorkspaceInvite(workspaceId, {
                invitedEmail: inviteMethod === 'EMAIL' ? targetValue : undefined,
                invitedUserId: inviteMethod === 'USER_ID' ? targetValue : undefined,
                role: inviteRole
            });
            setLatestInviteLink(result.inviteLink);
            showToast('Invite sent', 'success');
            setInviteIdentifier('');
            await refreshData();
        } catch (err: any) {
            if (isLimitReachedError(err)) {
                showToast(err.message, 'error');
                return;
            }
            setInviteError(err?.message || 'Failed to create invite');
        } finally {
            setCreatingInvite(false);
        }
    };

    const handleCreateInvite = async () => {
        const targetValue = validateInviteTarget();
        if (!targetValue) return;
        setShowInviteSafetyConfirm(true);
        setInviteSafetyCountdown(10);
    };

    const handleCreateInviteWithSafetyConfirm = async () => {
        if (inviteSafetyCountdown > 0) return;
        const targetValue = validateInviteTarget();
        if (!targetValue) {
            setShowInviteSafetyConfirm(false);
            return;
        }

        setShowInviteSafetyConfirm(false);
        await executeCreateInvite(targetValue);
    };

    const handleCancelInvite = async (inviteId: string) => {
        if (!canManage) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (!window.confirm('Cancel this invite?')) return;
        try {
            await cancelWorkspaceInvite(workspaceId, inviteId);
            showToast('Invite canceled', 'success');
            await refreshData();
        } catch (err: any) {
            showToast(err?.message || 'Failed to cancel invite', 'error');
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!canManage) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (!window.confirm('Remove this member from the workspace?')) return;
        try {
            await removeMember(workspaceId, userId);
            showToast('Member removed', 'success');
            await refreshData();
        } catch (err: any) {
            showToast(err?.message || 'Failed to remove member', 'error');
        }
    };

    const handleUpdateMemberRole = async (
        member: WorkspaceMember,
        nextRole: 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR'
    ) => {
        if (!canManage) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        const currentRole = displayRole(member.role);
        if (currentRole === 'OWNER') {
            showToast('Owner role cannot be changed here. Use transfer ownership instead.', 'error');
            return;
        }
        if (currentRole === nextRole) return;

        const previousRole = member.role;
        setUpdatingMemberRoles((prev) => ({ ...prev, [member.id]: true }));
        setMembers((prev) => prev.map((row) => (row.id === member.id ? { ...row, role: nextRole } : row)));

        try {
            const { member: updatedMember } = await updateMemberRole(workspaceId, member.id, nextRole);
            setMembers((prev) => prev.map((row) => (row.id === member.id ? { ...row, role: updatedMember.role } : row)));
            showToast('Role updated', 'success');
        } catch (err: any) {
            setMembers((prev) => prev.map((row) => (row.id === member.id ? { ...row, role: previousRole } : row)));
            showToast(err?.message || 'Failed to update member role', 'error');
        } finally {
            setUpdatingMemberRoles((prev) => {
                const next = { ...prev };
                delete next[member.id];
                return next;
            });
        }
    };

    return (
        <>
            <div className="space-y-6">
                <div className={sectionCardClass}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className={sectionTitleClass}>Team Members</h2>
                            <p className="text-sm text-[var(--app-text-secondary)] mt-1">
                                Invite workspace members and manage roles.
                            </p>
                        </div>
                        {canManage && (
                            <button
                                onClick={() => {
                                    setShowInviteModal(true);
                                    setInviteMethod('EMAIL');
                                    setInviteIdentifier('');
                                    setInviteRole('AUDITOR');
                                    setInviteError(null);
                                    setLatestInviteLink(null);
                                }}
                                disabled={memberLimitReached}
                                className="inline-flex items-center gap-2 px-4 py-2 btn-primary text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-4 h-4" />
                                Invite Member
                            </button>
                        )}
                    </div>
                    <div className="mt-4 relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search members and invites..."
                            className={`pl-9 ${searchInputClass}`}
                        />
                    </div>
                    {memberLimitReached && (
                        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                            Limit reached: Members ({quotaUsage?.members ?? 0}/{quotaLimits?.maxMembers ?? 0})
                        </p>
                    )}
                </div>

                {error && (
                    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}

                <div className={sectionCardClass}>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Members</h3>
                    {loading ? (
                        <TableSkeleton cols={4} rows={4} />
                    ) : members.length === 0 ? (
                        <div className="py-12 text-center">
                            <Users className={emptyStateIconClass} />
                            <p className="text-lg font-semibold text-slate-900 dark:text-white">No members yet</p>
                            <p className="text-sm text-[var(--app-text-secondary)] mt-1">Invite members to collaborate in this workspace.</p>
                        </div>
                    ) : filteredMembers.length === 0 ? (
                        <div className="py-8 text-center text-sm text-[var(--app-text-secondary)]">
                            No members match your search.
                        </div>
                    ) : (
                        <div className={tableWrapperClass}>
                            <table className="min-w-full text-sm">
                                <thead className={tableHeadClass}>
                                    <tr>
                                        <th className="px-3 py-2 text-left">Member</th>
                                        <th className="px-3 py-2 text-left">Role</th>
                                        {canManage && <th className="px-3 py-2 text-right">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMembers.map((member) => {
                                        const memberRole = displayRole(member.role);
                                        const canEditRole =
                                            canManage
                                            && memberRole !== 'OWNER'
                                            && ['ADMIN', 'DEVELOPER', 'ANALYST', 'AUDITOR'].includes(memberRole);
                                        const roleUpdating = Boolean(updatingMemberRoles[member.id]);
                                        return (
                                            <tr key={member.id} className={tableRowClass}>
                                                <td className="px-3 py-3">
                                                    <p className="font-medium text-slate-900 dark:text-white">
                                                        {member.user?.firstName} {member.user?.lastName}
                                                    </p>
                                                    <p className="text-xs text-[var(--app-text-secondary)]">
                                                        {member.user?.email || member.userId}
                                                    </p>
                                                </td>
                                                <td className="px-3 py-3">
                                                    {canEditRole ? (
                                                        <select
                                                            value={memberRole}
                                                            onChange={(e) =>
                                                                handleUpdateMemberRole(
                                                                    member,
                                                                    e.target.value as 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR'
                                                                )
                                                            }
                                                            disabled={roleUpdating}
                                                            className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 disabled:opacity-50"
                                                        >
                                                            <option value="ADMIN">ADMIN</option>
                                                            <option value="DEVELOPER">DEVELOPER</option>
                                                            <option value="ANALYST">ANALYST</option>
                                                            <option value="AUDITOR">AUDITOR</option>
                                                        </select>
                                                    ) : (
                                                        <span className={`px-2.5 py-1 text-xs font-medium rounded ${roleBadgeClass(memberRole)}`}>
                                                            {memberRole}
                                                        </span>
                                                    )}
                                                </td>
                                                {canManage && (
                                                    <td className="px-3 py-3 text-right">
                                                        {memberRole !== 'OWNER' && (
                                                            <button
                                                                onClick={() => handleRemoveMember(member.userId)}
                                                                disabled={roleUpdating}
                                                                className="p-1 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                                                title="Remove member"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className={sectionCardClass}>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Pending & Recent Invites</h3>
                    {loading ? (
                        <TableSkeleton cols={6} rows={3} />
                    ) : invites.length === 0 ? (
                        <p className="text-sm text-[var(--app-text-secondary)]">No invites yet.</p>
                    ) : filteredInvites.length === 0 ? (
                        <p className="text-sm text-[var(--app-text-secondary)]">No invites match your search.</p>
                    ) : (
                        <div className={tableWrapperClass}>
                            <table className="min-w-full text-sm">
                                <thead className={tableHeadClass}>
                                    <tr>
                                        <th className="px-3 py-2 text-left">Target</th>
                                        <th className="px-3 py-2 text-left">Role</th>
                                        <th className="px-3 py-2 text-left">Created</th>
                                        <th className="px-3 py-2 text-left">Expires</th>
                                        <th className="px-3 py-2 text-left">Status</th>
                                        {canManage && <th className="px-3 py-2 text-right">Action</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInvites.map((invite) => (
                                        <tr key={invite.id} className={tableRowClass}>
                                            <td className="px-3 py-3 text-[var(--app-text-primary)]">
                                                {invite.invitedEmail || invite.invitedUserId || '—'}
                                            </td>
                                            <td className="px-3 py-3 text-[var(--app-text-primary)]">{displayRole(invite.role)}</td>
                                            <td className="px-3 py-3 text-[var(--app-text-secondary)] whitespace-nowrap">
                                                {new Date(invite.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-3 py-3 text-[var(--app-text-secondary)] whitespace-nowrap">
                                                {new Date(invite.expiresAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className={statusBadgeClass(invite.status)}>{invite.status}</span>
                                            </td>
                                            {canManage && (
                                                <td className="px-3 py-3 text-right">
                                                    {invite.status === 'PENDING' && (
                                                        <button
                                                            onClick={() => handleCancelInvite(invite.id)}
                                                            className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                                        >
                                                            Cancel
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-md w-full shadow-2xl">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Invite Team Member</h2>
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
                                        className="px-2 py-1.5 text-xs rounded border border-emerald-200 dark:border-emerald-700 inline-flex items-center gap-1"
                                    >
                                        <Copy className="w-3 h-3" />
                                        Copy
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="space-y-4 mb-6">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                                    Invite by
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setInviteMethod('EMAIL')}
                                        className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                            inviteMethod === 'EMAIL'
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                                                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        Email
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInviteMethod('USER_ID')}
                                        className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                            inviteMethod === 'USER_ID'
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                                                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        User ID
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    {inviteMethod === 'EMAIL' ? 'Email Address' : 'User ID'}
                                </label>
                                <input
                                    type={inviteMethod === 'EMAIL' ? 'email' : 'text'}
                                    value={inviteIdentifier}
                                    onChange={(e) => setInviteIdentifier(e.target.value)}
                                    placeholder={inviteMethod === 'EMAIL' ? 'teammate@example.com' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Role
                                </label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'DEVELOPER' | 'ANALYST' | 'AUDITOR')}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                >
                                    <option value="AUDITOR">Auditor</option>
                                    <option value="DEVELOPER">Developer</option>
                                    <option value="ANALYST">Analyst</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={closeInviteModal}
                                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateInvite}
                                disabled={memberLimitReached || creatingInvite || !inviteIdentifier.trim()}
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

            {showInviteSafetyConfirm && (
                <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-[var(--app-border)] shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--app-border)]">
                            <h3 className="text-lg font-semibold text-[var(--app-text-primary)]">Confirm member invite</h3>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-900/20 p-3 flex items-start gap-2.5">
                                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                    Caution: Added members may access sensitive workspace data and actions.
                                </p>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowInviteSafetyConfirm(false)}
                                    disabled={creatingInvite}
                                    className="px-4 py-2 text-sm rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreateInviteWithSafetyConfirm}
                                    disabled={inviteSafetyCountdown > 0 || creatingInvite}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {creatingInvite && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {inviteSafetyCountdown > 0 ? `Confirm (${inviteSafetyCountdown}s)` : 'Confirm'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
