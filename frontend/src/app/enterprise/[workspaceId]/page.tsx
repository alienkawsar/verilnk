'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import {
    EnterpriseApiError,
    checkEnterpriseAccess,
    getWorkspace,
    getWorkspaceMembership,
    type EnterpriseAccess
} from '@/lib/enterprise-api';
import { buildForcePasswordChangeRoute } from '@/lib/auth-redirect';
import WorkspaceDashboardShell from '@/components/enterprise/WorkspaceDashboardShell';
import OverviewSection from '@/components/enterprise/sections/OverviewSection';
import AnalyticsSection from '@/components/enterprise/sections/AnalyticsSection';
import UsageSection from '@/components/enterprise/sections/UsageSection';
import ApiKeysSection from '@/components/enterprise/sections/ApiKeysSection';
import MembersSection from '@/components/enterprise/sections/MembersSection';
import OrganizationsSection from '@/components/enterprise/sections/OrganizationsSection';
import SecuritySection from '@/components/enterprise/sections/SecuritySection';
import {
    canAccessSection,
    getAccessibleSections,
    normalizeWorkspaceRole,
    type WorkspaceSection
} from '@/components/enterprise/section-types';

const isValidSection = (section: string | null): section is WorkspaceSection => {
    return (
        section === 'overview'
        || section === 'analytics'
        || section === 'usage'
        || section === 'api-keys'
        || section === 'members'
        || section === 'organizations'
        || section === 'security'
    );
};

const legacyTabToSection = (tab: string | null): WorkspaceSection | null => {
    if (!tab) return null;
    if (tab === 'organizations') return 'organizations';
    if (tab === 'members') return 'members';
    if (tab === 'api-keys') return 'api-keys';
    if (tab === 'usage') return 'usage';
    if (tab === 'analytics') return 'analytics';
    if (tab === 'security') return 'security';
    return null;
};

const JUST_LOGGED_OUT_FLAG = 'verilnk_just_logged_out';

