'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  fetchMyRequests,
  createRequest,
  fetchCountries,
  fetchCategories,
  fetchStates,
  updateUserProfile,
  fetchMyOrganization,
  updateMyOrganization,
  fetchMyEnterpriseInvites,
  acceptMyEnterpriseInvite,
  declineMyEnterpriseInvite,
  fetchMyEnterpriseWorkspaces,
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  User,
  Globe,
  Clock,
  CheckCircle,
  XCircle,
  Settings,
  Plus,
  Activity,
  Mail,
  Lock,
  BarChart3,
  MousePointerClick,
  Eye,
  EyeOff,
  Building2,
  Briefcase,
  MapPin,
  Link as LinkIcon,
  Phone,
  Copy,
} from 'lucide-react';
import { getInitials } from '@/lib/utils';
import Image from 'next/image';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '@/lib/validation';

// --- Shared Components ---

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'APPROVED':
      return (
        <span className='px-2 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-medium flex items-center gap-1'>
          <CheckCircle className='w-3 h-3' /> Approved
        </span>
      );
    case 'REJECTED':
      return (
        <span className='px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-medium flex items-center gap-1'>
          <XCircle className='w-3 h-3' /> Rejected
        </span>
      );
    default:
      return (
        <span className='px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-medium flex items-center gap-1'>
          <Clock className='w-3 h-3' /> Pending Review
        </span>
      );
  }
};


// --- User Dashboard (Original) ---

