'use client';

/**
 * UI audit deltas addressed:
 * - Enterprise dashboard did not follow the org dashboard hero + sidebar + content rhythm.
 * - Enterprise route rendered standalone cards and inconsistent spacing versus org dashboard patterns.
 * - Enterprise had no profile/settings flow with workspace-role-aware editing.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Building2,
  Boxes,
  CheckCircle,
  Clock,
  ExternalLink,
  Globe,
  Eye,
  EyeOff,
  Key,
  LayoutDashboard,
  Loader2,
  Lock,
  Mail,
  MapPin,
  PauseCircle,
  PlayCircle,
  Plus,
  Settings,
  Shield,
  Trash2,
  Upload,
  Users,
  X,
  Ban,
  CreditCard,
} from 'lucide-react';

import {
  EnterpriseApiError,
  checkEnterpriseAccess,
  createWorkspace,
  deleteWorkspace,
  downloadEnterpriseInvoice,
  archiveWorkspace,
  formatLimitReachedMessage,
  getEnterpriseCompliancePolicy,
  getEnterpriseUsageSummary,
  getEnterpriseProfile,
  getWorkspaces,
  isLimitReachedError,
  restoreWorkspace,
  suspendWorkspace,
  unsuspendWorkspace,
  updateEnterpriseCompliancePolicy,
  updateEnterpriseProfile,
  type EnterpriseCompliancePolicy,
  type EnterpriseAccess,
  type EnterpriseProfile,
  type EnterpriseUsageSummary,
  type Workspace,
} from '@/lib/enterprise-api';
import { buildForcePasswordChangeRoute } from '@/lib/auth-redirect';
import {
  fetchCategories,
  fetchCountries,
  fetchStates,
  uploadOrgLogo,
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import SecuritySection from '@/components/enterprise/sections/SecuritySection';

type DashboardTab =
  | 'overview'
  | 'billing'
  | 'workspaces'
  | 'compliance'
  | 'settings';
type WorkspaceNavigationTab = 'members' | 'api-keys';
type EnterpriseAccessGate = 'none' | 'normal-user' | 'org-upgrade' | 'restricted';

const DASHBOARD_TABS: DashboardTab[] = [
  'overview',
  'billing',
  'workspaces',
  'compliance',
  'settings',
];

type ProfileForm = {
  name: string;
  email: string;
  website: string;
  phone: string;
  address: string;
  countryId: string;
  stateId: string;
  categoryId: string;
  about: string;
};

const JUST_LOGGED_OUT_FLAG = 'verilnk_just_logged_out';

const DEFAULT_PROFILE_FORM: ProfileForm = {
  name: '',
  email: '',
  website: '',
  phone: '',
  address: '',
  countryId: '',
  stateId: '',
  categoryId: '',
  about: '',
};

const normalizeWorkspaceRoleLabel = (
  role: string | null | undefined,
): string | null => {
  if (!role) return null;
  const value = role.toUpperCase();
  if (value === 'EDITOR') return 'DEVELOPER';
  if (value === 'VIEWER') return 'AUDITOR';
  if (
    value === 'OWNER' ||
    value === 'ADMIN' ||
    value === 'DEVELOPER' ||
    value === 'ANALYST' ||
    value === 'AUDITOR'
  ) {
    return value;
  }
  return value;
};

const roleBadgeClass = (role: string | null | undefined) => {
  const normalizedRole = normalizeWorkspaceRoleLabel(role);
  switch (normalizedRole) {
    case 'OWNER':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'ADMIN':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'DEVELOPER':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'ANALYST':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'AUDITOR':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
};

const canAccessWorkspaceTab = (
  workspace: Workspace,
  tab: WorkspaceNavigationTab,
) => {
  const normalizedRole = normalizeWorkspaceRoleLabel(workspace.role);
  if (!normalizedRole) return false;

  if (tab === 'members') {
    return normalizedRole === 'OWNER' || normalizedRole === 'ADMIN';
  }

  return (
    normalizedRole === 'OWNER' ||
    normalizedRole === 'ADMIN' ||
    normalizedRole === 'DEVELOPER'
  );
};

const formatStatusLabel = (value: string | null | undefined): string => {
  if (!value) return 'Active';
  return value
    .toString()
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const toProfileForm = (profile: EnterpriseProfile | null): ProfileForm => {
  if (!profile) return DEFAULT_PROFILE_FORM;

  return {
    name: profile.organization.name || '',
    email: profile.organization.email || '',
    website: profile.organization.website || '',
    phone: profile.organization.phone || '',
    address: profile.organization.address || '',
    countryId: profile.organization.countryId || '',
    stateId: profile.organization.stateId || '',
    categoryId: profile.organization.categoryId || '',
    about: profile.organization.about || '',
  };
};

export default function EnterprisePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<
    string | null
  >(null);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(
    null,
  );
  const [workspaceActionTargetId, setWorkspaceActionTargetId] = useState<
    string | null
  >(null);
  const [deleteWorkspaceModalOpen, setDeleteWorkspaceModalOpen] = useState(false);
  const [deleteWorkspaceTarget, setDeleteWorkspaceTarget] =
    useState<Workspace | null>(null);
  const [deleteWorkspaceStep, setDeleteWorkspaceStep] = useState<
    'CONFIRM_TIMER' | 'PASSWORD_CONFIRM'
  >('CONFIRM_TIMER');
  const [deleteWorkspaceCountdown, setDeleteWorkspaceCountdown] = useState(10);
  const [deleteWorkspacePassword, setDeleteWorkspacePassword] = useState('');
  const [showDeleteWorkspacePassword, setShowDeleteWorkspacePassword] =
    useState(false);

  const [hasAccess, setHasAccess] = useState(false);
  const [accessGate, setAccessGate] = useState<EnterpriseAccessGate>('none');
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [usageRange, setUsageRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [usageSummary, setUsageSummary] =
    useState<EnterpriseUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const [access, setAccess] = useState<EnterpriseAccess | null>(null);
  const [profile, setProfile] = useState<EnterpriseProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const [countries, setCountries] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  const [formData, setFormData] = useState<ProfileForm>(DEFAULT_PROFILE_FORM);
  const [logoPathInput, setLogoPathInput] = useState('');
  const [logoError, setLogoError] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [workspacePickerTab, setWorkspacePickerTab] =
    useState<WorkspaceNavigationTab | null>(null);
  const [compliancePolicy, setCompliancePolicy] =
    useState<EnterpriseCompliancePolicy | null>(null);
  const [compliancePolicySaving, setCompliancePolicySaving] = useState(false);
  const [complianceWorkspaceId, setComplianceWorkspaceId] = useState('');

  const canEditProfile = Boolean(profile?.canEdit);
  const canEditCompliancePolicy = useMemo(() => {
    const actorRole = String(profile?.role || user?.role || '')
      .trim()
      .toUpperCase();
    return actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';
  }, [profile?.role, user?.role]);
  const navigableWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.status !== 'DELETED'),
    [workspaces],
  );
  const membersTabWorkspaces = useMemo(
    () =>
      navigableWorkspaces.filter((workspace) =>
        canAccessWorkspaceTab(workspace, 'members'),
      ),
    [navigableWorkspaces],
  );
  const apiKeysTabWorkspaces = useMemo(
    () =>
      navigableWorkspaces.filter((workspace) =>
        canAccessWorkspaceTab(workspace, 'api-keys'),
      ),
    [navigableWorkspaces],
  );
  const workspacePickerOptions = useMemo(() => {
    if (workspacePickerTab === 'members') return membersTabWorkspaces;
    if (workspacePickerTab === 'api-keys') return apiKeysTabWorkspaces;
    return [];
  }, [apiKeysTabWorkspaces, membersTabWorkspaces, workspacePickerTab]);
  const activeWorkspaceCount = useMemo(
    () =>
      workspaces.filter((workspace) => workspace.status === 'ACTIVE').length,
    [workspaces],
  );
  const suspendedWorkspaceCount = useMemo(
    () =>
      workspaces.filter((workspace) => workspace.status === 'SUSPENDED').length,
    [workspaces],
  );
  const archivedWorkspaceCount = useMemo(
    () =>
      workspaces.filter((workspace) => workspace.status === 'ARCHIVED').length,
    [workspaces],
  );
  const totalOrganizations = useMemo(
    () => workspaces.reduce((sum, workspace) => sum + workspace.orgCount, 0),
    [workspaces],
  );
  const totalMembers = useMemo(
    () => workspaces.reduce((sum, workspace) => sum + workspace.memberCount, 0),
    [workspaces],
  );
  const totalApiKeys = useMemo(
    () => workspaces.reduce((sum, workspace) => sum + workspace.apiKeyCount, 0),
    [workspaces],
  );
  const workspaceLimit = access?.entitlements?.maxWorkspaces ?? 0;
  const workspaceUsage = access?.usage?.workspaces ?? workspaces.length;
  const workspaceLimitReached = Boolean(
    access?.entitlements &&
    workspaceLimit > 0 &&
    workspaceUsage >= workspaceLimit,
  );
  const planStatusLabel = profile?.organization.planStatus || 'ACTIVE';
  const invoices = profile?.organization.billingAccount?.invoices || [];
  const latestInvoice = invoices[0] || null;
  const planEndAt = (
    profile?.organization as { planEndAt?: string | null } | null
  )?.planEndAt;
  const renewalLabel = planEndAt
    ? `Renews on: ${new Date(planEndAt).toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}`
    : `Billing: ${formatStatusLabel(planStatusLabel)}`;
  const effectiveApiRateLimit =
    access?.entitlements?.apiRateLimitPerMinute ??
    profile?.entitlements?.apiRateLimitPerMinute ??
    null;
  const apiLimitSummary = effectiveApiRateLimit
    ? `API Limit: ${effectiveApiRateLimit.toLocaleString()}/min`
    : null;
  const complianceWorkspace = useMemo(() => {
    if (!complianceWorkspaceId) return null;
    return workspaces.find((workspace) => workspace.id === complianceWorkspaceId) || null;
  }, [complianceWorkspaceId, workspaces]);
  const recentWorkspaces = useMemo(
    () =>
      [...workspaces]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 10),
    [workspaces],
  );

  useEffect(() => {
    if (workspaces.length === 0) {
      if (complianceWorkspaceId) {
        setComplianceWorkspaceId('');
      }
      return;
    }

    if (complianceWorkspaceId && workspaces.some((workspace) => workspace.id === complianceWorkspaceId)) {
      return;
    }

    const nextWorkspaceId =
      workspaces.find((workspace) => workspace.status !== 'DELETED')?.id || '';
    if (nextWorkspaceId !== complianceWorkspaceId) {
      setComplianceWorkspaceId(nextWorkspaceId);
    }
  }, [workspaces, complianceWorkspaceId]);

  const updateDashboardSection = (tab: DashboardTab) => {
    setActiveTab(tab);

    const currentSearch =
      typeof window !== 'undefined' ? window.location.search : '';
    const nextParams = new URLSearchParams(currentSearch);
    if (tab === 'overview') {
      nextParams.delete('section');
    } else {
      nextParams.set('section', tab);
    }

    const query = nextParams.toString();
    router.replace(query ? `/enterprise?${query}` : '/enterprise', {
      scroll: false,
    });
  };

  const closeWorkspacePicker = () => {
    setWorkspacePickerOpen(false);
    setWorkspacePickerTab(null);
  };

  const selectWorkspaceForTab = (
    workspaceId: string,
    tab: WorkspaceNavigationTab,
  ) => {
    closeWorkspacePicker();
    router.push(`/enterprise/${workspaceId}?tab=${tab}`);
  };

  const openWorkspaceTab = (tab: WorkspaceNavigationTab) => {
    const tabWorkspaces =
      tab === 'members' ? membersTabWorkspaces : apiKeysTabWorkspaces;
    if (tabWorkspaces.length === 0) {
      if (navigableWorkspaces.length === 0) {
        showToast('Create a workspace first', 'error');
        return;
      }
      showToast("You don't have permission to do that.", 'error');
      return;
    }
    if (tabWorkspaces.length === 1) {
      router.push(`/enterprise/${tabWorkspaces[0].id}?tab=${tab}`);
      return;
    }
    setWorkspacePickerTab(tab);
    setWorkspacePickerOpen(true);
  };

  useEffect(() => {
    if (!workspacePickerOpen || !workspacePickerTab) return;
    if (workspacePickerOptions.length > 0) return;

    setWorkspacePickerOpen(false);
    setWorkspacePickerTab(null);

    if (navigableWorkspaces.length === 0) {
      showToast('Create a workspace first', 'error');
      return;
    }
    showToast("You don't have permission to do that.", 'error');
  }, [
    navigableWorkspaces.length,
    showToast,
    workspacePickerOpen,
    workspacePickerOptions.length,
    workspacePickerTab,
  ]);

  const openWorkspaceList = () => {
    updateDashboardSection('workspaces');
  };

  const consumeLogoutRedirectFlag = () => {
    if (typeof window === 'undefined') return false;
    const raw = sessionStorage.getItem(JUST_LOGGED_OUT_FLAG);
    if (!raw) return false;
    sessionStorage.removeItem(JUST_LOGGED_OUT_FLAG);
    return true;
  };

  useEffect(() => {
    if (authLoading) return;

    if (user?.mustChangePassword) {
      router.replace(buildForcePasswordChangeRoute('/enterprise'));
      return;
    }

    // Logged out = no user session in AuthContext.
    if (!user) {
      if (consumeLogoutRedirectFlag()) {
        router.replace('/');
        return;
      }
      router.replace('/signin?next=/enterprise');
      return;
    }

    // Normal user = authenticated user account without organization scope.
    if (!user.organizationId) {
      setAccessGate('normal-user');
      setHasAccess(false);
      setLoading(false);
      return;
    }

    // Organization account = authenticated org-scoped user.
    // Enterprise access = org account with active enterprise entitlement from /enterprise/access.
    void loadData(user);
  }, [authLoading, router, user]);

  useEffect(() => {
    const syncFromUrl = () => {
      const section = new URLSearchParams(window.location.search).get(
        'section',
      );
      if (section && DASHBOARD_TABS.includes(section as DashboardTab)) {
        setActiveTab(section as DashboardTab);
        return;
      }
      setActiveTab('overview');
    };

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    if (!hasAccess) {
      setUsageSummary(null);
      setUsageError(null);
      setUsageLoading(false);
      return;
    }

    let isMounted = true;
    const loadUsageSummary = async () => {
      try {
        setUsageLoading(true);
        setUsageError(null);
        const summary = await getEnterpriseUsageSummary(usageRange);
        if (!isMounted) return;
        setUsageSummary(summary);
      } catch (err: any) {
        if (!isMounted) return;
        setUsageSummary(null);
        setUsageError(err?.message || 'Failed to load API usage summary');
      } finally {
        if (isMounted) setUsageLoading(false);
      }
    };

    void loadUsageSummary();
    return () => {
      isMounted = false;
    };
  }, [hasAccess, usageRange]);

  useEffect(() => {
    if (!formData.countryId) {
      setStates([]);
      return;
    }

    fetchStates(formData.countryId)
      .then((data) => setStates(data || []))
      .catch(() => setStates([]));
  }, [formData.countryId]);

  const loadData = async (currentUser: typeof user) => {
    try {
      setLoading(true);
      setError(null);
      setAccessGate('none');

      const accessResponse = await checkEnterpriseAccess();
      setAccess(accessResponse);
      setHasAccess(accessResponse.hasAccess);

      if (!accessResponse.hasAccess) {
        setWorkspaces([]);
        setCompliancePolicy(null);
        setComplianceWorkspaceId('');
        if (accessResponse.code === 'ORG_RESTRICTED') {
          setAccessGate('restricted');
          return;
        }
        setAccessGate(
          currentUser?.organizationId ? 'org-upgrade' : 'normal-user',
        );
        return;
      }

      const [
        workspaceResponse,
        profileResponse,
        countriesResponse,
        categoriesResponse,
        complianceResponse,
      ] = await Promise.all([
        getWorkspaces(),
        getEnterpriseProfile(),
        fetchCountries(),
        fetchCategories(),
        getEnterpriseCompliancePolicy().catch(() => null),
      ]);

      setWorkspaces(workspaceResponse.workspaces || []);
      setComplianceWorkspaceId((previous) => {
        const nextWorkspaces = workspaceResponse.workspaces || [];
        if (previous && nextWorkspaces.some((workspace) => workspace.id === previous)) {
          return previous;
        }
        return nextWorkspaces.find((workspace) => workspace.status !== 'DELETED')?.id || '';
      });
      setProfile(profileResponse);
      setCompliancePolicy(complianceResponse?.policy || null);
      setCountries(countriesResponse || []);
      setCategories(categoriesResponse || []);
      setFormData(toProfileForm(profileResponse));
      setLogoPathInput(profileResponse.organization.logo || '');
      setLogoError(false);

      if (profileResponse.organization.countryId) {
        const stateResponse = await fetchStates(
          profileResponse.organization.countryId,
        );
        setStates(stateResponse || []);
      }
    } catch (err: any) {
      if (err instanceof EnterpriseApiError && err.status === 401) {
        if (consumeLogoutRedirectFlag()) {
          router.replace('/');
          return;
        }
        router.replace('/signin?next=/enterprise');
        return;
      }

      if (err instanceof EnterpriseApiError && err.status === 403) {
        if (err.code === 'PASSWORD_CHANGE_REQUIRED') {
          router.replace(buildForcePasswordChangeRoute('/enterprise'));
          return;
        }
        setHasAccess(false);
        if (err.code === 'ORG_RESTRICTED') {
          setAccessGate('restricted');
          return;
        }
        setAccessGate(
          currentUser?.organizationId ? 'org-upgrade' : 'normal-user',
        );
        return;
      }

      console.error('Enterprise dashboard load error:', err);
      setError(err?.message || 'Failed to load enterprise dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkspace = async () => {
    if (workspaceLimitReached) {
      showToast(
        `Limit reached: Workspaces (${workspaceUsage}/${workspaceLimit}). Contact admin to increase quota.`,
        'error',
      );
      return;
    }

    const workspaceName = newWorkspaceName.trim();
    if (workspaceName.length < 2) {
      showToast('Workspace name must be at least 2 characters', 'error');
      return;
    }

    try {
      setCreatingWorkspace(true);
      await createWorkspace(workspaceName);
      setNewWorkspaceName('');
      setShowCreateModal(false);
      showToast('Workspace created', 'success');
      await loadData(user);
    } catch (err: any) {
      if (isLimitReachedError(err)) {
        showToast(formatLimitReachedMessage(err), 'error');
        return;
      }
      showToast(err.message || 'Failed to create workspace', 'error');
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const canManageWorkspaceLifecycle = (workspace: Workspace) => {
    const normalizedRole = normalizeWorkspaceRoleLabel(workspace.role);
    return normalizedRole === 'OWNER' || normalizedRole === 'ADMIN';
  };

  const setWorkspaceStatusLocally = (
    workspaceId: string,
    status: Workspace['status'],
  ) => {
    setWorkspaces((previous) =>
      previous.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, status } : workspace,
      ),
    );
  };

  const handleSuspendWorkspace = async (workspace: Workspace) => {
    if (!canManageWorkspaceLifecycle(workspace)) {
      showToast("You don't have permission to do that.", 'error');
      return;
    }
    try {
      setWorkspaceActionTargetId(workspace.id);
      await suspendWorkspace(workspace.id);
      setWorkspaceStatusLocally(workspace.id, 'SUSPENDED');
      showToast('Workspace suspended', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to suspend workspace', 'error');
    } finally {
      setWorkspaceActionTargetId(null);
    }
  };

  const handleUnsuspendWorkspace = async (workspace: Workspace) => {
    if (!canManageWorkspaceLifecycle(workspace)) {
      showToast("You don't have permission to do that.", 'error');
      return;
    }
    try {
      setWorkspaceActionTargetId(workspace.id);
      await unsuspendWorkspace(workspace.id);
      setWorkspaceStatusLocally(workspace.id, 'ACTIVE');
      showToast('Workspace unsuspended', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to unsuspend workspace', 'error');
    } finally {
      setWorkspaceActionTargetId(null);
    }
  };

  const handleArchiveWorkspace = async (workspace: Workspace) => {
    if (!canManageWorkspaceLifecycle(workspace)) {
      showToast("You don't have permission to do that.", 'error');
      return;
    }
    try {
      setWorkspaceActionTargetId(workspace.id);
      await archiveWorkspace(workspace.id);
      setWorkspaceStatusLocally(workspace.id, 'ARCHIVED');
      showToast('Workspace archived', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to archive workspace', 'error');
    } finally {
      setWorkspaceActionTargetId(null);
    }
  };

  const handleRestoreWorkspace = async (workspace: Workspace) => {
    if (!canManageWorkspaceLifecycle(workspace)) {
      showToast("You don't have permission to do that.", 'error');
      return;
    }
    try {
      setWorkspaceActionTargetId(workspace.id);
      await restoreWorkspace(workspace.id);
      setWorkspaceStatusLocally(workspace.id, 'ACTIVE');
      showToast('Workspace restored', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to restore workspace', 'error');
    } finally {
      setWorkspaceActionTargetId(null);
    }
  };

  const handleCompliancePolicySave = async () => {
    if (!compliancePolicy) {
      showToast('Compliance policy is unavailable', 'error');
      return;
    }
    if (!canEditCompliancePolicy) {
      showToast("You don't have permission to do that.", 'error');
      return;
    }

    try {
      setCompliancePolicySaving(true);
      const response = await updateEnterpriseCompliancePolicy({
        logRetentionDays: compliancePolicy.logRetentionDays,
        requireStrongPasswords: compliancePolicy.requireStrongPasswords,
      });
      setCompliancePolicy(response.policy);
      showToast('Compliance policy updated', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update compliance policy', 'error');
    } finally {
      setCompliancePolicySaving(false);
    }
  };

  const handleLogoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 1 * 1024 * 1024) {
      showToast('File too large (max 1MB)', 'error');
      return;
    }

    try {
      setUploadingLogo(true);
      setLogoError(false);

      const response = await uploadOrgLogo(file);
      const logoPath = response.path || response.url;
      setLogoPathInput(logoPath);
      showToast('Logo uploaded. Save profile to apply changes.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to upload logo', 'error');
    } finally {
      setUploadingLogo(false);
      event.target.value = '';
    }
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!canEditProfile) {
      showToast(
        'You do not have permission to edit enterprise profile',
        'error',
      );
      return;
    }

    if (!formData.name.trim()) {
      showToast('Enterprise name is required', 'error');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      showToast('Valid contact email is required', 'error');
      return;
    }
    if (!formData.website.trim()) {
      showToast('Website is required', 'error');
      return;
    }
    if (!formData.phone.trim()) {
      showToast('Phone is required', 'error');
      return;
    }
    if (!formData.address.trim()) {
      showToast('Address is required', 'error');
      return;
    }
    if (!formData.countryId) {
      showToast('Country is required', 'error');
      return;
    }
    if (!formData.categoryId) {
      showToast('Category is required', 'error');
      return;
    }

    try {
      setSaving(true);
      const response = await updateEnterpriseProfile({
        ...formData,
        stateId: formData.stateId || null,
        logo: logoPathInput || undefined,
      });

      setProfile((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          organization: {
            ...previous.organization,
            ...response.organization,
            billingAccount:
              response.organization?.billingAccount ??
              previous.organization.billingAccount,
          },
          role: response.role,
          canEdit: response.canEdit,
        };
      });
      setFormData((previous) => ({ ...previous }));

      if (response.warning) {
        showToast(response.warning, 'success');
      } else {
        showToast('Enterprise profile updated', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update enterprise profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      setDownloadingInvoiceId(invoiceId);
      await downloadEnterpriseInvoice(invoiceId);
      showToast('Invoice downloaded', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to download invoice', 'error');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const closeDeleteWorkspaceModal = () => {
    if (deletingWorkspaceId) return;
    setDeleteWorkspaceModalOpen(false);
    setDeleteWorkspaceTarget(null);
    setDeleteWorkspaceStep('CONFIRM_TIMER');
    setDeleteWorkspaceCountdown(10);
    setDeleteWorkspacePassword('');
    setShowDeleteWorkspacePassword(false);
  };

  useEffect(() => {
    if (!deleteWorkspaceModalOpen || deleteWorkspaceStep !== 'CONFIRM_TIMER') {
      return;
    }

    setDeleteWorkspaceCountdown(10);
    const intervalId = window.setInterval(() => {
      setDeleteWorkspaceCountdown((previous) => {
        if (previous <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [deleteWorkspaceModalOpen, deleteWorkspaceStep]);

  const handleDeleteWorkspace = (workspace: Workspace) => {
    const normalizedRole = normalizeWorkspaceRoleLabel(workspace.role);
    if (normalizedRole !== 'OWNER') {
      showToast("You don't have permission to do that.", 'error');
      return;
    }

    setDeleteWorkspaceTarget(workspace);
    setDeleteWorkspaceStep('CONFIRM_TIMER');
    setDeleteWorkspacePassword('');
    setShowDeleteWorkspacePassword(false);
    setDeleteWorkspaceModalOpen(true);
  };

  const handleDeleteWorkspaceTimerConfirm = () => {
    if (deleteWorkspaceCountdown > 0) return;
    setDeleteWorkspaceStep('PASSWORD_CONFIRM');
  };

  const handleDeleteWorkspaceConfirmed = async () => {
    if (!deleteWorkspaceTarget) return;
    if (!deleteWorkspacePassword.trim()) {
      showToast('Password is required', 'error');
      return;
    }

    try {
      setDeletingWorkspaceId(deleteWorkspaceTarget.id);
      await deleteWorkspace(deleteWorkspaceTarget.id, {
        password: deleteWorkspacePassword,
      });
      setWorkspaces((prev) =>
        prev.filter((item) => item.id !== deleteWorkspaceTarget.id),
      );
      closeDeleteWorkspaceModal();
      showToast('Workspace deleted', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete workspace', 'error');
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <main className='min-h-screen bg-app pb-20'>
        <div className='w-full px-4 py-24'>
          <div className='flex items-center justify-center py-32'>
            <Loader2 className='w-8 h-8 animate-spin text-blue-500' />
          </div>
        </div>
      </main>
    );
  }

  if (accessGate === 'normal-user') {
    return (
      <main className='min-h-screen bg-app pb-20'>
        <div className='w-full px-4 py-20'>
          <div className='surface-card rounded-2xl p-10 text-center max-w-3xl mx-auto border border-[var(--app-border)] shadow-lg'>
            <div className='w-20 h-20 rounded-full surface-card flex items-center justify-center mx-auto mb-6'>
              <Lock className='w-10 h-10 text-slate-400' />
            </div>
            <h1 className='text-3xl font-bold text-slate-900 dark:text-white mb-4'>
              Enterprise Account Required
            </h1>
            <p className='text-slate-600 dark:text-slate-400 mb-8'>
              This area is for Enterprise workspaces. Please sign in with an
              Enterprise workspace account.
            </p>
            <div className='flex flex-col sm:flex-row items-center justify-center gap-3'>
              <button
                type='button'
                onClick={() => router.push('/signin')}
                className='px-6 py-3 btn-primary font-semibold rounded-lg w-full sm:w-auto'
              >
                Go to Sign In
              </button>
              <button
                type='button'
                onClick={() => router.push('/')}
                className='px-6 py-3 rounded-lg border border-[var(--app-border)] text-slate-700 dark:text-slate-200 font-semibold w-full sm:w-auto'
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!hasAccess) {
    if (accessGate === 'restricted') {
      return (
        <main className='min-h-screen bg-app pb-20'>
          <div className='w-full px-4 py-20'>
            <div className='surface-card rounded-2xl p-10 text-center max-w-3xl mx-auto border border-[var(--app-border)] shadow-lg'>
              <div className='w-20 h-20 rounded-full surface-card flex items-center justify-center mx-auto mb-6'>
                <Ban className='w-10 h-10 text-red-500' />
              </div>
              <h1 className='text-3xl font-bold text-slate-900 dark:text-white mb-4'>
                Enterprise Dashboard Restricted
              </h1>
              <p className='text-slate-600 dark:text-slate-400 mb-8'>
                This enterprise account is currently restricted. Workspace and management actions are view-only until the restriction is removed.
              </p>
              <button
                onClick={() => router.push('/')}
                className='px-6 py-3 btn-primary font-semibold rounded-lg'
              >
                Back to Home
              </button>
            </div>
          </div>
        </main>
      );
    }

    return (
      <main className='min-h-screen bg-app pb-20'>
        <div className='w-full px-4 py-20'>
          <div className='surface-card rounded-2xl p-10 text-center max-w-3xl mx-auto border border-[var(--app-border)] shadow-lg'>
            <div className='w-20 h-20 rounded-full surface-card flex items-center justify-center mx-auto mb-6'>
              <Lock className='w-10 h-10 text-slate-400' />
            </div>
            <h1 className='text-3xl font-bold text-slate-900 dark:text-white mb-4'>
              Enterprise Access Required
            </h1>
            <p className='text-slate-600 dark:text-slate-400 mb-8'>
              The Enterprise Dashboard is available for organizations on an
              active Enterprise plan. Upgrade your plan to unlock workspaces,
              API keys, and multi-organization analytics.
            </p>
            <button
              onClick={() => router.push('/pricing')}
              className='px-6 py-3 btn-primary font-semibold rounded-lg'
            >
              View Plans
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className='min-h-screen bg-app pb-20'>
      <div className='bg-glow pt-6 pb-10'>
        <div className='w-full px-4'>
          <div className='surface-card rounded-2xl p-6 shadow-lg border border-[var(--app-border)]'>
            <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-6'>
              <div className='flex items-start gap-4 min-w-0'>
                <div className='w-16 h-16 md:w-[72px] md:h-[72px] rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center overflow-hidden shrink-0 shadow-lg shadow-blue-500/20 border-2 border-white/20'>
                  {logoPathInput ? (
                    <img
                      src={logoPathInput}
                      alt={profile?.organization.name || 'Enterprise'}
                      className='w-full h-full object-cover'
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className='text-2xl md:text-3xl font-bold text-white'>
                      {profile?.organization.name?.charAt(0).toUpperCase() ||
                        'E'}
                    </span>
                  )}
                </div>
                <div className='space-y-2 min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h1 className='text-xl md:text-2xl font-semibold text-slate-900 dark:text-white truncate'>
                      {profile?.organization.name || 'Enterprise'}
                    </h1>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleBadgeClass(profile?.role)}`}
                    >
                      {profile?.role || 'MEMBER'}
                    </span>
                    <span className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600/50'>
                      <CreditCard className='w-3 h-3' />
                      {profile?.organization.planType || 'ENTERPRISE'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                        profile?.organization.isRestricted
                          ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                          : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                      }`}
                    >
                      {profile?.organization.isRestricted ? (
                        <>
                          <Ban className='w-3 h-3' />
                          Restricted
                        </>
                      ) : (
                        <>
                          <CheckCircle className='w-3 h-3' />
                          Active
                        </>
                      )}
                    </span>
                  </div>

                  <a
                    href={profile?.organization.website || '#'}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group'
                  >
                    <Globe className='w-4 h-4' />
                    <span className='truncate max-w-[220px] md:max-w-[340px]'>
                      {profile?.organization.website || 'No website'}
                    </span>
                    <ExternalLink className='w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity' />
                  </a>
                </div>
              </div>

              <div className='flex flex-col items-start md:items-end gap-1.5 md:text-right'>
                <p className='text-xs text-slate-500 dark:text-slate-400'>
                  {renewalLabel}
                </p>
                {apiLimitSummary && (
                  <p className='text-xs text-slate-500 dark:text-slate-400'>
                    {apiLimitSummary}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className='w-full px-4 -mt-4'>
        <div className='surface-card rounded-xl overflow-hidden shadow-xl min-h-[640px] flex flex-col md:flex-row border border-[var(--app-border)]'>
          <div className='w-full md:w-64 bg-slate-50/50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-700 p-4 space-y-2'>
            <button
              onClick={() => updateDashboardSection('overview')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === 'overview'
                  ? 'btn-primary shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutDashboard className='w-5 h-5' />
              <span className='font-medium'>Overview</span>
            </button>
            <button
              onClick={() => updateDashboardSection('billing')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === 'billing'
                  ? 'btn-primary shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CreditCard className='w-5 h-5' />
              <span className='font-medium'>Billing</span>
            </button>
            <button
              onClick={openWorkspaceList}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === 'workspaces'
                  ? 'btn-primary shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building2 className='w-5 h-5' />
              <span className='font-medium'>Workspaces</span>
            </button>
            <button
              onClick={() => openWorkspaceTab('members')}
              disabled={membersTabWorkspaces.length === 0}
              className='w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'
            >
              <Users className='w-5 h-5' />
              <span className='font-medium'>Members</span>
            </button>
            <button
              onClick={() => openWorkspaceTab('api-keys')}
              disabled={apiKeysTabWorkspaces.length === 0}
              className='w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'
            >
              <Key className='w-5 h-5' />
              <span className='font-medium'>API Keys</span>
            </button>
            <button
              onClick={() => updateDashboardSection('compliance')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === 'compliance'
                  ? 'btn-primary shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Shield className='w-5 h-5' />
              <span className='font-medium'>Compliance</span>
            </button>
            <button
              onClick={() => updateDashboardSection('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === 'settings'
                  ? 'btn-primary shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Settings className='w-5 h-5' />
              <span className='font-medium'>Enterprise Profile</span>
            </button>
          </div>

          <div className='flex-1 p-6 md:p-8 bg-white dark:bg-transparent'>
            {error && (
              <div className='mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm'>
                {error}
              </div>
            )}

            {activeTab === 'overview' && (
              <div className='space-y-8'>
                <section>
                  <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2'>
                    <Boxes className='w-5 h-5 text-blue-500' />
                    Usage Overview
                  </h2>
                  <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'>
                    <MetricCard
                      icon={Boxes}
                      label='Workspaces'
                      value={workspaces.length}
                      color='text-blue-500'
                    />
                    <MetricCard
                      icon={Building2}
                      label='Linked Organizations'
                      value={totalOrganizations}
                      color='text-purple-500'
                    />
                    <MetricCard
                      icon={Key}
                      label='API Keys'
                      value={totalApiKeys}
                      color='text-amber-500'
                    />
                    <MetricCard
                      icon={Users}
                      label='Members'
                      value={totalMembers}
                      color='text-emerald-500'
                    />
                  </div>
                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4'>
                    <SmallStateCard
                      label='Active'
                      value={activeWorkspaceCount}
                    />
                    <SmallStateCard
                      label='Suspended'
                      value={suspendedWorkspaceCount}
                    />
                    <SmallStateCard
                      label='Archived'
                      value={archivedWorkspaceCount}
                    />
                  </div>
                </section>

                <section>
                  <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2'>
                    <Clock className='w-5 h-5 text-blue-500' />
                    Recent Activity
                  </h2>
                  <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <div className='surface-card rounded-xl p-5 border border-[var(--app-border)]'>
                      <h3 className='text-sm font-semibold text-slate-900 dark:text-white mb-3'>
                        Recent Workspace Activity
                      </h3>
                      {recentWorkspaces.length === 0 ? (
                        <p className='text-sm text-slate-500 dark:text-slate-400'>
                          No workspace activity yet.
                        </p>
                      ) : (
                        <ul className='space-y-2'>
                          {recentWorkspaces.map((workspace) => (
                            <li
                              key={workspace.id}
                              className='text-sm text-slate-600 dark:text-slate-400 flex items-center justify-between gap-2'
                            >
                              <span className='truncate'>{workspace.name}</span>
                              <span className='text-xs text-slate-400 dark:text-slate-500 shrink-0'>
                                {new Date(
                                  workspace.createdAt,
                                ).toLocaleDateString()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className='surface-card rounded-xl p-5 border border-[var(--app-border)]'>
                      <div className='flex items-center justify-between gap-3 mb-3'>
                        <h3 className='text-sm font-semibold text-slate-900 dark:text-white'>
                          Recent API Usage
                        </h3>
                        <div className='inline-flex rounded-lg border border-[var(--app-border)] overflow-hidden'>
                          {(['7d', '30d', '90d'] as const).map((range) => (
                            <button
                              key={range}
                              type='button'
                              onClick={() => setUsageRange(range)}
                              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                                usageRange === range
                                  ? 'bg-[#187DE9] text-white'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-[var(--app-surface-hover)]'
                              }`}
                            >
                              {range}
                            </button>
                          ))}
                        </div>
                      </div>

                      {usageLoading ? (
                        <div className='space-y-2 animate-pulse'>
                          <div className='h-7 w-32 rounded bg-[var(--app-surface-hover)]' />
                          <div className='h-4 w-48 rounded bg-[var(--app-surface-hover)]' />
                        </div>
                      ) : usageError ? (
                        <p className='text-sm text-red-600 dark:text-red-400'>
                          {usageError}
                        </p>
                      ) : usageSummary?.meta.linkedOrganizationCount === 0 ? (
                        <p className='text-sm text-slate-500 dark:text-slate-400'>
                          No linked organizations yet.
                        </p>
                      ) : (usageSummary?.totals.requests || 0) === 0 ? (
                        <p className='text-sm text-slate-500 dark:text-slate-400'>
                          No API usage recorded for this period.
                        </p>
                      ) : (
                        <div className='space-y-3'>
                          <div>
                            <p className='text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide'>
                              Total Requests
                            </p>
                            <p className='text-2xl font-semibold text-slate-900 dark:text-white'>
                              {(
                                usageSummary?.totals.requests || 0
                              ).toLocaleString()}
                            </p>
                          </div>
                          <div className='grid grid-cols-3 gap-2'>
                            <div className='rounded-lg border border-[var(--app-border)] px-2.5 py-2'>
                              <p className='text-[11px] text-slate-500 dark:text-slate-400'>
                                Success
                              </p>
                              <p className='text-sm font-medium text-emerald-600 dark:text-emerald-400'>
                                {(
                                  usageSummary?.totals.success || 0
                                ).toLocaleString()}
                              </p>
                            </div>
                            <div className='rounded-lg border border-[var(--app-border)] px-2.5 py-2'>
                              <p className='text-[11px] text-slate-500 dark:text-slate-400'>
                                Errors
                              </p>
                              <p className='text-sm font-medium text-red-600 dark:text-red-400'>
                                {(
                                  usageSummary?.totals.errors || 0
                                ).toLocaleString()}
                              </p>
                            </div>
                            <div className='rounded-lg border border-[var(--app-border)] px-2.5 py-2'>
                              <p className='text-[11px] text-slate-500 dark:text-slate-400'>
                                Rate Limited
                              </p>
                              <p className='text-sm font-medium text-amber-600 dark:text-amber-400'>
                                {(
                                  usageSummary?.totals.rateLimited || 0
                                ).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2'>
                    <BarChart3 className='w-5 h-5 text-blue-500' />
                    Quick Access
                  </h2>
                  <div className='surface-card rounded-xl p-5 border border-[var(--app-border)]'>
                    <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                      <button
                        onClick={openWorkspaceList}
                        className='w-full text-left px-4 py-3 rounded-lg border border-[var(--app-border)] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors'
                      >
                        <span className='text-sm font-semibold'>
                          Go to Workspaces
                        </span>
                      </button>
                      <button
                        onClick={() => openWorkspaceTab('api-keys')}
                        disabled={apiKeysTabWorkspaces.length === 0}
                        className='w-full text-left px-4 py-3 rounded-lg border border-[var(--app-border)] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                      >
                        <span className='text-sm font-semibold'>
                          Go to API Keys
                        </span>
                      </button>
                      <button
                        onClick={() => openWorkspaceTab('members')}
                        disabled={membersTabWorkspaces.length === 0}
                        className='w-full text-left px-4 py-3 rounded-lg border border-[var(--app-border)] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                      >
                        <span className='text-sm font-semibold'>
                          Go to Members
                        </span>
                      </button>
                    </div>
                    {navigableWorkspaces.length === 0 && (
                      <p className='mt-3 text-xs text-slate-500 dark:text-slate-400'>
                        Create a workspace from the Workspaces section to access
                        API Keys and Members.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'billing' && (
              <div className='space-y-6'>
                <div>
                  <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2'>
                    <CreditCard className='w-5 h-5 text-blue-500' />
                    Billing
                  </h2>
                  <p className='text-sm text-slate-500 dark:text-slate-400'>
                    Review enterprise plan status, current entitlements, and
                    billing controls.
                  </p>
                </div>

                <div className='surface-card rounded-xl p-6 border border-[var(--app-border)]'>
                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                    <div className='surface-card rounded-lg border border-[var(--app-border)] p-3'>
                      <p className='text-xs text-slate-500 dark:text-slate-400'>
                        Plan
                      </p>
                      <p className='text-lg font-semibold text-slate-900 dark:text-white'>
                        {profile?.organization.planType || 'ENTERPRISE'}
                      </p>
                    </div>
                    <SmallStateCard
                      label='API Keys / Workspace'
                      value={access?.entitlements?.maxApiKeys || 0}
                    />
                    <SmallStateCard
                      label='Linked Orgs / Workspace'
                      value={access?.entitlements?.maxLinkedOrgs || 0}
                    />
                  </div>

                  <div className='mt-5 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400'>
                    <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600/50'>
                      <CreditCard className='w-3.5 h-3.5' />
                      {profile?.organization.planType || 'ENTERPRISE'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${
                        profile?.organization.isRestricted
                          ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20'
                          : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                      }`}
                    >
                      {profile?.organization.isRestricted ? (
                        <>
                          <Ban className='w-3.5 h-3.5' />
                          Restricted
                        </>
                      ) : (
                        <>
                          <CheckCircle className='w-3.5 h-3.5' />
                          Active
                        </>
                      )}
                    </span>
                  </div>

                  <div className='mt-6'>
                    <div className='flex flex-wrap items-center gap-3'>
                      <button
                        onClick={() => router.push('/org/upgrade')}
                        className='inline-flex items-center gap-2 px-4 py-2 btn-primary text-sm font-medium rounded-lg'
                      >
                        <ExternalLink className='w-4 h-4' />
                        Manage Plan
                      </button>
                      <button
                        type='button'
                        onClick={() =>
                          latestInvoice &&
                          handleDownloadInvoice(latestInvoice.id)
                        }
                        disabled={
                          !latestInvoice ||
                          !!downloadingInvoiceId ||
                          !canEditProfile
                        }
                        className='inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed'
                      >
                        {downloadingInvoiceId &&
                        latestInvoice?.id === downloadingInvoiceId ? (
                          <Loader2 className='w-4 h-4 animate-spin' />
                        ) : (
                          <CreditCard className='w-4 h-4' />
                        )}
                        Invoice
                      </button>
                    </div>
                  </div>
                </div>

                <div className='surface-card rounded-xl p-6 border border-[var(--app-border)]'>
                  <h3 className='text-lg font-semibold text-slate-900 dark:text-white mb-4'>
                    Invoice History
                  </h3>
                  {invoices.length ? (
                    <div className='space-y-3'>
                      {invoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          className='flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-[var(--app-border)] rounded-lg p-4'
                        >
                          <div>
                            <div className='text-sm font-semibold text-slate-900 dark:text-white'>
                              {invoice.invoiceNumber || invoice.id}
                            </div>
                            <div className='text-xs text-slate-500 dark:text-slate-400'>
                              {new Date(invoice.createdAt).toLocaleDateString()}{' '}
                              · {(invoice.amountCents / 100).toFixed(2)}{' '}
                              {invoice.currency}
                            </div>
                          </div>
                          <div className='flex items-center gap-3'>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${invoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : invoice.status === 'OPEN' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                            >
                              {invoice.status}
                            </span>
                            <button
                              type='button'
                              onClick={() => handleDownloadInvoice(invoice.id)}
                              disabled={
                                !canEditProfile ||
                                downloadingInvoiceId === invoice.id
                              }
                              className='text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:no-underline'
                            >
                              {downloadingInvoiceId === invoice.id
                                ? 'Downloading...'
                                : 'Download PDF'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className='text-sm text-slate-500 dark:text-slate-400'>
                      No invoices yet.
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'workspaces' && (
              <div className='space-y-8'>
                <section>
                  <div className='flex items-center justify-between mb-4 gap-3'>
                    <h2 className='text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2'>
                      <Building2 className='w-5 h-5 text-blue-500' />
                      Workspaces
                    </h2>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      disabled={workspaceLimitReached}
                      className='inline-flex items-center gap-2 px-4 py-2 text-sm font-medium btn-primary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed'
                    >
                      <Plus className='w-4 h-4' />
                      Create Workspace
                    </button>
                  </div>

                  {workspaces.length === 0 ? (
                    <div className='surface-card rounded-xl p-10 border border-[var(--app-border)] text-center'>
                      <Boxes className='w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4' />
                      <p className='text-slate-600 dark:text-slate-400 mb-4'>
                        No workspaces yet. Create your first workspace to start
                        managing organizations and API access.
                      </p>
                      <button
                        onClick={() => setShowCreateModal(true)}
                        disabled={workspaceLimitReached}
                        className='inline-flex items-center gap-2 px-4 py-2 text-sm font-medium btn-primary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed'
                      >
                        <Plus className='w-4 h-4' />
                        Create Workspace
                      </button>
                      {workspaceLimitReached && (
                        <p className='mt-3 text-xs text-amber-600 dark:text-amber-400'>
                          Workspace quota reached ({workspaceUsage}/
                          {workspaceLimit}).
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className='overflow-hidden rounded-xl border border-[var(--app-border)]'>
                      <div className='divide-y divide-slate-200 dark:divide-slate-700'>
                        {workspaces.map((workspace) => (
                          <div
                            key={workspace.id}
                            className='w-full text-left px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 surface-card hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors'
                          >
                            <div className='min-w-0'>
                              <div className='flex items-center gap-2 flex-wrap'>
                                <h3 className='font-semibold text-slate-900 dark:text-white truncate'>
                                  {workspace.name}
                                </h3>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadgeClass(workspace.role)}`}
                                >
                                  {normalizeWorkspaceRoleLabel(
                                    workspace.role,
                                  ) || workspace.role}
                                </span>
                              </div>
                              <div className='mt-1 text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3'>
                                <span>{workspace.orgCount} orgs</span>
                                <span>{workspace.memberCount} members</span>
                                <span>{workspace.apiKeyCount} API keys</span>
                                <span>Status: {workspace.status}</span>
                              </div>
                            </div>
                            <div className='flex items-center gap-2 self-start md:self-center'>
                              {canManageWorkspaceLifecycle(workspace) &&
                                workspace.status === 'ACTIVE' && (
                                  <>
                                    <button
                                      type='button'
                                      onClick={() =>
                                        handleSuspendWorkspace(workspace)
                                      }
                                      disabled={
                                        workspaceActionTargetId === workspace.id
                                      }
                                      title='Suspend workspace'
                                      aria-label='Suspend workspace'
                                      className='inline-flex items-center justify-center w-8 h-8 rounded-md text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed'
                                    >
                                      {workspaceActionTargetId === workspace.id ? (
                                        <Loader2 className='w-4 h-4 animate-spin' />
                                      ) : (
                                        <PauseCircle className='w-4 h-4' />
                                      )}
                                    </button>
                                    <button
                                      type='button'
                                      onClick={() =>
                                        handleArchiveWorkspace(workspace)
                                      }
                                      disabled={
                                        workspaceActionTargetId === workspace.id
                                      }
                                      title='Archive workspace'
                                      aria-label='Archive workspace'
                                      className='inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed'
                                    >
                                      {workspaceActionTargetId === workspace.id ? (
                                        <Loader2 className='w-4 h-4 animate-spin' />
                                      ) : (
                                        <Archive className='w-4 h-4' />
                                      )}
                                    </button>
                                  </>
                                )}
                              {canManageWorkspaceLifecycle(workspace) &&
                                workspace.status === 'SUSPENDED' && (
                                  <button
                                    type='button'
                                    onClick={() =>
                                      handleUnsuspendWorkspace(workspace)
                                    }
                                    disabled={workspaceActionTargetId === workspace.id}
                                    title='Unsuspend workspace'
                                    aria-label='Unsuspend workspace'
                                    className='inline-flex items-center justify-center w-8 h-8 rounded-md text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed'
                                  >
                                    {workspaceActionTargetId === workspace.id ? (
                                      <Loader2 className='w-4 h-4 animate-spin' />
                                    ) : (
                                      <PlayCircle className='w-4 h-4' />
                                    )}
                                  </button>
                                )}
                              {canManageWorkspaceLifecycle(workspace) &&
                                workspace.status === 'ARCHIVED' && (
                                  <button
                                    type='button'
                                    onClick={() =>
                                      handleRestoreWorkspace(workspace)
                                    }
                                    disabled={workspaceActionTargetId === workspace.id}
                                    title='Restore workspace'
                                    aria-label='Restore workspace'
                                    className='inline-flex items-center justify-center w-8 h-8 rounded-md text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed'
                                  >
                                    {workspaceActionTargetId === workspace.id ? (
                                      <Loader2 className='w-4 h-4 animate-spin' />
                                    ) : (
                                      <PlayCircle className='w-4 h-4' />
                                    )}
                                  </button>
                                )}
                              {normalizeWorkspaceRoleLabel(workspace.role) ===
                                'OWNER' && (
                                <button
                                  type='button'
                                  onClick={() =>
                                    handleDeleteWorkspace(workspace)
                                  }
                                  disabled={deletingWorkspaceId === workspace.id}
                                  title='Delete workspace'
                                  aria-label='Delete workspace'
                                  className='inline-flex items-center justify-center w-8 h-8 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed'
                                >
                                  {deletingWorkspaceId === workspace.id ? (
                                    <Loader2 className='w-4 h-4 animate-spin' />
                                  ) : (
                                    <Trash2 className='w-4 h-4' />
                                  )}
                                </button>
                              )}
                              <button
                                type='button'
                                onClick={() =>
                                  router.push(`/enterprise/${workspace.id}`)
                                }
                                className='text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline'
                              >
                                Open Workspace
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'compliance' && (
              <div className='space-y-8'>
                <section className='surface-card rounded-xl p-6 border border-[var(--app-border)]'>
                  <div className='flex items-start justify-between gap-3 mb-4'>
                    <div>
                      <h2 className='text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2'>
                        <Shield className='w-5 h-5 text-blue-500' />
                        Compliance Policy
                      </h2>
                      <p className='text-sm text-slate-500 dark:text-slate-400 mt-1'>
                        Configure enterprise compliance defaults and retention.
                      </p>
                    </div>
                  </div>

                  {!canEditCompliancePolicy && (
                    <div className='mb-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200'>
                      Policy settings are editable by workspace OWNER and Super Admin only.
                    </div>
                  )}

                  {compliancePolicy ? (
                    <div className='space-y-4'>
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                        <label className='space-y-1'>
                          <span className='text-sm font-medium text-slate-700 dark:text-slate-300'>
                            Log Retention (days)
                          </span>
                          <input
                            type='number'
                            min={7}
                            max={3650}
                            value={compliancePolicy.logRetentionDays}
                            onChange={(event) =>
                              setCompliancePolicy((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      logRetentionDays: Number(event.target.value || 90),
                                    }
                                  : previous,
                              )
                            }
                            disabled={!canEditCompliancePolicy || compliancePolicySaving}
                            className='w-full rounded-lg border border-[var(--app-border)] bg-transparent px-3 py-2 text-sm text-[var(--app-text-primary)] disabled:opacity-60 disabled:cursor-not-allowed'
                          />
                        </label>
                        <label className='rounded-lg border border-[var(--app-border)] p-3 flex items-center justify-between gap-3'>
                          <span className='text-sm font-medium text-slate-700 dark:text-slate-300'>
                            Require Strong Passwords
                          </span>
                          <input
                            type='checkbox'
                            checked={compliancePolicy.requireStrongPasswords}
                            onChange={(event) =>
                              setCompliancePolicy((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      requireStrongPasswords: event.target.checked,
                                    }
                                  : previous,
                              )
                            }
                            disabled={!canEditCompliancePolicy || compliancePolicySaving}
                            className='h-4 w-4 accent-blue-600 disabled:opacity-60 disabled:cursor-not-allowed'
                          />
                        </label>
                      </div>

                      <div className='flex justify-end'>
                        <button
                          type='button'
                          onClick={handleCompliancePolicySave}
                          disabled={!canEditCompliancePolicy || compliancePolicySaving}
                          className='inline-flex items-center gap-2 px-4 py-2 text-sm font-medium btn-primary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                          {compliancePolicySaving && (
                            <Loader2 className='w-4 h-4 animate-spin' />
                          )}
                          Save Policy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className='text-sm text-slate-500 dark:text-slate-400'>
                      Compliance policy is currently unavailable.
                    </p>
                  )}
                </section>

                <section>
                  <div className='flex items-center justify-between gap-3 mb-4'>
                    <h3 className='text-lg font-semibold text-slate-900 dark:text-white'>
                      Workspace Audit Logs
                    </h3>
                    {workspaces.length > 0 && (
                      <select
                        value={complianceWorkspaceId}
                        onChange={(event) => setComplianceWorkspaceId(event.target.value)}
                        className='rounded-lg border border-[var(--app-border)] bg-transparent px-3 py-2 text-sm text-[var(--app-text-primary)]'
                      >
                        {workspaces
                          .filter((workspace) => workspace.status !== 'DELETED')
                          .map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>

                  {!complianceWorkspace ? (
                    <div className='surface-card rounded-xl p-6 border border-[var(--app-border)] text-sm text-slate-500 dark:text-slate-400'>
                      Create or select a workspace to review compliance audit logs.
                    </div>
                  ) : (
                    <SecuritySection
                      workspaceId={complianceWorkspace.id}
                      workspace={complianceWorkspace}
                      userRole={normalizeWorkspaceRoleLabel(complianceWorkspace.role) || complianceWorkspace.role}
                      enterpriseAccess={access}
                      showToast={showToast}
                    />
                  )}
                </section>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className='space-y-6'>
                <div>
                  <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2'>
                    <Settings className='w-5 h-5 text-blue-500' />
                    Enterprise Profile
                  </h2>
                  <p className='text-sm text-slate-500 dark:text-slate-400'>
                    Update enterprise information used across workspace and
                    directory views.
                  </p>
                </div>

                {!canEditProfile && (
                  <div className='bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-4 flex gap-3 text-amber-800 dark:text-amber-200 text-sm'>
                    <Lock className='w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400' />
                    <p>
                      You have view-only access. Only workspace OWNER or ADMIN
                      can edit enterprise profile settings.
                    </p>
                  </div>
                )}

                <form onSubmit={handleSaveSettings} className='space-y-6'>
                  <fieldset
                    disabled={!canEditProfile || saving}
                    className='space-y-6'
                  >
                    <div className='space-y-4'>
                      <label className='text-sm font-medium text-slate-700 dark:text-slate-300 block'>
                        Enterprise Logo
                      </label>
                      <div className='flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6'>
                        <div className='w-24 h-24 md:w-28 md:h-28 rounded-lg surface-card flex items-center justify-center overflow-hidden shrink-0 relative'>
                          {logoPathInput ? (
                            <img
                              key={logoPathInput}
                              src={logoPathInput}
                              alt='Enterprise logo'
                              className='w-full h-full object-cover'
                              onError={() => setLogoError(true)}
                            />
                          ) : (
                            <Building2 className='w-8 h-8 text-slate-400' />
                          )}
                          {logoPathInput && logoError && (
                            <div className='absolute inset-0 bg-red-500/10 backdrop-blur-sm flex items-center justify-center'>
                              <X className='w-6 h-6 text-red-500' />
                            </div>
                          )}
                        </div>

                        <label
                          className={`flex flex-col items-center justify-center w-full md:w-72 h-24 md:h-28 border-2 border-dashed rounded-lg transition-colors p-3 ${
                            canEditProfile
                              ? 'cursor-pointer border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                              : 'cursor-not-allowed border-slate-200 dark:border-slate-800 opacity-60'
                          }`}
                        >
                          <div className='flex flex-col items-center justify-center text-center'>
                            {uploadingLogo ? (
                              <Loader2 className='w-5 h-5 text-blue-500 animate-spin mb-1' />
                            ) : (
                              <Upload className='w-5 h-5 text-slate-400 mb-1' />
                            )}
                            <p className='text-sm text-slate-500 dark:text-slate-400 leading-tight'>
                              <span className='font-semibold'>Upload logo</span>
                            </p>
                            <p className='text-[10px] text-slate-400 dark:text-slate-500 mt-0.5'>
                              SVG, PNG, JPG (max 1MB)
                            </p>
                          </div>
                          <input
                            type='file'
                            className='hidden'
                            accept='image/*'
                            onChange={handleLogoUpload}
                            disabled={!canEditProfile || uploadingLogo}
                          />
                        </label>
                      </div>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <InputField
                        label='Enterprise Name'
                        value={formData.name}
                        onChange={(value) =>
                          setFormData((prev) => ({ ...prev, name: value }))
                        }
                        icon={Building2}
                      />
                      <InputField
                        label='Contact Email'
                        value={formData.email}
                        onChange={(value) =>
                          setFormData((prev) => ({ ...prev, email: value }))
                        }
                        icon={Mail}
                        type='email'
                      />
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <InputField
                        label='Website'
                        value={formData.website}
                        onChange={(value) =>
                          setFormData((prev) => ({ ...prev, website: value }))
                        }
                        icon={Globe}
                      />
                      <InputField
                        label='Phone'
                        value={formData.phone}
                        onChange={(value) =>
                          setFormData((prev) => ({ ...prev, phone: value }))
                        }
                        icon={Clock}
                      />
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <SelectField
                        label='Country'
                        value={formData.countryId}
                        onChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            countryId: value,
                            stateId: '',
                          }))
                        }
                        icon={MapPin}
                        options={countries.map((country) => ({
                          value: country.id,
                          label: country.name,
                        }))}
                      />
                      <SelectField
                        label='State'
                        value={formData.stateId}
                        onChange={(value) =>
                          setFormData((prev) => ({ ...prev, stateId: value }))
                        }
                        icon={MapPin}
                        disabled={!formData.countryId}
                        options={states.map((state) => ({
                          value: state.id,
                          label: state.name,
                        }))}
                        allowEmpty
                      />
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <SelectField
                        label='Category'
                        value={formData.categoryId}
                        onChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            categoryId: value,
                          }))
                        }
                        icon={BarChart3}
                        options={categories.map((category) => ({
                          value: category.id,
                          label: category.name,
                        }))}
                      />
                      <InputField
                        label='Address'
                        value={formData.address}
                        onChange={(value) =>
                          setFormData((prev) => ({ ...prev, address: value }))
                        }
                        icon={MapPin}
                      />
                    </div>

                    <div className='space-y-2'>
                      <label className='text-sm font-medium text-slate-700 dark:text-slate-300'>
                        About Enterprise
                      </label>
                      <textarea
                        value={formData.about}
                        onChange={(event) =>
                          setFormData((prev) => ({
                            ...prev,
                            about: event.target.value,
                          }))
                        }
                        className='w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24'
                        placeholder='Brief description of your enterprise'
                      />
                    </div>

                    {canEditProfile && (
                      <div>
                        <button
                          type='submit'
                          disabled={saving}
                          className='inline-flex items-center gap-2 px-6 py-2.5 btn-primary font-medium rounded-lg'
                        >
                          {saving ? (
                            <Loader2 className='w-4 h-4 animate-spin' />
                          ) : null}
                          Save Changes
                        </button>
                      </div>
                    )}
                  </fieldset>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
          <div className='bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-6 border border-[var(--app-border)]'>
            <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-4'>
              Create Workspace
            </h2>
            <p className='text-slate-600 dark:text-slate-400 mb-6 text-sm'>
              A workspace groups organizations, members, API keys, and analytics
              controls.
            </p>
            <div className='mb-6'>
              <label className='block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2'>
                Workspace Name
              </label>
              <input
                type='text'
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder='My Enterprise Workspace'
                className='w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                autoFocus
                disabled={workspaceLimitReached}
              />
            </div>
            {workspaceLimitReached && (
              <p className='mb-4 text-xs text-amber-600 dark:text-amber-400'>
                Limit reached: Workspaces ({workspaceUsage}/{workspaceLimit}).
                Contact admin to increase quota.
              </p>
            )}
            <div className='flex gap-3'>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewWorkspaceName('');
                }}
                className='flex-1 px-4 py-2.5 border border-[var(--app-border)] text-[var(--app-text-secondary)] font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors'
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={
                  workspaceLimitReached ||
                  creatingWorkspace ||
                  newWorkspaceName.trim().length < 2
                }
                className='flex-1 px-4 py-2.5 btn-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2'
              >
                {creatingWorkspace ? (
                  <>
                    <Loader2 className='w-4 h-4 animate-spin' />
                    Creating...
                  </>
                ) : (
                  'Create Workspace'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {workspacePickerOpen && workspacePickerTab && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
          <div className='bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-6 border border-[var(--app-border)]'>
            <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-2'>
              Select Workspace
            </h2>
            <p className='text-slate-600 dark:text-slate-400 mb-5 text-sm'>
              Choose a workspace to open{' '}
              {workspacePickerTab === 'members' ? 'Members' : 'API Keys'}.
            </p>
            <div className='space-y-2 max-h-72 overflow-y-auto mb-5'>
              {workspacePickerOptions.map((workspace) => (
                <button
                  key={workspace.id}
                  type='button'
                  onClick={() =>
                    selectWorkspaceForTab(workspace.id, workspacePickerTab)
                  }
                  className='w-full text-left rounded-lg border border-[var(--app-border)] px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors'
                >
                  <div className='flex items-center justify-between gap-3'>
                    <span className='text-sm font-semibold text-slate-900 dark:text-white truncate'>
                      {workspace.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${roleBadgeClass(workspace.role)}`}
                    >
                      {normalizeWorkspaceRoleLabel(workspace.role) ||
                        workspace.role}
                    </span>
                  </div>
                  <div className='mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3'>
                    <span>{workspace.memberCount} members</span>
                    <span>{workspace.apiKeyCount} API keys</span>
                  </div>
                </button>
              ))}
            </div>
            <div className='flex justify-end'>
              <button
                type='button'
                onClick={closeWorkspacePicker}
                className='px-4 py-2.5 border border-[var(--app-border)] text-[var(--app-text-secondary)] font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors'
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteWorkspaceModalOpen && deleteWorkspaceTarget && (
        <div className='fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4'>
          <div className='w-full max-w-lg bg-white dark:bg-slate-900 border border-[var(--app-border)] rounded-2xl shadow-2xl overflow-hidden'>
            <div className='px-6 py-4 border-b border-[var(--app-border)]'>
              <h2 className='text-lg font-semibold text-slate-900 dark:text-white'>
                Delete workspace
              </h2>
              <p className='mt-1 text-sm text-slate-600 dark:text-slate-400'>
                This will permanently remove the workspace and unlink all members
                and organizations.
              </p>
            </div>

            <div className='px-6 py-5 space-y-5'>
              {deleteWorkspaceStep === 'CONFIRM_TIMER' ? (
                <div className='rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-900/20 p-4 flex gap-3'>
                  <AlertTriangle className='w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0' />
                  <p className='text-sm text-amber-800 dark:text-amber-200'>
                    You are about to delete{' '}
                    <span className='font-semibold'>
                      {deleteWorkspaceTarget.name}
                    </span>
                    . Wait 10 seconds before continuing.
                  </p>
                </div>
              ) : (
                <div className='space-y-2'>
                  <label className='block text-sm font-medium text-slate-700 dark:text-slate-300'>
                    Password
                  </label>
                  <div className='relative'>
                    <input
                      type={showDeleteWorkspacePassword ? 'text' : 'password'}
                      value={deleteWorkspacePassword}
                      onChange={(event) =>
                        setDeleteWorkspacePassword(event.target.value)
                      }
                      placeholder='Enter your password'
                      className='w-full px-4 py-2.5 pr-12 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)] focus:ring-2 focus:ring-red-500/30 focus:border-red-500/40'
                      autoFocus
                    />
                    <button
                      type='button'
                      onClick={() =>
                        setShowDeleteWorkspacePassword((previous) => !previous)
                      }
                      className='absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      aria-label={
                        showDeleteWorkspacePassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                    >
                      {showDeleteWorkspacePassword ? (
                        <EyeOff className='w-4 h-4' />
                      ) : (
                        <Eye className='w-4 h-4' />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className='flex items-center justify-end gap-2'>
                {deleteWorkspaceStep === 'PASSWORD_CONFIRM' && (
                  <button
                    type='button'
                    onClick={() => setDeleteWorkspaceStep('CONFIRM_TIMER')}
                    disabled={Boolean(deletingWorkspaceId)}
                    className='px-4 py-2 text-sm rounded-lg border border-[var(--app-border)] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50'
                  >
                    Back
                  </button>
                )}
                <button
                  type='button'
                  onClick={closeDeleteWorkspaceModal}
                  disabled={Boolean(deletingWorkspaceId)}
                  className='px-4 py-2 text-sm rounded-lg border border-[var(--app-border)] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50'
                >
                  Cancel
                </button>
                {deleteWorkspaceStep === 'CONFIRM_TIMER' ? (
                  <button
                    type='button'
                    onClick={handleDeleteWorkspaceTimerConfirm}
                    disabled={deleteWorkspaceCountdown > 0}
                    className='inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                  >
                    {deleteWorkspaceCountdown > 0
                      ? `Confirm (${deleteWorkspaceCountdown}s)`
                      : 'Continue'}
                  </button>
                ) : (
                  <button
                    type='button'
                    onClick={handleDeleteWorkspaceConfirmed}
                    disabled={
                      Boolean(deletingWorkspaceId) ||
                      deleteWorkspacePassword.trim().length === 0
                    }
                    className='inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                  >
                    {Boolean(deletingWorkspaceId) && (
                      <Loader2 className='w-4 h-4 animate-spin' />
                    )}
                    Delete Workspace
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className='surface-card rounded-xl border border-[var(--app-border)] p-4'>
      <div className='flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2'>
        <Icon className={`w-4 h-4 ${color}`} />
        <span>{label}</span>
      </div>
      <p className='text-2xl font-bold text-slate-900 dark:text-white'>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function SmallStateCard({ label, value }: { label: string; value: number }) {
  return (
    <div className='surface-card rounded-lg border border-[var(--app-border)] p-3'>
      <p className='text-xs text-slate-500 dark:text-slate-400'>
        {label} Workspaces
      </p>
      <p className='text-lg font-semibold text-slate-900 dark:text-white'>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  icon: Icon,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: any;
  type?: string;
}) {
  return (
    <div className='space-y-2'>
      <label className='text-sm font-medium text-slate-700 dark:text-slate-300'>
        {label}
      </label>
      <div className='relative'>
        <Icon className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400' />
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className='w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all'
        />
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  icon: Icon,
  options,
  disabled,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: any;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <div className='space-y-2'>
      <label className='text-sm font-medium text-slate-700 dark:text-slate-300'>
        {label}
      </label>
      <div className='relative'>
        <Icon className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none' />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className='w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-60'
        >
          <option value=''>
            {allowEmpty ? `Select ${label} (optional)` : `Select ${label}`}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