export default function WorkspacePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const { showToast } = useToast();
    const { user } = useAuth();
    const workspaceId = params.workspaceId as string;

    const [loading, setLoading] = useState(true);
    const [workspace, setWorkspace] = useState<any>(null);
    const [userRole, setUserRole] = useState<string>('');
    const [enterpriseAccess, setEnterpriseAccess] = useState<EnterpriseAccess | null>(null);
    const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview');
    const [error, setError] = useState<string | null>(null);
    const [workspaceAccessDenied, setWorkspaceAccessDenied] = useState(false);
    const [workspaceRestricted, setWorkspaceRestricted] = useState(false);
    const [workspaceSuspended, setWorkspaceSuspended] = useState(false);

    const normalizedRole = useMemo(() => normalizeWorkspaceRole(userRole), [userRole]);
    const accessibleSections = useMemo(() => getAccessibleSections(userRole), [userRole]);
    const userDisplayName = useMemo(() => {
        const first = user?.firstName?.trim();
        const last = user?.lastName?.trim();
        const fullName = [first, last].filter(Boolean).join(' ').trim();
        if (fullName) return fullName;
        if (user?.name?.trim()) return user.name.trim();
        if (user?.email?.includes('@')) return user.email.split('@')[0];

        const workspaceUserName =
            (workspace as any)?.currentUser?.name
            || (workspace as any)?.user?.name
            || (workspace as any)?.owner?.name;
        if (typeof workspaceUserName === 'string' && workspaceUserName.trim()) {
            return workspaceUserName.trim();
        }
        return 'User';
    }, [user, workspace]);

    const consumeLogoutRedirectFlag = () => {
        if (typeof window === 'undefined') return false;
        const raw = sessionStorage.getItem(JUST_LOGGED_OUT_FLAG);
        if (!raw) return false;
        sessionStorage.removeItem(JUST_LOGGED_OUT_FLAG);
        return true;
    };

    useEffect(() => {
        let mounted = true;
        const loadWorkspace = async () => {
            if (user?.mustChangePassword) {
                router.replace(buildForcePasswordChangeRoute(`/enterprise/${workspaceId}`));
                return;
            }

            try {
                setLoading(true);
                setError(null);
                setWorkspaceAccessDenied(false);
                setWorkspaceRestricted(false);
                setWorkspaceSuspended(false);

                const membership = await getWorkspaceMembership(workspaceId);
                const { workspace: ws, role } = await getWorkspace(workspaceId);
                if (!mounted) return;
                setWorkspace(ws);
                setUserRole(membership.memberRole || role);

                // Workspace route is membership-gated. Enterprise org access is optional here,
                // used only to show quota context when available.
                try {
                    const access = await checkEnterpriseAccess();
                    if (!mounted) return;
                    setEnterpriseAccess(access);
                } catch (accessError) {
                    if (!mounted) return;
                    setEnterpriseAccess(null);
                }
            } catch (err: any) {
                if (!mounted) return;
                if (err instanceof EnterpriseApiError && err.status === 401) {
                    if (consumeLogoutRedirectFlag()) {
                        router.replace('/');
                        return;
                    }
                    const next = encodeURIComponent(`/enterprise/${workspaceId}`);
                    router.replace(`/signin?next=${next}`);
                    return;
                }

                if (err instanceof EnterpriseApiError && err.status === 403) {
                    if (err.code === 'PASSWORD_CHANGE_REQUIRED') {
                        router.replace(buildForcePasswordChangeRoute(`/enterprise/${workspaceId}`));
                        return;
                    }
                    if (err.code === 'ORG_RESTRICTED') {
                        setWorkspaceRestricted(true);
                        setWorkspaceAccessDenied(false);
                        setWorkspace(null);
                        setUserRole('');
                        setEnterpriseAccess(null);
                        return;
                    }
                    setWorkspaceAccessDenied(true);
                    setWorkspace(null);
                    setUserRole('');
                    setEnterpriseAccess(null);
                    return;
                }

                if (err instanceof EnterpriseApiError && err.status === 423) {
                    if (err.code === 'WORKSPACE_SUSPENDED') {
                        setWorkspaceSuspended(true);
                        setWorkspace(null);
                        setUserRole('');
                        setEnterpriseAccess(null);
                        return;
                    }
                }

                console.error('Error loading workspace:', err);
                setError(err?.message || 'Failed to load workspace');
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void loadWorkspace();
        return () => {
            mounted = false;
        };
    }, [workspaceId, router, user?.mustChangePassword]);

    useEffect(() => {
        if (!workspace || accessibleSections.length === 0) return;

        const sectionParam = searchParams.get('section');
        const legacyTabParam = searchParams.get('tab');
        const resolvedSection = isValidSection(sectionParam)
            ? sectionParam
            : legacyTabToSection(legacyTabParam);

        const nextSection = resolvedSection && canAccessSection(userRole, resolvedSection)
            ? resolvedSection
            : (accessibleSections.includes('overview') ? 'overview' : accessibleSections[0]);

        if (nextSection && nextSection !== activeSection) {
            setActiveSection(nextSection);
        }
    }, [searchParams, workspace, accessibleSections, userRole, activeSection]);

    useEffect(() => {
        if (accessibleSections.length === 0) return;
        if (!canAccessSection(userRole, activeSection)) {
            setActiveSection(accessibleSections.includes('overview') ? 'overview' : accessibleSections[0]);
        }
    }, [activeSection, accessibleSections, userRole]);

    const handleSectionChange = (section: string) => {
        if (!isValidSection(section)) return;
        if (!canAccessSection(userRole, section)) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        setActiveSection(section);
        const params = new URLSearchParams(window.location.search);
        params.delete('tab');
        if (section === 'overview') params.delete('section');
        else params.set('section', section);
        const query = params.toString();
        router.replace(query ? `/enterprise/${workspaceId}?${query}` : `/enterprise/${workspaceId}`, { scroll: false });
    };

    const sectionProps = {
        workspaceId,
        workspace,
        userRole: normalizedRole || userRole,
        enterpriseAccess,
        showToast,
    };

    const renderSection = () => {
        switch (activeSection) {
            case 'overview':
                return <OverviewSection {...sectionProps} userName={userDisplayName} onNavigate={handleSectionChange} />;
            case 'analytics':
                return <AnalyticsSection {...sectionProps} />;
            case 'usage':
                return <UsageSection {...sectionProps} />;
            case 'api-keys':
                return <ApiKeysSection {...sectionProps} />;
            case 'members':
                return <MembersSection {...sectionProps} />;
            case 'organizations':
                return <OrganizationsSection {...sectionProps} />;
            case 'security':
                return <SecuritySection {...sectionProps} />;
            default:
                return <OverviewSection {...sectionProps} userName={userDisplayName} onNavigate={handleSectionChange} />;
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-app pb-16">
                <div className="w-full px-4 py-10">
                    <div className="flex items-center justify-center py-32">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                </div>
            </main>
        );
    }

    if (error && !workspace) {
        return (
            <main className="min-h-screen bg-app pb-16">
                <div className="w-full px-4 py-10">
                    <div className="max-w-md mx-auto text-center py-24">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                            Error Loading Workspace
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
                        <button
                            onClick={() => router.push('/enterprise')}
                            className="px-4 py-2 btn-primary rounded-lg"
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    if (workspaceAccessDenied) {
        return (
            <main className="min-h-screen bg-app pb-16">
                <div className="w-full px-4 py-10">
                    <div className="max-w-md mx-auto text-center py-24">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                            No Access To This Workspace
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                            You are signed in, but you are not a member of this workspace.
                        </p>
                        <button
                            onClick={() => router.push('/enterprise')}
                            className="px-4 py-2 btn-primary rounded-lg"
                        >
                            Back to Enterprise
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    if (workspaceRestricted) {
        return (
            <main className="min-h-screen bg-app pb-16">
                <div className="w-full px-4 py-10">
                    <div className="max-w-xl mx-auto text-center py-24">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                            Organization Restricted
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400">
                            Your organization is restricted. Please contact the admin.
                        </p>
                        <p className="text-slate-600 dark:text-slate-400 mt-1 mb-6">
                            If you are an admin, please contact support.
                        </p>
                        <button
                            onClick={() => router.push('/enterprise')}
                            className="px-4 py-2 btn-primary rounded-lg"
                        >
                            Back to Enterprise
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    if (workspaceSuspended) {
        return (
            <main className="min-h-screen bg-app pb-16">
                <div className="w-full px-4 py-10">
                    <div className="max-w-xl mx-auto text-center py-24">
                        <XCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                            Workspace Suspended
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400">
                            This workspace is currently suspended. Access is blocked until it is unsuspended by an owner or admin.
                        </p>
                        <p className="text-slate-600 dark:text-slate-400 mt-1 mb-6">
                            Use the Enterprise Dashboard workspace list for suspend/unsuspend actions.
                        </p>
                        <button
                            onClick={() => router.push('/enterprise')}
                            className="px-4 py-2 btn-primary rounded-lg"
                        >
                            Back to Enterprise
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    if (!workspace) {
        return null;
    }

    if (accessibleSections.length === 0) {
        return (
            <main className="min-h-screen bg-app pb-16">
                <div className="w-full px-4 py-10">
                    <div className="max-w-md mx-auto text-center py-24">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                            Access Restricted
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                            You do not have permission to access workspace sections.
                        </p>
                        <button
                            onClick={() => router.push('/enterprise')}
                            className="px-4 py-2 btn-primary rounded-lg"
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <WorkspaceDashboardShell
            workspace={workspace}
            userRole={normalizedRole || userRole}
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
        >
            {workspace?.status === 'ARCHIVED' && (
                <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                    This workspace is archived. The dashboard is currently read-only.
                </div>
            )}
            {renderSection()}
        </WorkspaceDashboardShell>
    );
}