const UserDashboard = () => {
  const { user, checkAuth } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [workspaceInvites, setWorkspaceInvites] = useState<any[]>([]);
  const [workspaceMemberships, setWorkspaceMemberships] = useState<any[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
  const [showUserId, setShowUserId] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'workspaces'>(
    'overview',
  );

  // Forms
  const [siteForm, setSiteForm] = useState({
    name: '',
    url: '',
    countryId: '',
    stateId: '',
    categoryId: '',
  });
  const [accountForm, setAccountForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });

  // Lookups

  const [countries, setCountries] = useState<any[]>([]);

  const [states, setStates] = useState<any[]>([]);

  const [categories, setCategories] = useState<any[]>([]);
  const [fetchingStates, setFetchingStates] = useState(false);

  // Limit Logic (Server-Side)
  // The backend now provides `used`, `limit`, and `remaining` in the user object.
  const limit = user?.requestLimit ?? user?.dailyRequestLimit;
  const windowDays = user?.requestLimitWindow || 1;
  const requestsUsed = user?.used ?? 0;
  const isLimitReached =
    limit !== null && limit !== undefined && requestsUsed >= limit;
  const showWorkspacesNav =
    workspaceInvites.length > 0 || workspaceMemberships.length > 0;
  const userId = user?.id || '';

  useEffect(() => {
    if (siteForm.countryId) {
      setFetchingStates(true);
      fetchStates(siteForm.countryId)
        .then(setStates)
        .catch(() => setStates([]))
        .finally(() => setFetchingStates(false));
    } else {
      setStates([]);
    }
  }, [siteForm.countryId]);

  useEffect(() => {
    if (user) {
      loadRequests();
      loadLookups();
      loadWorkspaceAccess();
      setAccountForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        password: '',
      });
    }
  }, [user]);

  const loadRequests = async () => {
    setLoadingRequests(true);
    try {
      const data = await fetchMyRequests();

      setRequests(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadLookups = async () => {
    const [c, cat] = await Promise.all([fetchCountries(), fetchCategories()]);
    setCountries(c);
    setCategories(cat);
  };

  const loadWorkspaceAccess = async () => {
    setLoadingWorkspaces(true);
    setWorkspaceError(null);
    try {
      const [inviteRes, workspaceRes] = await Promise.all([
        fetchMyEnterpriseInvites(),
        fetchMyEnterpriseWorkspaces(),
      ]);
      setWorkspaceInvites(Array.isArray(inviteRes?.invites) ? inviteRes.invites : []);
      setWorkspaceMemberships(
        Array.isArray(workspaceRes?.workspaces) ? workspaceRes.workspaces : [],
      );
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        'Failed to load workspace invites';
      setWorkspaceInvites([]);
      setWorkspaceMemberships([]);
      setWorkspaceError(message);
      showToast(message, 'error');
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const handleAcceptWorkspaceInvite = async (inviteId: string) => {
    try {
      setProcessingInviteId(inviteId);
      await acceptMyEnterpriseInvite(inviteId);
      showToast('Invite accepted', 'success');
      await loadWorkspaceAccess();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || 'Failed to accept invite',
        'error',
      );
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleDeclineWorkspaceInvite = async (inviteId: string) => {
    if (!confirm('Decline this workspace invite?')) return;
    try {
      setProcessingInviteId(inviteId);
      await declineMyEnterpriseInvite(inviteId);
      showToast('Invite declined', 'success');
      await loadWorkspaceAccess();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || 'Failed to decline invite',
        'error',
      );
    } finally {
      setProcessingInviteId(null);
    }
  };

  useEffect(() => {
    if (!showWorkspacesNav && activeTab === 'workspaces') {
      setActiveTab('overview');
    }
  }, [showWorkspacesNav, activeTab]);

  const getMaskedUserId = (value: string) => {
    if (!value) return '••••••••••••';
    const visibleChars = 6;
    const visiblePart = value.slice(-visibleChars);
    const maskedLength = Math.max(0, value.length - visibleChars);
    return `${'•'.repeat(maskedLength)}${visiblePart}`;
  };

  const copyUserId = async () => {
    if (!userId) {
      showToast('User ID unavailable', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(userId);
      showToast('ID Copied', 'success');
      return;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = userId;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (!copied) {
          throw new Error('Copy failed');
        }
        showToast('ID Copied', 'success');
      } catch {
        showToast('Failed to copy ID', 'error');
      }
    }
  };

  const submitSite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createRequest({
        type: 'SITE_ADD',
        payload: siteForm,
      });
      showToast('Recommendation submitted for review', 'success');
      loadRequests();
      checkAuth(); // Refresh user stats (limit usage)
      setSiteForm({
        name: '',
        url: '',
        countryId: '',
        stateId: '',
        categoryId: '',
      });
    } catch (e) {
      showToast('Failed to submit recommendation', 'error');
    }
  };

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...accountForm };
      if (payload.password && !STRONG_PASSWORD_REGEX.test(payload.password)) {
        showToast(STRONG_PASSWORD_MESSAGE, 'error');
        return;
      }
      if (!payload.password) delete (payload as any).password;

      await updateUserProfile(payload);
      showToast('Profile updated successfully', 'success');
      window.location.reload();
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Failed to update profile';
      showToast(msg, 'error');
    }
  };

  // Ensure user is present before accessing properties
  if (!user) return null; // Or a loading spinner, or redirect

  const isRestricted = user?.isRestricted;

  return (
    <div className='min-h-screen pb-20 bg-app'>
      {isRestricted && (
        <div className='bg-red-500/10 border-b border-red-500/20 px-4 py-3 text-red-600 dark:text-red-400 font-medium text-center flex items-center justify-center gap-2 sticky top-0 z-50 backdrop-blur-md'>
          <Lock className='w-4 h-4' />
          ⚠️ Your account is restricted. Please contact support.
        </div>
      )}

      {/* Header */}
      <div className='surface-card border-b border-[var(--app-border)] pt-8 pb-12 px-4 shadow-sm'>
        <div className='w-full px-4 flex items-center gap-6'>
          <div className='w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl border-4 border-white dark:border-slate-700 ring-1 ring-slate-100 dark:ring-0'>
            {getInitials(
              user?.firstName,
              user?.lastName,
              user?.name,
              user?.email,
            )}
          </div>
          <div>
            <h1 className='text-3xl font-bold text-slate-900 dark:text-white'>
              {user?.firstName} {user?.lastName}
            </h1>
            <p className='text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1'>
              <span className='flex items-center gap-2'>
                <Mail className='w-4 h-4' /> {user?.email}
              </span>
              {isRestricted && (
                <span className='text-red-500 dark:text-red-400 font-bold border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-2 rounded text-xs ml-2'>
                  RESTRICTED
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className='w-full px-4 -mt-8'>
        <div className='surface-card rounded-xl overflow-hidden shadow-xl min-h-[500px] flex w-full flex-col md:flex-row'>
          {/* User Sidebar */}
          <div className='w-full md:w-64 md:shrink-0 bg-slate-50/80 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-700 p-4 space-y-2'>
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <Activity className='w-5 h-5' />
              <span className='font-medium'>Overview</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <Settings className='w-5 h-5' />
              <span className='font-medium'>Account Settings</span>
            </button>
            {showWorkspacesNav && (
              <button
                onClick={() => setActiveTab('workspaces')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'workspaces' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <Briefcase className='w-5 h-5' />
                <span className='font-medium'>Workspaces</span>
              </button>
            )}
          </div>

          {/* Content */}
          <fieldset
            disabled={isRestricted}
            className={`flex-1 min-w-0 ${isRestricted ? 'opacity-70' : ''}`}
          >
            <div className='w-full min-w-0 p-8 bg-white dark:bg-transparent'>
              {activeTab === 'overview' && (
                <div className='space-y-8'>
                  {/* Recommendation Form */}
                  <div className='bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6 shadow-sm'>
                    <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2'>
                      <Plus className='w-5 h-5 text-blue-500 dark:text-blue-400' />
                      Recommend a Website
                    </h2>

                    {limit !== null && limit !== undefined && (
                      <div
                        className={`mb-4 p-4 rounded-lg flex items-center justify-between ${isLimitReached ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-200' : 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-200'}`}
                      >
                        <div className='flex items-center gap-2'>
                          <BarChart3 className='w-5 h-5' />
                          <span className='font-medium'>
                            {windowDays > 1
                              ? `${windowDays}-Day Request Limit`
                              : 'Daily Request Limit'}
                          </span>
                        </div>
                        <div className='text-sm'>
                          <span
                            className={`font-bold ${isLimitReached ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}
                          >
                            {requestsUsed}
                          </span>
                          <span className='text-slate-600 dark:text-slate-400'>
                            {' '}
                            / {limit} used
                          </span>
                        </div>
                      </div>
                    )}

                    {isLimitReached && (
                      <div className='mb-4 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 p-4 rounded-lg text-orange-800 dark:text-orange-200 text-sm flex items-center gap-2'>
                        <Clock className='w-4 h-4' />
                        You have reached your request limit. You can submit new
                        requests after the limit resets.
                      </div>
                    )}

                    <form
                      onSubmit={submitSite}
                      className='grid md:grid-cols-2 gap-4'
                    >
                      <fieldset
                        disabled={isLimitReached}
                        className='contents disabled:opacity-50'
                      >
                        <input
                          required
                          placeholder='Website Name'
                          value={siteForm.name}
                          onChange={(e) =>
                            setSiteForm({ ...siteForm, name: e.target.value })
                          }
                          className='bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all'
                        />
                        <input
                          required
                          type='url'
                          placeholder='URL (https://...)'
                          value={siteForm.url}
                          onChange={(e) =>
                            setSiteForm({ ...siteForm, url: e.target.value })
                          }
                          className='bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all'
                        />
                        <select
                          required
                          value={siteForm.countryId}
                          onChange={(e) =>
                            setSiteForm({
                              ...siteForm,
                              countryId: e.target.value,
                            })
                          }
                          className='bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all'
                        >
                          <option value=''>Select Country</option>
                          { }
                          {countries.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={siteForm.stateId}
                          onChange={(e) =>
                            setSiteForm({
                              ...siteForm,
                              stateId: e.target.value,
                            })
                          }
                          disabled={!siteForm.countryId || fetchingStates}
                          className='bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] text-sm disabled:opacity-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all'
                        >
                          <option value=''>Select State (Optional)</option>
                          { }
                          {states.map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <select
                          required
                          value={siteForm.categoryId}
                          onChange={(e) =>
                            setSiteForm({
                              ...siteForm,
                              categoryId: e.target.value,
                            })
                          }
                          className='bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all'
                        >
                          <option value=''>Select Category</option>
                          { }
                          {categories.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type='submit'
                          disabled={isLimitReached}
                          className='md:col-span-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow'
                        >
                          Submit Recommendation
                        </button>
                      </fieldset>
                    </form>
                    <p className='text-xs text-slate-500 mt-2'>
                      Submissions are subject to admin review.
                    </p>
                  </div>

                  {/* Activity Feed */}
                  <div>
                    <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2'>
                      <Activity className='w-5 h-5 text-purple-500 dark:text-purple-400' />
                      My Activity
                    </h2>
                    <div className='space-y-3'>
                      {loadingRequests ? (
                        <div className='text-center py-8 text-slate-500'>
                          <Loader2 className='animate-spin w-6 h-6 mx-auto mb-2' />{' '}
                          Loading...
                        </div>
                      ) : requests.length === 0 ? (
                        <div className='text-center py-8 text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800'>
                          No activity yet.
                        </div>
                      ) : (
                        requests.map((req: any) => (
                          <div
                            key={req.id}
                            className='bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex justify-between items-center hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm'
                          >
                            <div>
                              <div className='flex items-center gap-2 mb-1'>
                                <span className='font-semibold text-slate-900 dark:text-white'>
                                  {req.type === 'SITE_ADD'
                                    ? 'Website Recommendation'
                                    : req.type === 'USER_UPDATE'
                                      ? 'Profile Update'
                                      : 'Request'}
                                </span>
                              </div>
                              <div className='flex items-center gap-2 text-xs text-slate-400 font-mono mb-1'>
                                <span>ID: {req.id}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(req.id);
                                    showToast('Request ID copied', 'success');
                                  }}
                                  className='text-slate-500 hover:text-blue-500 transition-colors'
                                  title='Copy Request ID'
                                >
                                  <Copy className='w-3 h-3' />
                                </button>
                              </div>
                              <p className='text-xs text-slate-400'>
                                {new Date(req.createdAt).toLocaleDateString()}
                              </p>
                              {req.adminNotes && (
                                <p className='text-xs text-red-500 dark:text-red-400 mt-1'>
                                  Admin Note: {req.adminNotes}
                                </p>
                              )}
                            </div>
                            <StatusBadge status={req.status} />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className='w-full'>
                  <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-6'>
                    Account Settings
                  </h2>
                  <div className='surface-card rounded-xl p-4 sm:p-5 shadow-sm mb-6'>
                    <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
                      <div className='space-y-1'>
                        <p className='text-sm font-medium text-slate-800 dark:text-slate-200'>User ID</p>
                        {userId ? (
                          <p className='font-mono text-sm text-slate-700 dark:text-slate-300 break-all'>
                            {showUserId ? userId : getMaskedUserId(userId)}
                          </p>
                        ) : (
                          <div className='h-5 w-48 rounded bg-slate-200 dark:bg-slate-700 animate-pulse' />
                        )}
                      </div>
                      <div className='flex items-center gap-2 self-start sm:self-auto'>
                        <button
                          type='button'
                          onClick={() => setShowUserId((prev) => !prev)}
                          disabled={!userId}
                          aria-label={showUserId ? 'Hide ID' : 'Show ID'}
                          className='p-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                        >
                          {showUserId ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                        </button>
                        <button
                          type='button'
                          onClick={copyUserId}
                          disabled={!userId}
                          aria-label='Copy ID'
                          className='p-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                        >
                          <Copy className='w-4 h-4' />
                        </button>
                      </div>
                    </div>
                  </div>
                  <form onSubmit={submitAccount} className='w-full space-y-6'>
                    <div className='bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 text-blue-700 dark:text-blue-200 text-sm mb-6'>
                      Update your personal information below.
                    </div>

                    <div className='grid grid-cols-2 gap-4'>
                      <div className='space-y-2'>
                        <label className='text-sm font-medium text-slate-700 dark:text-slate-300'>
                          First Name
                        </label>
                        <input
                          value={accountForm.firstName}
                          onChange={(e) =>
                            setAccountForm({
                              ...accountForm,
                              firstName: e.target.value,
                            })
                          }
                          className='w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'
                        />
                      </div>
                      <div className='space-y-2'>
                        <label className='text-sm font-medium text-slate-700 dark:text-slate-300'>
                          Last Name
                        </label>
                        <input
                          value={accountForm.lastName}
                          onChange={(e) =>
                            setAccountForm({
                              ...accountForm,
                              lastName: e.target.value,
                            })
                          }
                          className='w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'
                        />
                      </div>
                    </div>

                    <div className='space-y-2'>
                      <label className='text-sm font-medium text-slate-700 dark:text-slate-300'>
                        Email Address
                      </label>
                      <div className='relative'>
                        <Mail className='absolute left-3 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500' />
                        <input
                          type='email'
                          value={accountForm.email}
                          onChange={(e) =>
                            setAccountForm({
                              ...accountForm,
                              email: e.target.value,
                            })
                          }
                          className='w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'
                        />
                      </div>
                    </div>

                    <div className='space-y-2'>
                      <label className='text-sm font-medium text-slate-700 dark:text-slate-300'>
                        New Password (Optional)
                      </label>
                      <div className='relative'>
                        <Lock className='absolute left-3 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500' />
                        <input
                          type='password'
                          placeholder='Leave blank to keep current'
                          value={accountForm.password}
                          onChange={(e) =>
                            setAccountForm({
                              ...accountForm,
                              password: e.target.value,
                            })
                          }
                          className='w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'
                        />
                      </div>
                      <p className='text-[11px] text-slate-500 dark:text-slate-400'>
                        Min 8 chars with uppercase, lowercase, number, special character.
                      </p>
                    </div>

                    <button
                      type='submit'
                      className='px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors shadow-sm hover:shadow'
                    >
                      Save Changes
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'workspaces' && (
                <div className='space-y-6'>
                  {loadingWorkspaces && (
                    <div className='rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 text-sm text-slate-500 dark:text-slate-400'>
                      Loading workspace invites...
                    </div>
                  )}
                  {workspaceError && !loadingWorkspaces && (
                    <div className='rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300'>
                      {workspaceError}
                    </div>
                  )}

                  <div className='bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6 shadow-sm'>
                    <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-4'>
                      Pending Invites
                    </h2>
                    {workspaceInvites.length === 0 ? (
                      <p className='text-sm text-slate-500 dark:text-slate-400'>
                        No pending workspace invites.
                      </p>
                    ) : (
                      <div className='space-y-3'>
                        {workspaceInvites.map((invite: any) => (
                          <div
                            key={invite.id}
                            className='rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3'
                          >
                            <div className='space-y-1'>
                              <p className='text-sm font-semibold text-slate-900 dark:text-white'>
                                {invite.workspace?.name || invite.workspaceId}
                              </p>
                              <p className='text-xs text-slate-500 dark:text-slate-400'>
                                Role: {invite.role} | Invited by{' '}
                                {invite.createdByUser?.name ||
                                  invite.createdByUser?.email ||
                                  invite.createdBy ||
                                  'Unknown'}
                              </p>
                              <p className='text-xs text-slate-500 dark:text-slate-400'>
                                Requested {new Date(invite.createdAt).toLocaleString()} | Expires{' '}
                                {new Date(invite.expiresAt).toLocaleString()}
                              </p>
                            </div>
                            <div className='flex items-center gap-2'>
                              <button
                                type='button'
                                onClick={() => handleDeclineWorkspaceInvite(invite.id)}
                                disabled={processingInviteId === invite.id}
                                className='px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60'
                              >
                                Decline
                              </button>
                              <button
                                type='button'
                                onClick={() => handleAcceptWorkspaceInvite(invite.id)}
                                disabled={processingInviteId === invite.id}
                                className='px-3 py-1.5 text-sm font-medium rounded-lg btn-primary disabled:opacity-60 inline-flex items-center gap-2'
                              >
                                {processingInviteId === invite.id ? (
                                  <>
                                    <Loader2 className='w-4 h-4 animate-spin' />
                                    Processing...
                                  </>
                                ) : (
                                  'Accept'
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className='bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6 shadow-sm'>
                    <h2 className='text-xl font-bold text-slate-900 dark:text-white mb-4'>
                      My Workspaces
                    </h2>
                    {workspaceMemberships.length === 0 ? (
                      <p className='text-sm text-slate-500 dark:text-slate-400'>
                        Join a workspace to access enterprise collaboration tools.
                      </p>
                    ) : (
                      <div className='space-y-3'>
                        {workspaceMemberships.map((workspace: any) => (
                          <div
                            key={workspace.id}
                            className='rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3'
                          >
                            <div>
                              <p className='text-sm font-semibold text-slate-900 dark:text-white'>
                                {workspace.name}
                              </p>
                              <p className='text-xs text-slate-500 dark:text-slate-400 mt-1'>
                                Role: {workspace.role} | Members: {workspace.memberCount} | Linked Orgs:{' '}
                                {workspace.orgCount}
                              </p>
                            </div>
                            <button
                              type='button'
                              onClick={() =>
                                router.push(`/enterprise/${workspace.id}?tab=members`)
                              }
                              className='px-3 py-1.5 text-sm font-medium rounded-lg btn-primary inline-flex items-center gap-2'
                            >
                              Open Workspace
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
};

// --- Main Page Component ---

// --- Main Page Component ---

export default function Dashboard() {
  const { user, loading }: { user: any; loading: boolean } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/');
      } else if (user.organizationId) {
        router.push(user.planType === 'ENTERPRISE' ? '/enterprise' : '/org/dashboard');
      }
    }
  }, [user, loading, router]);

  // Show loader while loading or redirecting
  if (loading || !user || user?.organizationId || user?.mustChangePassword) {
    return (
      <div className='flex h-screen items-center justify-center bg-white dark:bg-slate-900 text-slate-900 dark:text-white'>
        <Loader2 className='animate-spin w-8 h-8' />
      </div>
    );
  }

  return <UserDashboard />;
}
