import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import Image from 'next/image';
import {
  Shield,
  Building2,
  CheckCircle,
  XCircle,
  Search,
  Trash2,
  Edit,
  X,
  Loader2,
  Ban,
  Upload,
  Lock,
  Mail,
  Key,
  Link2,
  Users,
} from 'lucide-react';
import {
  fetchOrganizations,
  updateOrganization,
  deleteOrganization,
  deleteOrganizationsBulk,
  createOrganizationAdmin,
  restoreOrganization,
  permanentlyDeleteOrganization,
  fetchCountries,
  fetchStates,
  fetchCategories,
  restrictOrganization,
  uploadOrgLogo,
  updateOrganizationPriority,
  bulkUpdateOrganizationPriority,
  updateOrganizationPlan,
  bulkUpdateOrganizationPlan,
  updateOrgLoginEmail,
  resetOrgPassword,
  resetEnterprisePassword,
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';
import { useDebounce } from '@/hooks/useDebounce';
import { toProxyImageUrl } from '@/lib/imageProxy';
import PasswordFields from '@/components/auth/PasswordFields';
import { validatePassword } from '@/lib/passwordPolicy';

interface Organization {
  id: string;
  name: string;
  email: string;
  website: string;
  phone?: string;
  address?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'NORMAL' | 'LOW';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  country: { id: string; name: string; code: string };
  state?: { id: string; name: string };
  category?: { id: string; name: string };
  categoryId?: string;
  countryId?: string;
  stateId?: string;
  createdAt: string;
  isRestricted?: boolean;
  type?: 'PUBLIC' | 'PRIVATE' | 'NON_PROFIT';
  about?: string;
  logo?: string;
  priorityExpiresAt?: string;
  planType?: 'FREE' | 'BASIC' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  planStatus?: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  planStartAt?: string;
  planEndAt?: string;
  supportTier?: 'NONE' | 'EMAIL' | 'CHAT' | 'INSTANT' | 'DEDICATED';
  priorityOverride?: number | null;
  enterpriseMaxWorkspaces?: number | null;
  enterpriseMaxLinkedOrgs?: number | null;
  enterpriseMaxApiKeys?: number | null;
  enterpriseMaxMembers?: number | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deleteReason?: string | null;
}

const BILLING_TERM_OPTIONS = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'ANNUAL', label: 'Annual' },
] as const;

const SELF_SERVE_MONTHLY_PRICE_CENTS: Record<'BASIC' | 'PRO' | 'BUSINESS', number> = {
  BASIC: 4900,
  PRO: 9900,
  BUSINESS: 19900,
};

const isSelfServePlan = (
  planType: string,
): planType is 'BASIC' | 'PRO' | 'BUSINESS' => {
  return planType === 'BASIC' || planType === 'PRO' || planType === 'BUSINESS';
};

const resolveSelfServeAmountCents = (
  planType: 'BASIC' | 'PRO' | 'BUSINESS',
  billingTerm: 'MONTHLY' | 'ANNUAL',
) => {
  const monthlyAmount = SELF_SERVE_MONTHLY_PRICE_CENTS[planType];
  return billingTerm === 'ANNUAL'
    ? Math.round(monthlyAmount * 12 * 0.9)
    : monthlyAmount;
};

const adminOrgFormControlClass =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#187DE9]/35 focus:border-[#187DE9]/40 transition-colors';

const adminOrgCompactControlClass =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#187DE9]/35 focus:border-[#187DE9]/40 disabled:opacity-60 disabled:cursor-not-allowed transition-colors';

interface AdminOrgLogoPickerProps {
  fileInputId: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  mode: 'upload' | 'external';
  onModeChange: (mode: 'upload' | 'external') => void;
  previewSrc: string;
  uploading: boolean;
  uploadLabel: string;
  helperText: string;
  urlValue: string;
  urlPlaceholder?: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (value: string) => void;
  onClear: () => void;
  onPreviewError?: () => void;
  errorText?: string;
}

function AdminOrgLogoPicker({
  fileInputId,
  fileInputRef,
  mode,
  onModeChange,
  previewSrc,
  uploading,
  uploadLabel,
  helperText,
  urlValue,
  urlPlaceholder = 'https://example.com/logo.png',
  onFileChange,
  onUrlChange,
  onClear,
  onPreviewError,
  errorText,
}: AdminOrgLogoPickerProps) {
  const triggerFileDialog = () => {
    if (mode !== 'upload') return;
    fileInputRef.current?.click();
  };

  const handleAvatarKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      triggerFileDialog();
    }
  };

  return (
    <div className='space-y-3'>
      <label className='block text-sm font-medium text-slate-600 dark:text-slate-400'>
        Organization Logo
      </label>
      <div className='flex justify-center'>
        <button
          type='button'
          onClick={triggerFileDialog}
          onKeyDown={handleAvatarKeyDown}
          className='relative h-28 w-28 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/70 overflow-hidden flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#187DE9]/40'
          aria-label='Upload organization logo'
        >
          {uploading ? (
            <Loader2 className='w-6 h-6 text-[#187DE9] animate-spin' />
          ) : previewSrc ? (
            <img
              src={previewSrc}
              alt='Organization logo preview'
              className='h-full w-full object-cover'
              onError={onPreviewError}
            />
          ) : (
            <Building2 className='w-8 h-8 text-slate-400 dark:text-slate-500' />
          )}

          <span
            className={`pointer-events-none absolute -bottom-1 -right-1 h-8 w-8 rounded-full text-white flex items-center justify-center shadow-lg ${mode === 'upload' ? 'bg-[#187DE9] shadow-blue-500/30' : 'bg-slate-400 shadow-slate-400/20 dark:bg-slate-600 dark:shadow-slate-700/20'}`}
          >
            <Upload className='w-4 h-4' />
          </span>
        </button>
      </div>

      <div className='flex justify-center'>
        <div className='inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-1'>
          <button
            type='button'
            onClick={() => onModeChange('upload')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'upload' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            Upload
          </button>
          <button
            type='button'
            onClick={() => onModeChange('external')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'external' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            External Link
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        id={fileInputId}
        type='file'
        accept='image/*,.svg'
        onChange={onFileChange}
        className='hidden'
      />

      {mode === 'upload' ? (
        <div className='space-y-2'>
          <label
            htmlFor={fileInputId}
            className={`flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Upload className='w-4 h-4' />
            {uploadLabel}
          </label>
          {previewSrc ? (
            <button
              type='button'
              onClick={onClear}
              className='text-xs text-red-500 hover:text-red-400 transition-colors'
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : (
        <div className='space-y-2'>
          <input
            type='url'
            value={urlValue}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder={urlPlaceholder}
            className={adminOrgFormControlClass}
          />
          {previewSrc ? (
            <div className='flex justify-start'>
              <button
                type='button'
                onClick={onClear}
                className='text-xs text-red-500 hover:text-red-400 transition-colors whitespace-nowrap'
              >
                Remove
              </button>
            </div>
          ) : null}
        </div>
      )}

      <p className='text-xs text-slate-500 dark:text-slate-400'>{helperText}</p>
      {errorText ? (
        <p className='text-xs text-red-500 dark:text-red-400'>{errorText}</p>
      ) : null}
    </div>
  );
}

export default function OrganizationsSection({
  currentUser,
}: {
  currentUser?: any;
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Filter State
  const [filters, setFilters] = useState({
    countryId: '',
    stateId: '',
    categoryId: '',
    status: '',
    type: '',
    priority: '',
    planType: '',
    deleted: 'exclude' as 'only' | 'include' | 'exclude',
  });

  // Edit State
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createLogoMode, setCreateLogoMode] = useState<'upload' | 'external'>(
    'upload',
  );
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [createLogoPreviewUrl, setCreateLogoPreviewUrl] = useState<
    string | null
  >(null);
  const [createLogoError, setCreateLogoError] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    website: '',
    phone: '',
    address: '',
    countryId: '',
    stateId: '',
    categoryId: '',
    type: 'PUBLIC',
    // Discovery note (frontend/src/components/admin/sections/OrganizationsSection.tsx):
    // Create/Edit form state previously had no org priority field, so payloads could not persist selected priority.
    priority: 'NORMAL',
    about: '',
    logo: '',
    planType: 'FREE',
    planStatus: 'ACTIVE',
    billingTerm: 'MONTHLY' as 'MONTHLY' | 'ANNUAL',
    amountCents: '',
    durationPreset: '30',
    customDays: '',
    priorityOverride: 'HIGH',
  });
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    website: '',
    phone: '',
    address: '',
    countryId: '',
    stateId: '',
    categoryId: '',
    type: 'PUBLIC',
    priority: 'NORMAL',
    about: '',
    logo: '',
    loginEmail: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [editLogoPreviewUrl, setEditLogoPreviewUrl] = useState<string | null>(
    null,
  );
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const createLogoInputRef = useRef<HTMLInputElement | null>(null);
  const editLogoInputRef = useRef<HTMLInputElement | null>(null);

  // Priority Modal State
  const [priorityModalOpen, setPriorityModalOpen] = useState(false);
  const [priorityTargetIds, setPriorityTargetIds] = useState<string[]>([]);
  const [targetPriority, setTargetPriority] = useState('NORMAL');
  const [targetDuration, setTargetDuration] = useState<number>(0); // 0 = Permanent

  // Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Password Reset Modal State
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [resetTempPassword, setResetTempPassword] = useState<string | null>(
    null,
  );
  const [resetPasswordCopied, setResetPasswordCopied] = useState(false);

  // Logo Handling State (Mirrored from CountryForm)
  const [useLogoUrl, setUseLogoUrl] = useState(false);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoPathInput, setLogoPathInput] = useState('');

  const toPreviewUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    return `https://${trimmed}`;
  };

  // Plan Modal State
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planTargetIds, setPlanTargetIds] = useState<string[]>([]);
  const [planForm, setPlanForm] = useState({
    planType: 'FREE',
    planStatus: 'ACTIVE',
    durationPreset: '30',
    customDays: '',
    priorityOverride: 'HIGH',
    enterpriseMaxWorkspaces: '10',
    enterpriseMaxLinkedOrgs: '50',
    enterpriseMaxApiKeys: '10',
    enterpriseMaxMembers: '100',
  });
  const [bulkPlanForm, setBulkPlanForm] = useState({
    planType: 'FREE',
    planStatus: 'ACTIVE',
    durationPreset: '30',
    customDays: '',
    priorityOverride: 'HIGH',
  });

  // Lookups
  const [countries, setCountries] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterStates, setFilterStates] = useState<any[]>([]);

  // Bulk Actions State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const loadOrgs = async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    try {
      const data = await fetchOrganizations(filters, controller.signal);
      if (requestId === requestIdRef.current) {
        setOrganizations(data);
      }
    } catch (err: any) {
      if (err?.name !== 'CanceledError') {
        showToast('Failed to load organizations', 'error');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const loadLookups = async () => {
    try {
      const [c, cat] = await Promise.all([fetchCountries(), fetchCategories()]);
      setCountries(c);
      setCategories(cat);
    } catch (e) {
      console.error('Failed to load lookups', e);
    }
  };

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    loadOrgs();
    setSelectedIds([]);
  }, [filters]);

  useEffect(() => {
    if (filters.countryId) {
      fetchStates(filters.countryId)
        .then(setFilterStates)
        .catch(() => setFilterStates([]));
    } else {
      setFilterStates([]);
    }
  }, [filters.countryId]);

  useEffect(() => {
    if (editForm.countryId) {
      fetchStates(editForm.countryId)
        .then(setStates)
        .catch(() => setStates([]));
    } else {
      setStates([]);
    }
  }, [editForm.countryId]);

  useEffect(() => {
    return () => {
      if (createLogoPreviewUrl) {
        URL.revokeObjectURL(createLogoPreviewUrl);
      }
    };
  }, [createLogoPreviewUrl]);

  useEffect(() => {
    return () => {
      if (editLogoPreviewUrl) {
        URL.revokeObjectURL(editLogoPreviewUrl);
      }
    };
  }, [editLogoPreviewUrl]);

  const handleStatusChange = async (
    id: string,
    status: 'APPROVED' | 'REJECTED',
  ) => {
    if (!confirm(`Are you sure you want to ${status} this organization?`))
      return;
    try {
      await updateOrganization(id, { status });
      showToast(`Organization ${status.toLowerCase()} successfully`, 'success');
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to update status',
        'error',
      );
    }
  };

  const handleToggleRestriction = async (org: Organization) => {
    const newStatus = !org.isRestricted;
    if (
      !confirm(
        `Are you sure you want to ${newStatus ? 'RESTRICT' : 'UNRESTRICT'} organization ${org.name}?`,
      )
    )
      return;
    try {
      await restrictOrganization(org.id, newStatus);
      showToast(
        `Organization ${newStatus ? 'restricted' : 'unrestricted'} successfully`,
        'success',
      );
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to update restriction',
        'error',
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this organization? It will be moved to Deleted Orgs and hidden from public views.',
      )
    )
      return;
    try {
      await deleteOrganization(id);
      showToast('Organization deleted successfully', 'success');
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to delete organization',
        'error',
      );
    }
  };

  const handleRestore = async (id: string) => {
    if (
      !confirm(
        'Restore this organization? It will become visible again if eligible.',
      )
    )
      return;
    try {
      await restoreOrganization(id);
      showToast('Organization restored successfully', 'success');
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to restore organization',
        'error',
      );
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (
      !confirm('Permanently delete this organization? This cannot be undone.')
    )
      return;
    try {
      await permanentlyDeleteOrganization(id);
      showToast('Organization permanently deleted', 'success');
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message ||
          'Failed to permanently delete organization',
        'error',
      );
    }
  };

  const handleBulkDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete ${selectedIds.length} selected organizations? This action cannot be undone.`,
      )
    )
      return;
    try {
      await deleteOrganizationsBulk(selectedIds);
      showToast(
        `${selectedIds.length} organizations deleted successfully`,
        'success',
      );
      setSelectedIds([]);
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to delete organizations',
        'error',
      );
    }
  };

  const handleSelectAll = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredOrgs.map((org) => org.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const mapPriorityOverrideToLabel = (value?: number | null) => {
    if (value === null || value === undefined) return 'HIGH';
    if (value >= 3) return 'HIGH';
    if (value >= 2) return 'MEDIUM';
    if (value >= 1) return 'NORMAL';
    return 'LOW';
  };

  const getDurationPreset = (planEndAt?: string) => {
    if (!planEndAt) return { preset: 'custom', customDays: '' };
    const now = new Date();
    const end = new Date(planEndAt);
    const diffDays = Math.max(
      0,
      Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );
    if ([7, 15, 30].includes(diffDays)) {
      return { preset: String(diffDays), customDays: '' };
    }
    return { preset: 'custom', customDays: diffDays ? String(diffDays) : '' };
  };

  const startEdit = (org: Organization) => {
    setEditingOrg(org);
    if (editLogoPreviewUrl) {
      URL.revokeObjectURL(editLogoPreviewUrl);
    }
    setEditLogoPreviewUrl(null);

    // Initialize Logo State
    const hasLogo = !!org.logo;
    const isUrl =
      hasLogo && (org.logo!.startsWith('http') || org.logo!.startsWith('//'));

    setUseLogoUrl(isUrl);
    if (isUrl) {
      setLogoUrlInput(org.logo!);
      setLogoPathInput('');
    } else {
      setLogoUrlInput('');
      setLogoPathInput(org.logo || '');
    }

    setEditForm({
      name: org.name || '',
      email: org.email || '',
      website: org.website || '',
      phone: org.phone || '',
      address: org.address || '',
      countryId: org.country?.id || org.countryId || '',
      stateId: org.state?.id || org.stateId || '',
      categoryId: org.category?.id || org.categoryId || '',
      type: org.type || 'PUBLIC',
      priority: org.priority || 'NORMAL',
      about: org.about || '',
      logo:
        org.logo && !org.logo.includes('via.placeholder.com') ? org.logo : '',
      loginEmail: '',
    });
    setLogoError(false);

    // Reset Plan Form
    setPlanForm({
      planType: org.planType || 'FREE',
      planStatus: org.planStatus || 'ACTIVE',
      durationPreset: '30',
      customDays: '',
      priorityOverride: org.priorityOverride
        ? org.priorityOverride.toString()
        : 'NORMAL',
      enterpriseMaxWorkspaces: org.enterpriseMaxWorkspaces
        ? String(org.enterpriseMaxWorkspaces)
        : '10',
      enterpriseMaxLinkedOrgs: org.enterpriseMaxLinkedOrgs
        ? String(org.enterpriseMaxLinkedOrgs)
        : '50',
      enterpriseMaxApiKeys: org.enterpriseMaxApiKeys
        ? String(org.enterpriseMaxApiKeys)
        : '10',
      enterpriseMaxMembers: org.enterpriseMaxMembers
        ? String(org.enterpriseMaxMembers)
        : '100',
    });
  };

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('File too large (max 5MB)', 'error');
      return;
    }

    if (editLogoPreviewUrl) {
      URL.revokeObjectURL(editLogoPreviewUrl);
    }
    setEditLogoPreviewUrl(URL.createObjectURL(file));
    setLogoError(false);
    setUploadingLogo(true);
    try {
      const { url } = await uploadOrgLogo(file);
      // On success (Mirrored from CountryForm)
      setUseLogoUrl(false);
      setLogoUrlInput('');
      setLogoPathInput(url);
      setEditForm((prev) => ({ ...prev, logo: url }));
      showToast('Logo uploaded successfully', 'success');
    } catch (error) {
      showToast('Failed to upload logo', 'error');
    } finally {
      setUploadingLogo(false);
      e.target.value = ''; // Reset input
    }
  };

  const resetCreateLogoSelection = () => {
    if (createLogoPreviewUrl) {
      URL.revokeObjectURL(createLogoPreviewUrl);
    }
    setCreateLogoPreviewUrl(null);
    setCreateLogoError('');
    setCreateForm((prev) => ({ ...prev, logo: '' }));
  };

  const handleCreateLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreateLogoMode('upload');

    const isValidType =
      /\.(jpg|jpeg|png|webp|svg)$/i.test(file.name) ||
      file.type.startsWith('image/');

    if (!isValidType) {
      setCreateLogoError('Invalid file type (png/jpg/jpeg/webp/svg)');
      e.target.value = '';
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      setCreateLogoError('File too large (max 1MB)');
      e.target.value = '';
      return;
    }

    if (createLogoPreviewUrl) {
      URL.revokeObjectURL(createLogoPreviewUrl);
    }
    setCreateLogoPreviewUrl(URL.createObjectURL(file));
    setCreateLogoError('');
    setUploadingLogo(true);

    try {
      const res = await uploadOrgLogo(file);
      const finalUrl = res?.path || res?.url;
      if (!finalUrl) {
        throw new Error('Logo upload response missing URL');
      }
      setCreateForm((prev) => ({ ...prev, logo: finalUrl }));
      showToast('Logo uploaded successfully', 'success');
    } catch {
      setCreateLogoError('Failed to upload logo');
      showToast('Failed to upload logo', 'error');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const resetEditLogoSelection = () => {
    if (editLogoPreviewUrl) {
      URL.revokeObjectURL(editLogoPreviewUrl);
    }
    setEditLogoPreviewUrl(null);
    setLogoError(false);
    setUseLogoUrl(false);
    setLogoPathInput('');
    setLogoUrlInput('');
    setEditForm((prev) => ({ ...prev, logo: '' }));
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;
    setSaving(true);
    try {
      // Determine final logo (Mirroring CountryForm Logic)
      const finalLogo = useLogoUrl
        ? logoUrlInput
          ? toPreviewUrl(logoUrlInput)
          : ''
        : logoPathInput;

      // Exclude loginEmail from organization update
      const { loginEmail, ...orgData } = editForm;

      const updatedOrg = await updateOrganization(editingOrg.id, {
        ...orgData,
        logo: finalLogo,
      });
      if (updatedOrg?.id) {
        setOrganizations((prev) =>
          prev.map((org) =>
            org.id === updatedOrg.id ? { ...org, ...updatedOrg } : org,
          ),
        );
      }

      // Also save plan if it was modified
      try {
        const durationDays = resolveDurationDays(planForm);
        const enterpriseQuotas =
          planForm.planType === 'ENTERPRISE'
            ? resolveEnterpriseQuotaPayload()
            : {};
        const planPayload = {
          planType: planForm.planType,
          planStatus: planForm.planStatus,
          durationDays: durationDays > 0 ? durationDays : 0,
          priorityOverride:
            planForm.planType === 'ENTERPRISE'
              ? mapPriorityOverrideToValue(planForm.priorityOverride)
              : null,
          ...enterpriseQuotas,
        };
        await updateOrganizationPlan(editingOrg.id, planPayload);
      } catch (planErr: any) {
        showToast(
          planErr.response?.data?.message ||
            'Organization saved but plan update failed',
          'error',
        );
      }

      showToast('Organization updated successfully', 'success');
      if (editLogoPreviewUrl) {
        URL.revokeObjectURL(editLogoPreviewUrl);
      }
      setEditLogoPreviewUrl(null);
      setEditingOrg(null);
      loadOrgs(); // Refresh list
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to update organization',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLoginEmail = async () => {
    if (!editingOrg || !editForm.loginEmail) return;
    if (
      !confirm(
        `Are you sure you want to change the LOGIN email to ${editForm.loginEmail}? This will affect how they log in.`,
      )
    )
      return;

    try {
      await updateOrgLoginEmail(editingOrg.id, editForm.loginEmail);
      showToast('Login email updated successfully', 'success');
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to update login email',
        'error',
      );
    }
  };

  const handleResetPassword = async () => {
    if (!editingOrg) return;
    if (
      !confirm(
        'Are you sure you want to reset the password for this organization? They will be logged out immediately.',
      )
    )
      return;

    try {
      const res =
        editingOrg.planType === 'ENTERPRISE'
          ? await resetEnterprisePassword(editingOrg.id)
          : await resetOrgPassword(editingOrg.id);
      setResetTempPassword(res.tempPassword);
      setResetPasswordCopied(false);
      setResetPasswordModalOpen(true);
      showToast('Password reset successfully', 'success');
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to reset password',
        'error',
      );
    }
  };

  const openPriorityModal = (
    ids: string[],
    currentPriority: string = 'NORMAL',
  ) => {
    setPriorityTargetIds(ids);
    setTargetPriority(currentPriority);
    setTargetDuration(0); // Reset to Permanent
    setPriorityModalOpen(true);
  };

  const handleSavePriority = async () => {
    if (priorityTargetIds.length === 0) return;
    setSaving(true);
    try {
      const expiresAtIso =
        targetDuration > 0
          ? new Date(
              Date.now() + targetDuration * 24 * 60 * 60 * 1000,
            ).toISOString()
          : undefined;
      if (priorityTargetIds.length === 1) {
        const updatedOrg = await updateOrganizationPriority(
          priorityTargetIds[0],
          targetPriority,
          targetDuration,
        );
        if (updatedOrg?.id) {
          setOrganizations((prev) =>
            prev.map((org) =>
              org.id === updatedOrg.id ? { ...org, ...updatedOrg } : org,
            ),
          );
        }
      } else {
        await bulkUpdateOrganizationPriority(
          priorityTargetIds,
          targetPriority,
          targetDuration,
        );
        const targetIds = new Set(priorityTargetIds);
        setOrganizations((prev) =>
          prev.map((org) =>
            targetIds.has(org.id)
              ? {
                  ...org,
                  priority: targetPriority as Organization['priority'],
                  priorityExpiresAt: expiresAtIso,
                }
              : org,
          ),
        );
      }

      showToast('Priority updated successfully', 'success');
      setPriorityModalOpen(false);
      setPriorityTargetIds([]);
      setSelectedIds([]); // Clear selection if bulk
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to update priority',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const resolveDurationDays = (form: {
    durationPreset: string;
    customDays: string;
  }) => {
    if (form.durationPreset === 'custom') {
      const parsed = parseInt(form.customDays, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = parseInt(form.durationPreset, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const mapPriorityOverrideToValue = (label: string) => {
    if (label === 'HIGH') return 3;
    if (label === 'MEDIUM') return 2;
    if (label === 'NORMAL') return 1;
    return 0;
  };

  const resolveCreateBillingAmountCents = () => {
    if (isSelfServePlan(createForm.planType)) {
      return resolveSelfServeAmountCents(createForm.planType, createForm.billingTerm);
    }

    if (createForm.planType === 'ENTERPRISE') {
      const parsed = Number.parseInt(createForm.amountCents, 10);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }

    return 0;
  };

  const parseEnterpriseQuotaField = (label: string, value: string): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1_000_000) {
      throw new Error(`${label} must be between 1 and 1,000,000`);
    }
    return parsed;
  };

  const resolveEnterpriseQuotaPayload = () => ({
    enterpriseMaxWorkspaces: parseEnterpriseQuotaField(
      'Workspaces limit',
      planForm.enterpriseMaxWorkspaces,
    ),
    enterpriseMaxLinkedOrgs: parseEnterpriseQuotaField(
      'Linked organizations limit',
      planForm.enterpriseMaxLinkedOrgs,
    ),
    enterpriseMaxApiKeys: parseEnterpriseQuotaField(
      'API keys limit',
      planForm.enterpriseMaxApiKeys,
    ),
    enterpriseMaxMembers: parseEnterpriseQuotaField(
      'Members limit',
      planForm.enterpriseMaxMembers,
    ),
  });

  const openPlanModal = (ids: string[]) => {
    setPlanTargetIds(ids);
    setBulkPlanForm({
      planType: 'FREE',
      planStatus: 'ACTIVE',
      durationPreset: '30',
      customDays: '',
      priorityOverride: 'HIGH',
    });
    setPlanModalOpen(true);
  };

  const handleSavePlanBulk = async () => {
    if (planTargetIds.length === 0) return;
    setSaving(true);
    try {
      const durationDays = resolveDurationDays(bulkPlanForm);
      const payload = {
        planType: bulkPlanForm.planType,
        planStatus: bulkPlanForm.planStatus,
        durationDays: durationDays > 0 ? durationDays : 0,
        priorityOverride:
          bulkPlanForm.planType === 'ENTERPRISE'
            ? mapPriorityOverrideToValue(bulkPlanForm.priorityOverride)
            : null,
      };

      if (planTargetIds.length === 1) {
        await updateOrganizationPlan(planTargetIds[0], payload);
      } else {
        await bulkUpdateOrganizationPlan(planTargetIds, payload);
      }

      showToast('Plan updated successfully', 'success');
      setPlanModalOpen(false);
      setPlanTargetIds([]);
      setSelectedIds([]);
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to update plan',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSavePlanForOrg = async () => {
    if (!editingOrg) return;
    setSaving(true);
    try {
      const durationDays = resolveDurationDays(planForm);
      const enterpriseQuotas =
        planForm.planType === 'ENTERPRISE'
          ? resolveEnterpriseQuotaPayload()
          : {};
      const payload = {
        planType: planForm.planType,
        planStatus: planForm.planStatus,
        durationDays: durationDays > 0 ? durationDays : 0,
        priorityOverride:
          planForm.planType === 'ENTERPRISE'
            ? mapPriorityOverrideToValue(planForm.priorityOverride)
            : null,
        ...enterpriseQuotas,
      };
      await updateOrganizationPlan(editingOrg.id, payload);
      showToast('Plan updated successfully', 'success');
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to update plan',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const filteredOrgs = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      org.email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      org.website.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    const password = createForm.password.trim();
    if (!password) {
      showToast('Password is required', 'error');
      return;
    }
    if (!createConfirmPassword.trim()) {
      showToast('Confirm password is required', 'error');
      return;
    }
    if (password !== createConfirmPassword.trim()) {
      showToast('Passwords do not match', 'error');
      return;
    }
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.ok) {
      showToast(passwordValidation.message || 'Password is invalid', 'error');
      return;
    }
    setCreating(true);
    try {
      const selectedPlanType = createForm.planType;
      const isPaidPlan = selectedPlanType !== 'FREE';
      const billingDurationDays = createForm.billingTerm === 'ANNUAL' ? 365 : 30;
      const resolvedDurationDays = isPaidPlan
        ? billingDurationDays
        : resolveDurationDays({
            durationPreset: createForm.durationPreset,
            customDays: createForm.customDays,
          });
      const resolvedAmountCents = resolveCreateBillingAmountCents();

      if (
        selectedPlanType === 'ENTERPRISE' &&
        createForm.planStatus === 'ACTIVE' &&
        resolvedAmountCents <= 0
      ) {
        showToast(
          'Enterprise plan requires an invoice amount greater than 0',
          'error',
        );
        setCreating(false);
        return;
      }

      const payload = {
        name: createForm.name,
        email: createForm.email,
        password,
        website: createForm.website,
        phone: createForm.phone,
        address: createForm.address,
        countryId: createForm.countryId,
        stateId: createForm.stateId || undefined,
        categoryId: createForm.categoryId,
        type: createForm.type,
        priority: createForm.priority,
        about: createForm.about || undefined,
        logo: createForm.logo || undefined,
        planType: selectedPlanType,
        planStatus: createForm.planStatus,
        durationDays: resolvedDurationDays > 0 ? resolvedDurationDays : 0,
        billingTerm: isPaidPlan ? createForm.billingTerm : undefined,
        amountCents: isPaidPlan ? resolvedAmountCents : undefined,
        priorityOverride:
          selectedPlanType === 'ENTERPRISE'
            ? mapPriorityOverrideToValue(createForm.priorityOverride)
            : null,
      };
      await createOrganizationAdmin(payload);
      showToast('Organization created successfully', 'success');
      setCreateOpen(false);
      setCreateLogoMode('upload');
      setCreateForm({
        name: '',
        email: '',
        password: '',
        website: '',
        phone: '',
        address: '',
        countryId: '',
        stateId: '',
        categoryId: '',
        type: 'PUBLIC',
        priority: 'NORMAL',
        about: '',
        logo: '',
        planType: 'FREE',
        planStatus: 'ACTIVE',
        billingTerm: 'MONTHLY',
        amountCents: '',
        durationPreset: '30',
        customDays: '',
        priorityOverride: 'HIGH',
      });
      setCreateConfirmPassword('');
      resetCreateLogoSelection();
      loadOrgs();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || 'Failed to create organization',
        'error',
      );
    } finally {
      setCreating(false);
    }
  };

  const createLogoPreviewSource = createLogoPreviewUrl
    ? createLogoPreviewUrl
    : createForm.logo
      ? createForm.logo.startsWith('http') ||
        createForm.logo.startsWith('/') ||
        createForm.logo.startsWith('//')
        ? createForm.logo
        : toPreviewUrl(createForm.logo)
      : '';

  const editUrlPreview = logoUrlInput ? toPreviewUrl(logoUrlInput) : '';
  const editLogoPreviewSource = editLogoPreviewUrl
    ? editLogoPreviewUrl
    : useLogoUrl
      ? logoError
        ? ''
        : editUrlPreview
      : logoPathInput || editForm.logo || '';

  return (
    <div className='space-y-6'>
      <div className='flex justify-between items-center'>
        <h1 className='text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2'>
          <Building2 className='w-8 h-8 text-blue-600 dark:text-blue-500' />
          Manage Organizations
        </h1>
        <div className='flex items-center gap-2'>
          <button
            onClick={() => {
              setCreateLogoMode('upload');
              setCreateOpen(true);
            }}
            className='bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors'
          >
            <Building2 className='w-4 h-4' />
            Create Organization
          </button>
          {selectedIds.length > 0 && (
            <>
              <button
                onClick={() => openPriorityModal(selectedIds)}
                className='btn-primary px-4 py-2 rounded-lg flex items-center gap-2 transition-colors animate-fade-in'
              >
                <Shield className='w-4 h-4' />
                Set Priority ({selectedIds.length})
              </button>
              <button
                onClick={() => openPlanModal(selectedIds)}
                className='bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors animate-fade-in'
              >
                <Shield className='w-4 h-4' />
                Set Plan ({selectedIds.length})
              </button>
              <button
                onClick={handleBulkDelete}
                className='bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors animate-fade-in'
              >
                <Trash2 className='w-4 h-4' />
                Delete ({selectedIds.length})
              </button>
            </>
          )}
        </div>
      </div>

      <div className='flex flex-wrap gap-2 items-center'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4' />
          <input
            type='text'
            placeholder='Search organizations...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='w-full md:w-64 surface-card rounded-lg pl-9 pr-4 py-2.5 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500'
          />
        </div>

        <select
          value={filters.countryId}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              countryId: e.target.value,
              stateId: '',
            }))
          }
          className='surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]'
        >
          <option value=''>All Countries</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={filters.deleted}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, deleted: e.target.value as any }))
          }
          className='surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[140px]'
        >
          <option value='exclude'>Active Orgs</option>
          <option value='only'>Deleted Orgs</option>
          <option value='include'>All Orgs</option>
        </select>

        <select
          value={filters.stateId}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, stateId: e.target.value }))
          }
          disabled={!filters.countryId}
          className='surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]'
        >
          <option value=''>All States</option>
          {filterStates.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={filters.categoryId}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, categoryId: e.target.value }))
          }
          className='surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]'
        >
          <option value=''>All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={filters.type}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, type: e.target.value }))
          }
          className='surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]'
        >
          <option value=''>All Types</option>
          <option value='PUBLIC'>Public</option>
          <option value='PRIVATE'>Private</option>
          <option value='NON_PROFIT'>Non-profit</option>
        </select>

        <select
          value={filters.priority}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, priority: e.target.value }))
          }
          className='surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]'
        >
          <option value=''>All Priorities</option>
          <option value='HIGH'>High</option>
          <option value='MEDIUM'>Medium</option>
          <option value='NORMAL'>Normal</option>
          <option value='LOW'>Low</option>
        </select>

        <select
          value={filters.planType}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, planType: e.target.value }))
          }
          className='surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]'
        >
          <option value=''>All Plans</option>
          <option value='FREE'>Free</option>
          <option value='BASIC'>Basic</option>
          <option value='PRO'>Pro</option>
          <option value='BUSINESS'>Business</option>
          <option value='ENTERPRISE'>Enterprise</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, status: e.target.value }))
          }
          className='surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]'
        >
          <option value=''>All Statuses</option>
          <option value='PENDING'>Pending</option>
          <option value='APPROVED'>Approved</option>
          <option value='REJECTED'>Rejected</option>
        </select>

        {(filters.countryId ||
          filters.stateId ||
          filters.categoryId ||
          filters.status ||
          filters.type ||
          filters.priority ||
          filters.planType) && (
          <button
            onClick={() =>
              setFilters({
                countryId: '',
                stateId: '',
                categoryId: '',
                status: '',
                type: '',
                priority: '',
                planType: '',
                deleted: 'exclude',
              })
            }
            className='bg-app-secondary hover:bg-slate-200 dark:hover:bg-slate-700 text-[var(--app-text-secondary)] px-4 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2'
          >
            <X className='w-4 h-4' />
            Reset
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton cols={8} rows={5} />
      ) : (
        <div className='surface-card rounded-xl border-[var(--app-border)] overflow-x-auto shadow-sm'>
          <table className='w-full text-left border-collapse'>
            <thead className='bg-app-secondary/50 text-[var(--app-text-secondary)] text-sm uppercase font-medium'>
              <tr>
                <th className='px-4 py-4 w-10'>
                  <input
                    type='checkbox'
                    checked={
                      filteredOrgs.length > 0 &&
                      selectedIds.length === filteredOrgs.length
                    }
                    onChange={handleSelectAll}
                    className='rounded border-[var(--app-border)] text-blue-600 focus:ring-blue-500 bg-transparent transition-colors'
                  />
                </th>
                <th className='px-4 py-4 min-w-[280px]'>Organization</th>
                <th className='px-4 py-4 w-[100px]'>Priority</th>
                <th className='px-4 py-4 w-[100px]'>Type</th>
                <th className='px-4 py-4 min-w-[200px]'>Contact</th>
                <th className='px-4 py-4 w-[120px]'>Country</th>
                <th className='px-4 py-4 w-[120px]'>Status</th>
                <th className='px-4 py-4 w-[140px] text-right'>Actions</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-200 dark:divide-slate-700'>
              {filteredOrgs.map((org) => (
                <tr
                  key={org.id}
                  className={`group hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${selectedIds.includes(org.id) ? 'bg-blue-50/50 dark:bg-slate-700/20' : ''}`}
                >
                  <td className='px-4 py-4'>
                    <input
                      type='checkbox'
                      checked={selectedIds.includes(org.id)}
                      onChange={() => handleSelectRow(org.id)}
                      className='rounded border-[var(--app-border)] text-blue-600 focus:ring-blue-500 bg-transparent transition-colors'
                    />
                  </td>
                  <td className='px-4 py-4'>
                    <div className='flex items-center gap-4'>
                      <div className='relative flex-shrink-0 w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 flex items-center justify-center overflow-hidden transition-all group-hover:border-slate-300 dark:group-hover:border-slate-600 group-hover:shadow-sm'>
                        {org.logo &&
                        !org.logo.includes('via.placeholder.com') ? (
                          <Image
                            key={org.logo}
                            src={toProxyImageUrl(org.logo)}
                            alt={org.name}
                            fill
                            className='object-cover'
                            sizes='44px'
                          />
                        ) : (
                          <Building2 className='w-5 h-5 text-slate-400 dark:text-slate-500' />
                        )}
                      </div>
                      <div className='flex flex-col min-w-0 justify-center gap-0.5'>
                        <div className='flex items-center gap-2'>
                          <span
                            className='font-semibold text-slate-900 dark:text-white text-sm truncate max-w-[180px]'
                            title={org.name}
                          >
                            {org.name}
                          </span>
                          {org.isRestricted && (
                            <span className='flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-red-400/10 text-red-400 border border-red-400/20 tracking-wider'>
                              Restricted
                            </span>
                          )}
                        </div>
                        <a
                          href={org.website}
                          target='_blank'
                          rel='noreferrer'
                          className='text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate max-w-[180px] font-mono'
                          title={org.website}
                        >
                          {org.website
                            ? org.website.replace(/^https?:\/\/(www\.)?/, '')
                            : ''}
                        </a>
                      </div>
                    </div>
                  </td>
                  <td className='px-4 py-4'>
                    <button
                      onClick={() =>
                        openPriorityModal([org.id], org.priority || 'NORMAL')
                      }
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all hover:bg-opacity-20 ${
                        org.priority === 'HIGH'
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                          : org.priority === 'MEDIUM'
                            ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30'
                            : org.priority === 'LOW'
                              ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30'
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                      }`}
                    >
                      {org.priority || 'NORMAL'}
                    </button>
                    {org.priorityExpiresAt &&
                      new Date(org.priorityExpiresAt) > new Date() && (
                        <div className='text-[10px] text-slate-500 mt-1 flex items-center justify-center gap-1'>
                          <span className='w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse'></span>
                          {Math.ceil(
                            (new Date(org.priorityExpiresAt).getTime() -
                              new Date().getTime()) /
                              (1000 * 60 * 60 * 24),
                          )}
                          d left
                        </div>
                      )}
                  </td>
                  <td className='px-4 py-4'>
                    <span className='inline-flex items-center px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700/50'>
                      {org.type
                        ? org.type.charAt(0) + org.type.slice(1).toLowerCase()
                        : 'Public'}
                    </span>
                  </td>
                  <td className='px-4 py-4 text-slate-600 dark:text-slate-300'>
                    <div
                      className='text-sm truncate max-w-[200px]'
                      title={org.email}
                    >
                      {org.email}
                    </div>
                  </td>
                  <td className='px-4 py-4 text-slate-500 dark:text-slate-400 text-sm whitespace-nowrap'>
                    {org.country?.name || '-'}
                  </td>
                  <td className='px-4 py-4'>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${
                        org.status === 'APPROVED'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : org.status === 'REJECTED'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-yellow-500/10 text-yellow-400'
                      }`}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className='px-4 py-4 text-right'>
                    <div className='flex items-center justify-end gap-2 opacity-100 transition-opacity'>
                      {org.deletedAt ? (
                        <>
                          <button
                            onClick={() => handleRestore(org.id)}
                            className='p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors'
                            title='Restore'
                          >
                            <CheckCircle className='w-4 h-4' />
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(org.id)}
                            className='p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors'
                            title='Permanently Delete'
                          >
                            <Trash2 className='w-4 h-4' />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggleRestriction(org)}
                            className={`p-1.5 rounded-lg transition-colors ${org.isRestricted ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-orange-400 hover:bg-orange-400/10'}`}
                            title={
                              org.isRestricted
                                ? 'Unrestrict Organization'
                                : 'Restrict Organization'
                            }
                          >
                            {org.isRestricted ? (
                              <CheckCircle className='w-4 h-4' />
                            ) : (
                              <Ban className='w-4 h-4' />
                            )}
                          </button>
                          <button
                            onClick={() => startEdit(org)}
                            className='p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors'
                            title='Edit'
                          >
                            <Edit className='w-4 h-4' />
                          </button>

                          {org.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() =>
                                  handleStatusChange(org.id, 'APPROVED')
                                }
                                className='p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors'
                                title='Approve'
                              >
                                <CheckCircle className='w-4 h-4' />
                              </button>
                              <button
                                onClick={() =>
                                  handleStatusChange(org.id, 'REJECTED')
                                }
                                className='p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors'
                                title='Reject'
                              >
                                <XCircle className='w-4 h-4' />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(org.id)}
                            className='p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors'
                            title='Delete'
                          >
                            <Trash2 className='w-4 h-4' />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingOrg && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'>
          <div className='surface-card rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto'>
            <div className='p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center'>
              <h2 className='text-xl font-bold text-slate-900 dark:text-white'>
                Edit Organization
              </h2>
              <button
                onClick={() => {
                  if (editLogoPreviewUrl) {
                    URL.revokeObjectURL(editLogoPreviewUrl);
                  }
                  setEditLogoPreviewUrl(null);
                  setEditingOrg(null);
                }}
                className='text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              >
                <X className='w-5 h-5' />
              </button>
            </div>
            <form onSubmit={submitEdit} className='p-6 space-y-4'>
              <AdminOrgLogoPicker
                fileInputId='org-logo-upload'
                fileInputRef={editLogoInputRef}
                mode={useLogoUrl ? 'external' : 'upload'}
                onModeChange={(mode) => {
                  if (editLogoPreviewUrl) {
                    URL.revokeObjectURL(editLogoPreviewUrl);
                  }
                  setEditLogoPreviewUrl(null);
                  setLogoError(false);
                  if (mode === 'upload') {
                    setUseLogoUrl(false);
                    setLogoUrlInput('');
                  } else {
                    setUseLogoUrl(true);
                    setLogoPathInput('');
                  }
                }}
                previewSrc={editLogoPreviewSource}
                uploading={uploadingLogo}
                uploadLabel={editLogoPreviewSource ? 'Change logo' : 'Upload logo'}
                helperText='Max 5MB. Uses existing organization logo upload rules.'
                urlValue={logoUrlInput}
                onFileChange={handleLogoUpload}
                onUrlChange={(value) => {
                  if (editLogoPreviewUrl) {
                    URL.revokeObjectURL(editLogoPreviewUrl);
                  }
                  setEditLogoPreviewUrl(null);
                  setUseLogoUrl(true);
                  setLogoError(false);
                  setLogoPathInput('');
                  setLogoUrlInput(value);
                  setEditForm((prev) => ({ ...prev, logo: value }));
                }}
                onClear={resetEditLogoSelection}
                onPreviewError={() => setLogoError(true)}
              />

              <div className='grid grid-cols-2 gap-4 pt-2'>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Email
                  </label>
                  <input
                    required
                    type='email'
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                  />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Phone
                  </label>
                  <input
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                  />
                </div>
              </div>

              <div className='space-y-2'>
                <label className='text-sm text-slate-600 dark:text-slate-400'>
                  Website
                </label>
                <input
                  required
                  value={editForm.website}
                  onChange={(e) =>
                    setEditForm({ ...editForm, website: e.target.value })
                  }
                  className={adminOrgFormControlClass}
                />
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Country
                  </label>
                  <select
                    value={editForm.countryId}
                    onChange={(e) =>
                      setEditForm({ ...editForm, countryId: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                  >
                    <option value=''>Select Country</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    State
                  </label>
                  <select
                    value={editForm.stateId}
                    onChange={(e) =>
                      setEditForm({ ...editForm, stateId: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                    disabled={!editForm.countryId}
                  >
                    <option value=''>Select State</option>
                    {states.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Category
                  </label>
                  <select
                    value={editForm.categoryId}
                    onChange={(e) =>
                      setEditForm({ ...editForm, categoryId: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                  >
                    <option value=''>Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Type
                  </label>
                  <select
                    value={editForm.type}
                    onChange={(e) =>
                      setEditForm({ ...editForm, type: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                  >
                    <option value='PUBLIC'>Public</option>
                    <option value='PRIVATE'>Private</option>
                    <option value='NON_PROFIT'>Non-profit</option>
                  </select>
                </div>
              </div>
              <div className='space-y-2'>
                <label className='text-sm text-slate-600 dark:text-slate-400'>
                  Priority
                </label>
                <select
                  value={editForm.priority}
                  onChange={(e) =>
                    setEditForm({ ...editForm, priority: e.target.value })
                  }
                  className={adminOrgFormControlClass}
                >
                  <option value='LOW'>Low</option>
                  <option value='NORMAL'>Normal</option>
                  <option value='MEDIUM'>Medium</option>
                  <option value='HIGH'>High</option>
                </select>
              </div>

              <div className='space-y-2'>
                <label className='text-sm text-slate-600 dark:text-slate-400'>
                  About Organization
                </label>
                <textarea
                  value={editForm.about}
                  onChange={(e) =>
                    setEditForm({ ...editForm, about: e.target.value })
                  }
                  className={`${adminOrgFormControlClass} h-24`}
                  placeholder='Description...'
                />
              </div>

              <div className='space-y-3 pt-6 border-t border-slate-700/50'>
                <h3 className='text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2 mb-4 px-1'>
                  <Shield className='w-3 h-3' />
                  Plan & Subscription
                </h3>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <label className='text-sm text-slate-600 dark:text-slate-400'>
                      Plan Type
                    </label>
                    <select
                      value={planForm.planType}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, planType: e.target.value })
                      }
                      className={adminOrgFormControlClass}
                    >
                      <option value='FREE'>FREE</option>
                      <option value='BASIC'>BASIC</option>
                      <option value='PRO'>PRO</option>
                      <option value='BUSINESS'>BUSINESS</option>
                      <option value='ENTERPRISE'>ENTERPRISE</option>
                    </select>
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm text-slate-600 dark:text-slate-400'>
                      Plan Status
                    </label>
                    <select
                      value={planForm.planStatus}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, planStatus: e.target.value })
                      }
                      className={adminOrgFormControlClass}
                    >
                      <option value='ACTIVE'>ACTIVE</option>
                      <option value='EXPIRED'>EXPIRED</option>
                      <option value='CANCELLED'>CANCELLED</option>
                    </select>
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <label className='text-sm text-slate-600 dark:text-slate-400'>
                      Duration
                    </label>
                    <select
                      value={planForm.durationPreset}
                      onChange={(e) =>
                        setPlanForm({
                          ...planForm,
                          durationPreset: e.target.value,
                        })
                      }
                      className={adminOrgFormControlClass}
                    >
                      <option value='7'>7 Days</option>
                      <option value='15'>15 Days</option>
                      <option value='30'>30 Days</option>
                      <option value='custom'>Custom</option>
                    </select>
                  </div>
                  {planForm.durationPreset === 'custom' && (
                    <div className='space-y-2'>
                      <label className='text-sm text-slate-600 dark:text-slate-400'>
                        Custom Days
                      </label>
                      <input
                        type='number'
                        min='0'
                        value={planForm.customDays}
                        onChange={(e) =>
                          setPlanForm({
                            ...planForm,
                            customDays: e.target.value,
                          })
                        }
                        className={adminOrgFormControlClass}
                        placeholder='e.g. 45'
                      />
                    </div>
                  )}
                </div>
                {planForm.planType === 'ENTERPRISE' && (
                  <div className='space-y-4'>
                    <div className='space-y-2'>
                      <label className='text-sm text-slate-600 dark:text-slate-400'>
                        Enterprise Priority Override
                      </label>
                      <select
                        value={planForm.priorityOverride}
                        onChange={(e) =>
                          setPlanForm({
                            ...planForm,
                            priorityOverride: e.target.value,
                          })
                        }
                        className={adminOrgFormControlClass}
                      >
                        <option value='HIGH'>HIGH</option>
                        <option value='MEDIUM'>MEDIUM</option>
                        <option value='NORMAL'>NORMAL</option>
                        <option value='LOW'>LOW</option>
                      </select>
                    </div>

                    <div className='space-y-3'>
                      <div className='flex items-center justify-between gap-3'>
                        <h4 className='text-sm text-slate-600 dark:text-slate-400'>
                          Enterprise Limits
                        </h4>
                        <span className='inline-flex items-center rounded-full border border-slate-300 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-900/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400'>
                          Applies per workspace
                        </span>
                      </div>
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                        <div className='rounded-xl border border-[var(--app-border)] bg-white/30 dark:bg-slate-900/30 p-3 space-y-2'>
                          <div className='flex items-start gap-2'>
                            <span className='mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20'>
                              <Building2 className='w-3.5 h-3.5' />
                            </span>
                            <div className='space-y-0.5'>
                              <label
                                htmlFor='enterprise-max-workspaces'
                                className='block text-sm font-medium text-slate-700 dark:text-slate-200'
                              >
                                Workspace Limit
                              </label>
                              <p
                                id='enterprise-max-workspaces-help'
                                className='text-xs text-slate-500 dark:text-slate-400'
                              >
                                Maximum workspaces allowed for this enterprise
                                organization.
                              </p>
                            </div>
                          </div>
                          <input
                            id='enterprise-max-workspaces'
                            aria-describedby='enterprise-max-workspaces-help'
                            type='number'
                            min='1'
                            max='1000000'
                            value={planForm.enterpriseMaxWorkspaces}
                            onChange={(e) =>
                              setPlanForm({
                                ...planForm,
                                enterpriseMaxWorkspaces: e.target.value,
                              })
                            }
                            className={adminOrgCompactControlClass}
                            placeholder='Max workspaces'
                          />
                        </div>

                        <div className='rounded-xl border border-[var(--app-border)] bg-white/30 dark:bg-slate-900/30 p-3 space-y-2'>
                          <div className='flex items-start gap-2'>
                            <span className='mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20'>
                              <Link2 className='w-3.5 h-3.5' />
                            </span>
                            <div className='space-y-0.5'>
                              <label
                                htmlFor='enterprise-max-linked-orgs'
                                className='block text-sm font-medium text-slate-700 dark:text-slate-200'
                              >
                                Linked Organizations / Workspace
                              </label>
                              <p
                                id='enterprise-max-linked-orgs-help'
                                className='text-xs text-slate-500 dark:text-slate-400'
                              >
                                Maximum linked organizations each workspace can
                                connect.
                              </p>
                            </div>
                          </div>
                          <input
                            id='enterprise-max-linked-orgs'
                            aria-describedby='enterprise-max-linked-orgs-help'
                            type='number'
                            min='1'
                            max='1000000'
                            value={planForm.enterpriseMaxLinkedOrgs}
                            onChange={(e) =>
                              setPlanForm({
                                ...planForm,
                                enterpriseMaxLinkedOrgs: e.target.value,
                              })
                            }
                            className={adminOrgCompactControlClass}
                            placeholder='Max linked organizations'
                          />
                        </div>

                        <div className='rounded-xl border border-[var(--app-border)] bg-white/30 dark:bg-slate-900/30 p-3 space-y-2'>
                          <div className='flex items-start gap-2'>
                            <span className='mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20'>
                              <Key className='w-3.5 h-3.5' />
                            </span>
                            <div className='space-y-0.5'>
                              <label
                                htmlFor='enterprise-max-api-keys'
                                className='block text-sm font-medium text-slate-700 dark:text-slate-200'
                              >
                                API Keys / Workspace
                              </label>
                              <p
                                id='enterprise-max-api-keys-help'
                                className='text-xs text-slate-500 dark:text-slate-400'
                              >
                                Maximum active API keys each workspace can
                                maintain.
                              </p>
                            </div>
                          </div>
                          <input
                            id='enterprise-max-api-keys'
                            aria-describedby='enterprise-max-api-keys-help'
                            type='number'
                            min='1'
                            max='1000000'
                            value={planForm.enterpriseMaxApiKeys}
                            onChange={(e) =>
                              setPlanForm({
                                ...planForm,
                                enterpriseMaxApiKeys: e.target.value,
                              })
                            }
                            className={adminOrgCompactControlClass}
                            placeholder='Max API keys'
                          />
                        </div>

                        <div className='rounded-xl border border-[var(--app-border)] bg-white/30 dark:bg-slate-900/30 p-3 space-y-2'>
                          <div className='flex items-start gap-2'>
                            <span className='mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20'>
                              <Users className='w-3.5 h-3.5' />
                            </span>
                            <div className='space-y-0.5'>
                              <label
                                htmlFor='enterprise-max-members'
                                className='block text-sm font-medium text-slate-700 dark:text-slate-200'
                              >
                                Members / Workspace
                              </label>
                              <p
                                id='enterprise-max-members-help'
                                className='text-xs text-slate-500 dark:text-slate-400'
                              >
                                Maximum members and pending invites allowed per
                                workspace.
                              </p>
                            </div>
                          </div>
                          <input
                            id='enterprise-max-members'
                            aria-describedby='enterprise-max-members-help'
                            type='number'
                            min='1'
                            max='1000000'
                            value={planForm.enterpriseMaxMembers}
                            onChange={(e) =>
                              setPlanForm({
                                ...planForm,
                                enterpriseMaxMembers: e.target.value,
                              })
                            }
                            className={adminOrgCompactControlClass}
                            placeholder='Max members'
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className='space-y-3 pt-6 border-t border-slate-200 dark:border-slate-700/50'>
                <div className='flex items-center justify-between gap-3 px-1'>
                  <h3 className='text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2'>
                    <Shield className='w-3 h-3' />
                    Super Admin Controls
                  </h3>
                  <span className='inline-flex items-center rounded-full border border-slate-300 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-900/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400'>
                    Admin-only
                  </span>
                </div>

                <div className='surface-card rounded-xl border border-[var(--app-border)] p-4 sm:p-5 space-y-4'>
                  <div className='rounded-xl border border-[var(--app-border)] bg-white/35 dark:bg-slate-900/30 p-4 space-y-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <label
                        htmlFor='org-login-email'
                        className='text-sm font-medium text-slate-700 dark:text-slate-200'
                      >
                        Authentication Email
                      </label>
                    </div>
                    <div className='flex flex-col sm:flex-row sm:items-end gap-3'>
                      <div className='relative flex-1 group'>
                        <Mail className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 transition-colors' />
                        <input
                          id='org-login-email'
                          type='email'
                          value={editForm.loginEmail || editForm.email}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              loginEmail: e.target.value,
                            })
                          }
                          className='w-full bg-white dark:bg-slate-950/50 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all placeholder-slate-400 dark:placeholder-slate-600'
                          placeholder='Enter login email'
                        />
                      </div>
                      <button
                        type='button'
                        onClick={() => handleUpdateLoginEmail()}
                        className='w-full sm:w-auto px-4 py-2 btn-primary rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95 whitespace-nowrap'
                      >
                        Update Email
                      </button>
                    </div>
                    <p className='text-xs text-slate-500 dark:text-slate-400'>
                      Changing this updates the organization&apos;s primary
                      login email immediately.
                    </p>
                  </div>

                  <div className='rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50/70 dark:bg-red-500/10 p-4'>
                    <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2'>
                          <Key className='w-4 h-4 text-red-600 dark:text-red-400' />
                          Emergency Password Reset
                        </h4>
                        <p className='text-xs text-red-700/80 dark:text-red-400/75 max-w-md leading-relaxed'>
                          Forces a logout for all active sessions and requires
                          the organization to set a new password at next login.
                        </p>
                      </div>
                      <button
                        type='button'
                        onClick={() => handleResetPassword()}
                        className='w-full sm:w-auto px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white border border-red-700/20 dark:border-red-500/30 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed'
                      >
                        <Lock className='w-3.5 h-3.5' />
                        Reset Credentials
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className='flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700'>
                <button
                  type='button'
                  onClick={() => {
                    if (editLogoPreviewUrl) {
                      URL.revokeObjectURL(editLogoPreviewUrl);
                    }
                    setEditLogoPreviewUrl(null);
                    setEditingOrg(null);
                  }}
                  className='px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={saving}
                  className='px-6 py-2 btn-primary rounded-lg flex items-center gap-2'
                >
                  {saving && <Loader2 className='w-4 h-4 animate-spin' />}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Priority Modal */}
      {priorityModalOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in'>
          <div className='surface-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center'>
              <h2 className='text-xl font-bold text-slate-900 dark:text-white'>
                Set Priority
              </h2>
              <button
                onClick={() => setPriorityModalOpen(false)}
                className='text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]'
              >
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-6 space-y-6'>
              <p className='text-[var(--app-text-secondary)] text-sm'>
                Set priority for{' '}
                <span className='text-[var(--app-text-primary)] font-bold'>
                  {priorityTargetIds.length}
                </span>{' '}
                selected organizations. Higher priority organizations appear
                first in search results.
              </p>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-[var(--app-text-secondary)]'>
                  Priority Level
                </label>
                <div className='grid grid-cols-1 gap-2'>
                  {['HIGH', 'MEDIUM', 'NORMAL', 'LOW'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setTargetPriority(p)}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                        targetPriority === p
                          ? 'bg-[var(--app-primary)]/10 border-[var(--app-primary)] text-[var(--app-primary)]'
                          : 'bg-transparent border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text-primary)]'
                      }`}
                    >
                      <span className='font-semibold'>{p}</span>
                      {targetPriority === p && (
                        <CheckCircle className='w-5 h-5 text-[var(--app-primary)]' />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-slate-700 dark:text-slate-300'>
                  Duration
                </label>
                <select
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(parseInt(e.target.value))}
                  className='w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-3 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500'
                >
                  <option value={0}>Permanent (No Expiration)</option>
                  <option value={1}>1 Day</option>
                  <option value={2}>2 Days</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>1 Week</option>
                  <option value={15}>15 Days</option>
                  <option value={30}>30 Days</option>
                </select>
                <p className='text-xs text-slate-500'>
                  Priority will revert to NORMAL after this duration.
                </p>
              </div>

              <div className='flex justify-end gap-3 pt-2'>
                <button
                  onClick={() => setPriorityModalOpen(false)}
                  className='px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePriority}
                  disabled={saving}
                  className='px-6 py-2 btn-primary rounded-lg flex items-center gap-2'
                >
                  {saving && <Loader2 className='w-4 h-4 animate-spin' />}
                  Save Priority
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {planModalOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in'>
          <div className='surface-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center'>
              <h2 className='text-xl font-bold text-slate-900 dark:text-white'>
                Set Plan
              </h2>
              <button
                onClick={() => setPlanModalOpen(false)}
                className='text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              >
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-6 space-y-6'>
              <p className='text-slate-600 dark:text-slate-400 text-sm'>
                Update plan for{' '}
                <span className='text-slate-900 dark:text-white font-bold'>
                  {planTargetIds.length}
                </span>{' '}
                selected organizations.
              </p>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-slate-700 dark:text-slate-300'>
                  Plan Type
                </label>
                <select
                  value={bulkPlanForm.planType}
                  onChange={(e) =>
                    setBulkPlanForm((prev) => ({
                      ...prev,
                      planType: e.target.value,
                    }))
                  }
                  className='w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500'
                >
                  <option value='FREE'>FREE</option>
                  <option value='BASIC'>BASIC</option>
                  <option value='PRO'>PRO</option>
                  <option value='BUSINESS'>BUSINESS</option>
                  <option value='ENTERPRISE'>ENTERPRISE</option>
                </select>
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-slate-300'>
                  Plan Status
                </label>
                <select
                  value={bulkPlanForm.planStatus}
                  onChange={(e) =>
                    setBulkPlanForm((prev) => ({
                      ...prev,
                      planStatus: e.target.value,
                    }))
                  }
                  className='w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500'
                >
                  <option value='ACTIVE'>ACTIVE</option>
                  <option value='EXPIRED'>EXPIRED</option>
                  <option value='CANCELLED'>CANCELLED</option>
                </select>
              </div>

              <div className='space-y-2'>
                <label className='text-sm font-medium text-slate-300'>
                  Duration
                </label>
                <select
                  value={bulkPlanForm.durationPreset}
                  onChange={(e) =>
                    setBulkPlanForm((prev) => ({
                      ...prev,
                      durationPreset: e.target.value,
                    }))
                  }
                  className='w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500'
                >
                  <option value='7'>7 Days</option>
                  <option value='15'>15 Days</option>
                  <option value='30'>30 Days</option>
                  <option value='custom'>Custom</option>
                </select>
              </div>

              {bulkPlanForm.durationPreset === 'custom' && (
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-slate-300'>
                    Custom Days
                  </label>
                  <input
                    type='number'
                    min='0'
                    value={bulkPlanForm.customDays}
                    onChange={(e) =>
                      setBulkPlanForm((prev) => ({
                        ...prev,
                        customDays: e.target.value,
                      }))
                    }
                    className='w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500'
                    placeholder='e.g. 45'
                  />
                </div>
              )}

              {bulkPlanForm.planType === 'ENTERPRISE' && (
                <div className='space-y-2'>
                  <label className='text-sm font-medium text-slate-300'>
                    Enterprise Priority Override
                  </label>
                  <select
                    value={bulkPlanForm.priorityOverride}
                    onChange={(e) =>
                      setBulkPlanForm((prev) => ({
                        ...prev,
                        priorityOverride: e.target.value,
                      }))
                    }
                    className='w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500'
                  >
                    <option value='HIGH'>HIGH</option>
                    <option value='MEDIUM'>MEDIUM</option>
                    <option value='NORMAL'>NORMAL</option>
                    <option value='LOW'>LOW</option>
                  </select>
                </div>
              )}

              <div className='flex justify-end gap-3 pt-2'>
                <button
                  onClick={() => setPlanModalOpen(false)}
                  className='px-4 py-2 text-slate-400 hover:text-white'
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePlanBulk}
                  disabled={saving}
                  className='px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2'
                >
                  {saving && <Loader2 className='w-4 h-4 animate-spin' />}
                  Save Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'>
          <div className='surface-card rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto'>
            <div className='p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center'>
              <h2 className='text-xl font-bold text-slate-900 dark:text-white'>
                Create Organization
              </h2>
              <button
                onClick={() => {
                  setCreateOpen(false);
                  setCreateLogoMode('upload');
                  setCreateConfirmPassword('');
                  resetCreateLogoSelection();
                }}
                className='text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              >
                <X className='w-5 h-5' />
              </button>
            </div>
            <form onSubmit={handleCreateOrg} className='p-6 space-y-4'>
              <AdminOrgLogoPicker
                fileInputId='create-org-logo-upload'
                fileInputRef={createLogoInputRef}
                mode={createLogoMode}
                onModeChange={(mode) => {
                  setCreateLogoMode(mode);
                  setCreateLogoError('');
                  if (mode === 'upload' && createLogoPreviewUrl) {
                    URL.revokeObjectURL(createLogoPreviewUrl);
                    setCreateLogoPreviewUrl(null);
                  }
                  if (mode === 'upload') {
                    setCreateForm((prev) => ({ ...prev, logo: '' }));
                  }
                }}
                previewSrc={createLogoPreviewSource}
                uploading={uploadingLogo}
                uploadLabel={createLogoPreviewSource ? 'Change logo' : 'Upload logo'}
                helperText='Max 1MB. Formats: PNG, JPG, JPEG, WEBP, SVG.'
                urlValue={createForm.logo}
                onFileChange={handleCreateLogoUpload}
                onUrlChange={(value) => {
                  if (createLogoPreviewUrl) {
                    URL.revokeObjectURL(createLogoPreviewUrl);
                  }
                  setCreateLogoPreviewUrl(null);
                  setCreateLogoError('');
                  setCreateForm((prev) => ({ ...prev, logo: value }));
                }}
                onClear={resetCreateLogoSelection}
                onPreviewError={() =>
                  setCreateLogoError('Unable to load logo preview')
                }
                errorText={createLogoError}
              />

              <div className='space-y-2'>
                <label className='text-sm text-slate-600 dark:text-slate-400'>
                  Organization Name
                </label>
                <input
                  required
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  className={adminOrgFormControlClass}
                />
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Email
                  </label>
                  <input
                    required
                    type='email'
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, email: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                  />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Phone
                  </label>
                  <input
                    required
                    value={createForm.phone}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, phone: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                  />
                </div>
              </div>
              <PasswordFields
                password={createForm.password}
                setPassword={(value) =>
                  setCreateForm({ ...createForm, password: value })
                }
                confirmPassword={createConfirmPassword}
                setConfirmPassword={setCreateConfirmPassword}
                required
                labelPassword='Password'
                labelConfirm='Confirm Password'
                labelClassName='text-sm text-slate-600 dark:text-slate-400'
                inputClassName={adminOrgFormControlClass}
              />
              <div className='space-y-2'>
                <label className='text-sm text-slate-600 dark:text-slate-400'>
                  Website
                </label>
                <input
                  required
                  value={createForm.website}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, website: e.target.value })
                  }
                  className={adminOrgFormControlClass}
                />
              </div>
              <div className='space-y-2'>
                <label className='text-sm text-slate-600 dark:text-slate-400'>
                  Address
                </label>
                <input
                  required
                  value={createForm.address}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, address: e.target.value })
                  }
                  className={adminOrgFormControlClass}
                />
              </div>
              <div className='grid grid-cols-3 gap-4'>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Country
                  </label>
                  <select
                    required
                    value={createForm.countryId}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        countryId: e.target.value,
                      })
                    }
                    className={adminOrgFormControlClass}
                  >
                    <option value=''>Select</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    State
                  </label>
                  <select
                    value={createForm.stateId}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, stateId: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                    disabled={!createForm.countryId}
                  >
                    <option value=''>Optional</option>
                    {states.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Category
                  </label>
                  <select
                    required
                    value={createForm.categoryId}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        categoryId: e.target.value,
                      })
                    }
                    className={adminOrgFormControlClass}
                  >
                    <option value=''>Select</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Type
                  </label>
                  <select
                    value={createForm.type}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, type: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                  >
                    <option value='PUBLIC'>Public</option>
                    <option value='PRIVATE'>Private</option>
                    <option value='NON_PROFIT'>Non Profit</option>
                  </select>
                </div>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Priority
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, priority: e.target.value })
                    }
                    className={adminOrgFormControlClass}
                  >
                    <option value='LOW'>Low</option>
                    <option value='NORMAL'>Normal</option>
                    <option value='MEDIUM'>Medium</option>
                    <option value='HIGH'>High</option>
                  </select>
                </div>
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Plan Type
                  </label>
                  <select
                    value={createForm.planType}
                    onChange={(e) => {
                      const nextPlanType = e.target.value;
                      setCreateForm((prev) => {
                        if (isSelfServePlan(nextPlanType)) {
                          const nextAmount = resolveSelfServeAmountCents(
                            nextPlanType,
                            prev.billingTerm,
                          );
                          return {
                            ...prev,
                            planType: nextPlanType,
                            amountCents: String(nextAmount),
                          };
                        }

                        if (nextPlanType === 'FREE') {
                          return {
                            ...prev,
                            planType: nextPlanType,
                            amountCents: '',
                          };
                        }

                        return {
                          ...prev,
                          planType: nextPlanType,
                        };
                      });
                    }}
                    className={adminOrgFormControlClass}
                  >
                    <option value='FREE'>FREE</option>
                    <option value='BASIC'>BASIC</option>
                    <option value='PRO'>PRO</option>
                    <option value='BUSINESS'>BUSINESS</option>
                    <option value='ENTERPRISE'>ENTERPRISE</option>
                  </select>
                </div>
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Plan Status
                  </label>
                  <select
                    value={createForm.planStatus}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        planStatus: e.target.value,
                      })
                    }
                    className={adminOrgFormControlClass}
                  >
                    <option value='ACTIVE'>ACTIVE</option>
                    <option value='EXPIRED'>EXPIRED</option>
                    <option value='CANCELLED'>CANCELLED</option>
                  </select>
                </div>
              </div>
              {createForm.planType === 'FREE' ? (
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <label className='text-sm text-slate-600 dark:text-slate-400'>
                      Plan Duration
                    </label>
                    <select
                      value={createForm.durationPreset}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          durationPreset: e.target.value,
                        })
                      }
                      className={adminOrgFormControlClass}
                    >
                      <option value='7'>7 Days</option>
                      <option value='15'>15 Days</option>
                      <option value='30'>30 Days</option>
                      <option value='custom'>Custom</option>
                    </select>
                  </div>
                  {createForm.durationPreset === 'custom' ? (
                    <div className='space-y-2'>
                      <label className='text-sm text-slate-600 dark:text-slate-400'>
                        Custom Days
                      </label>
                      <input
                        type='number'
                        min='0'
                        value={createForm.customDays}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            customDays: e.target.value,
                          })
                        }
                        className={adminOrgFormControlClass}
                      />
                    </div>
                  ) : (
                    <div />
                  )}
                </div>
              ) : (
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <label className='text-sm text-slate-600 dark:text-slate-400'>
                      Billing Term
                    </label>
                    <select
                      value={createForm.billingTerm}
                      onChange={(e) => {
                        const nextBillingTerm = e.target.value as
                          | 'MONTHLY'
                          | 'ANNUAL';
                        setCreateForm((prev) => {
                          if (isSelfServePlan(prev.planType)) {
                            const nextAmount = resolveSelfServeAmountCents(
                              prev.planType,
                              nextBillingTerm,
                            );
                            return {
                              ...prev,
                              billingTerm: nextBillingTerm,
                              amountCents: String(nextAmount),
                            };
                          }

                          return {
                            ...prev,
                            billingTerm: nextBillingTerm,
                          };
                        });
                      }}
                      className={adminOrgFormControlClass}
                    >
                      {BILLING_TERM_OPTIONS.map((term) => (
                        <option key={term.value} value={term.value}>
                          {term.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {createForm.planType === 'ENTERPRISE' ? (
                    <div className='space-y-2'>
                      <label className='text-sm text-slate-600 dark:text-slate-400'>
                        Invoice Amount (cents)
                      </label>
                      <input
                        type='number'
                        min='1'
                        value={createForm.amountCents}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            amountCents: e.target.value,
                          })
                        }
                        placeholder='e.g. 120000'
                        className={adminOrgFormControlClass}
                      />
                    </div>
                  ) : (
                    <div className='space-y-2'>
                      <label className='text-sm text-slate-600 dark:text-slate-400'>
                        Invoice Amount
                      </label>
                      <div
                        className={`${adminOrgFormControlClass} bg-slate-50 dark:bg-slate-900/60 flex items-center`}
                      >
                        ${(resolveCreateBillingAmountCents() / 100).toFixed(2)}{' '}
                        USD
                      </div>
                    </div>
                  )}
                </div>
              )}
              {createForm.planType === 'ENTERPRISE' && (
                <div className='space-y-2'>
                  <label className='text-sm text-slate-600 dark:text-slate-400'>
                    Enterprise Priority Override
                  </label>
                  <select
                    value={createForm.priorityOverride}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        priorityOverride: e.target.value,
                      })
                    }
                    className={adminOrgFormControlClass}
                  >
                    <option value='HIGH'>HIGH</option>
                    <option value='MEDIUM'>MEDIUM</option>
                    <option value='NORMAL'>NORMAL</option>
                    <option value='LOW'>LOW</option>
                  </select>
                </div>
              )}
              <div className='space-y-2'>
                <label className='text-sm text-slate-600 dark:text-slate-400'>
                  About (optional)
                </label>
                <textarea
                  value={createForm.about}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, about: e.target.value })
                  }
                  className={`${adminOrgFormControlClass} h-20`}
                />
              </div>
              <div className='flex justify-end gap-3 pt-2'>
                <button
                  type='button'
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateLogoMode('upload');
                    setCreateConfirmPassword('');
                    resetCreateLogoSelection();
                  }}
                  className='px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={creating}
                  className='px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg'
                >
                  {creating ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetPasswordModalOpen && resetTempPassword && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'>
          <div className='surface-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden'>
            <div className='p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center'>
              <h2 className='text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2'>
                <Key className='w-5 h-5 text-amber-500 dark:text-amber-400' />
                Password Reset Successful
              </h2>
              <button
                onClick={() => {
                  setResetPasswordModalOpen(false);
                  setResetTempPassword(null);
                }}
                className='text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              >
                <X className='w-5 h-5' />
              </button>
            </div>
            <div className='p-6 space-y-4'>
              <p className='text-sm text-slate-600 dark:text-slate-400'>
                A temporary password has been generated. Copy it now and share
                it with the organization securely.
              </p>
              <div className='relative'>
                <div className='bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-4 font-mono text-lg text-amber-600 dark:text-amber-300 text-center tracking-wider select-all break-all'>
                  {resetTempPassword}
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(resetTempPassword);
                    setResetPasswordCopied(true);
                    setTimeout(() => setResetPasswordCopied(false), 3000);
                  } catch {
                    // Fallback
                    const textarea = document.createElement('textarea');
                    textarea.value = resetTempPassword;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    setResetPasswordCopied(true);
                    setTimeout(() => setResetPasswordCopied(false), 3000);
                  }
                }}
                className={`w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                  resetPasswordCopied
                    ? 'bg-emerald-600 text-white'
                    : 'btn-primary'
                }`}
              >
                {resetPasswordCopied ? (
                  <>
                    <CheckCircle className='w-4 h-4' />
                    Copied to Clipboard!
                  </>
                ) : (
                  'Copy Password'
                )}
              </button>
              <div className='bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3'>
                <p className='text-xs text-amber-700 dark:text-amber-400/80'>
                  <strong>Security Notice:</strong> This password will not be
                  shown again. Make sure to copy and share it securely before
                  closing this dialog.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
