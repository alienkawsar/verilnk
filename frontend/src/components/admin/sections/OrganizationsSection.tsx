import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Shield, Building2, CheckCircle, XCircle, Search, Trash2, Edit, X, Loader2, Ban, Upload, Lock, Mail, Key } from 'lucide-react';
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
    resetOrgPassword
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';
import { useDebounce } from '@/hooks/useDebounce';
import { toProxyImageUrl } from '@/lib/imageProxy';

interface Organization {
    id: string;
    name: string;
    email: string;
    website: string;
    phone?: string;
    address?: string;
    priority?: 'HIGH' | 'MEDIUM' | 'NORMAL' | 'LOW';
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    country: { id: string, name: string; code: string };
    state?: { id: string, name: string };
    category?: { id: string, name: string };
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

export default function OrganizationsSection({ currentUser }: { currentUser?: any }) {
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
        deleted: 'exclude' as 'only' | 'include' | 'exclude'
    });

    // Edit State
    const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);
    const [createForm, setCreateForm] = useState({
        name: '',
        email: '',
        website: '',
        phone: '',
        address: '',
        countryId: '',
        stateId: '',
        categoryId: '',
        type: 'PUBLIC',
        about: '',
        logo: '',
        planType: 'FREE',
        planStatus: 'ACTIVE',
        durationPreset: '30',
        customDays: '',
        priorityOverride: 'HIGH'
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
        about: '',
        logo: '',
        loginEmail: ''
    });
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [logoError, setLogoError] = useState(false);
    const requestIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    // Priority Modal State
    const [priorityModalOpen, setPriorityModalOpen] = useState(false);
    const [priorityTargetIds, setPriorityTargetIds] = useState<string[]>([]);
    const [targetPriority, setTargetPriority] = useState('NORMAL');
    const [targetDuration, setTargetDuration] = useState<number>(0); // 0 = Permanent

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [orgToDelete, setOrgToDelete] = useState<{ id: string; name: string } | null>(null);
    const [deleteReason, setDeleteReason] = useState('');

    // Password Reset Modal State
    const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
    const [resetTempPassword, setResetTempPassword] = useState<string | null>(null);
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
        enterpriseMaxMembers: '100'
    });
    const [bulkPlanForm, setBulkPlanForm] = useState({
        planType: 'FREE',
        planStatus: 'ACTIVE',
        durationPreset: '30',
        customDays: '',
        priorityOverride: 'HIGH'
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
            fetchStates(filters.countryId).then(setFilterStates).catch(() => setFilterStates([]));
        } else {
            setFilterStates([]);
        }
    }, [filters.countryId]);

    useEffect(() => {
        if (editForm.countryId) {
            fetchStates(editForm.countryId).then(setStates).catch(() => setStates([]));
        } else {
            setStates([]);
        }
    }, [editForm.countryId]);

    const handleStatusChange = async (id: string, status: 'APPROVED' | 'REJECTED') => {
        if (!confirm(`Are you sure you want to ${status} this organization?`)) return;
        try {
            await updateOrganization(id, { status });
            showToast(`Organization ${status.toLowerCase()} successfully`, 'success');
            loadOrgs();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update status', 'error');
        }
    };

    const handleToggleRestriction = async (org: Organization) => {
        const newStatus = !org.isRestricted;
        if (!confirm(`Are you sure you want to ${newStatus ? 'RESTRICT' : 'UNRESTRICT'} organization ${org.name}?`)) return;
        try {
            await restrictOrganization(org.id, newStatus);
            showToast(`Organization ${newStatus ? 'restricted' : 'unrestricted'} successfully`, 'success');
            loadOrgs();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update restriction', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this organization? It will be moved to Deleted Orgs and hidden from public views.')) return;
        try {
            await deleteOrganization(id);
            showToast('Organization deleted successfully', 'success');
            loadOrgs();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to delete organization', 'error');
        }
    };

    const handleRestore = async (id: string) => {
        if (!confirm('Restore this organization? It will become visible again if eligible.')) return;
        try {
            await restoreOrganization(id);
            showToast('Organization restored successfully', 'success');
            loadOrgs();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to restore organization', 'error');
        }
    };

    const handlePermanentDelete = async (id: string) => {
        if (!confirm('Permanently delete this organization? This cannot be undone.')) return;
        try {
            await permanentlyDeleteOrganization(id);
            showToast('Organization permanently deleted', 'success');
            loadOrgs();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to permanently delete organization', 'error');
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected organizations? This action cannot be undone.`)) return;
        try {
            await deleteOrganizationsBulk(selectedIds);
            showToast(`${selectedIds.length} organizations deleted successfully`, 'success');
            setSelectedIds([]);
            loadOrgs();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to delete organizations', 'error');
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(filteredOrgs.map(org => org.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
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
        const diffDays = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        if ([7, 15, 30].includes(diffDays)) {
            return { preset: String(diffDays), customDays: '' };
        }
        return { preset: 'custom', customDays: diffDays ? String(diffDays) : '' };
    };

    const startEdit = (org: Organization) => {
        setEditingOrg(org);

        // Initialize Logo State
        const hasLogo = !!org.logo;
        const isUrl = hasLogo && (org.logo!.startsWith('http') || org.logo!.startsWith('//'));

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
            about: org.about || '',
            logo: (org.logo && !org.logo.includes('via.placeholder.com')) ? org.logo : '',
            loginEmail: ''
        });
        setLogoError(false);

        // Reset Plan Form
        setPlanForm({
            planType: org.planType || 'FREE',
            planStatus: org.planStatus || 'ACTIVE',
            durationPreset: '30',
            customDays: '',
            priorityOverride: org.priorityOverride ? org.priorityOverride.toString() : 'NORMAL',
            enterpriseMaxWorkspaces: org.enterpriseMaxWorkspaces ? String(org.enterpriseMaxWorkspaces) : '10',
            enterpriseMaxLinkedOrgs: org.enterpriseMaxLinkedOrgs ? String(org.enterpriseMaxLinkedOrgs) : '50',
            enterpriseMaxApiKeys: org.enterpriseMaxApiKeys ? String(org.enterpriseMaxApiKeys) : '10',
            enterpriseMaxMembers: org.enterpriseMaxMembers ? String(org.enterpriseMaxMembers) : '100'
        });
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            showToast('File too large (max 5MB)', 'error');
            return;
        }

        setUploadingLogo(true);
        try {
            const { url } = await uploadOrgLogo(file);
            // On success (Mirrored from CountryForm)
            setUseLogoUrl(false);
            setLogoUrlInput('');
            setLogoPathInput(url);
            setEditForm(prev => ({ ...prev, logo: url }));
            showToast('Logo uploaded successfully', 'success');
        } catch (error) {
            showToast('Failed to upload logo', 'error');
        } finally {
            setUploadingLogo(false);
            e.target.value = ''; // Reset input
        }
    };

    const submitEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingOrg) return;
        setSaving(true);
        try {
            // Determine final logo (Mirroring CountryForm Logic)
            const finalLogo = useLogoUrl
                ? (logoUrlInput ? toPreviewUrl(logoUrlInput) : '')
                : logoPathInput;

            // Exclude loginEmail from organization update
            const { loginEmail, ...orgData } = editForm;

            await updateOrganization(editingOrg.id, {
                ...orgData,
                logo: finalLogo
            });

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
                    priorityOverride: planForm.planType === 'ENTERPRISE' ? mapPriorityOverrideToValue(planForm.priorityOverride) : null,
                    ...enterpriseQuotas
                };
                await updateOrganizationPlan(editingOrg.id, planPayload);
            } catch (planErr: any) {
                showToast(planErr.response?.data?.message || 'Organization saved but plan update failed', 'error');
            }

            showToast('Organization updated successfully', 'success');
            setEditingOrg(null);
            loadOrgs(); // Refresh list
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update organization', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateLoginEmail = async () => {
        if (!editingOrg || !editForm.loginEmail) return;
        if (!confirm(`Are you sure you want to change the LOGIN email to ${editForm.loginEmail}? This will affect how they log in.`)) return;

        try {
            await updateOrgLoginEmail(editingOrg.id, editForm.loginEmail);
            showToast('Login email updated successfully', 'success');
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update login email', 'error');
        }
    };

    const handleResetPassword = async () => {
        if (!editingOrg) return;
        if (!confirm('Are you sure you want to reset the password for this organization? They will be logged out immediately.')) return;

        try {
            const res = await resetOrgPassword(editingOrg.id);
            setResetTempPassword(res.tempPassword);
            setResetPasswordCopied(false);
            setResetPasswordModalOpen(true);
            showToast('Password reset successfully', 'success');
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to reset password', 'error');
        }
    };

    const openPriorityModal = (ids: string[], currentPriority: string = 'NORMAL') => {
        setPriorityTargetIds(ids);
        setTargetPriority(currentPriority);
        setTargetDuration(0); // Reset to Permanent
        setPriorityModalOpen(true);
    };

    const handleSavePriority = async () => {
        if (priorityTargetIds.length === 0) return;
        setSaving(true);
        try {
            if (priorityTargetIds.length === 1) {
                await updateOrganizationPriority(priorityTargetIds[0], targetPriority, targetDuration);
            } else {
                await bulkUpdateOrganizationPriority(priorityTargetIds, targetPriority, targetDuration);
            }

            showToast('Priority updated successfully', 'success');
            setPriorityModalOpen(false);
            setPriorityTargetIds([]);
            setSelectedIds([]); // Clear selection if bulk
            loadOrgs();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update priority', 'error');
        } finally {
            setSaving(false);
        }
    };

    const resolveDurationDays = (form: { durationPreset: string; customDays: string }) => {
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

    const parseEnterpriseQuotaField = (label: string, value: string): number => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1_000_000) {
            throw new Error(`${label} must be between 1 and 1,000,000`);
        }
        return parsed;
    };

    const resolveEnterpriseQuotaPayload = () => ({
        enterpriseMaxWorkspaces: parseEnterpriseQuotaField('Workspaces limit', planForm.enterpriseMaxWorkspaces),
        enterpriseMaxLinkedOrgs: parseEnterpriseQuotaField('Linked organizations limit', planForm.enterpriseMaxLinkedOrgs),
        enterpriseMaxApiKeys: parseEnterpriseQuotaField('API keys limit', planForm.enterpriseMaxApiKeys),
        enterpriseMaxMembers: parseEnterpriseQuotaField('Members limit', planForm.enterpriseMaxMembers)
    });

    const openPlanModal = (ids: string[]) => {
        setPlanTargetIds(ids);
        setBulkPlanForm({
            planType: 'FREE',
            planStatus: 'ACTIVE',
            durationPreset: '30',
            customDays: '',
            priorityOverride: 'HIGH'
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
                priorityOverride: bulkPlanForm.planType === 'ENTERPRISE' ? mapPriorityOverrideToValue(bulkPlanForm.priorityOverride) : null
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
            showToast(err.response?.data?.message || 'Failed to update plan', 'error');
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
                priorityOverride: planForm.planType === 'ENTERPRISE' ? mapPriorityOverrideToValue(planForm.priorityOverride) : null,
                ...enterpriseQuotas
            };
            await updateOrganizationPlan(editingOrg.id, payload);
            showToast('Plan updated successfully', 'success');
            loadOrgs();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update plan', 'error');
        } finally {
            setSaving(false);
        }
    };

    const filteredOrgs = organizations.filter(org =>
        org.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        org.email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        org.website.toLowerCase().includes(debouncedSearch.toLowerCase())
    );

    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const durationDays = resolveDurationDays({
                durationPreset: createForm.durationPreset,
                customDays: createForm.customDays
            });
            const payload = {
                name: createForm.name,
                email: createForm.email,
                website: createForm.website,
                phone: createForm.phone,
                address: createForm.address,
                countryId: createForm.countryId,
                stateId: createForm.stateId || undefined,
                categoryId: createForm.categoryId,
                type: createForm.type,
                about: createForm.about || undefined,
                logo: createForm.logo || undefined,
                planType: createForm.planType,
                planStatus: createForm.planStatus,
                durationDays: durationDays > 0 ? durationDays : 0,
                priorityOverride: createForm.planType === 'ENTERPRISE' ? mapPriorityOverrideToValue(createForm.priorityOverride) : null
            };
            const res = await createOrganizationAdmin(payload);
            setCreatedTempPassword(res.tempPassword || null);
            showToast('Organization created successfully', 'success');
            setCreateOpen(false);
            setCreateForm({
                name: '',
                email: '',
                website: '',
                phone: '',
                address: '',
                countryId: '',
                stateId: '',
                categoryId: '',
                type: 'PUBLIC',
                about: '',
                logo: '',
                planType: 'FREE',
                planStatus: 'ACTIVE',
                durationPreset: '30',
                customDays: '',
                priorityOverride: 'HIGH'
            });
            loadOrgs();
            if (res.tempPassword) {
                alert(`Temporary Password:\n\n${res.tempPassword}\n\nPlease share it securely. The user must change it on first login.`);
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to create organization', 'error');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                    Manage Organizations
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setCreateOpen(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Building2 className="w-4 h-4" />
                        Create Organization
                    </button>
                    {selectedIds.length > 0 && (
                        <>
                            <button
                                onClick={() => openPriorityModal(selectedIds)}
                                className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2 transition-colors animate-fade-in"
                            >
                                <Shield className="w-4 h-4" />
                                Set Priority ({selectedIds.length})
                            </button>
                            <button
                                onClick={() => openPlanModal(selectedIds)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors animate-fade-in"
                            >
                                <Shield className="w-4 h-4" />
                                Set Plan ({selectedIds.length})
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors animate-fade-in"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete ({selectedIds.length})
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search organizations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full md:w-64 surface-card rounded-lg pl-9 pr-4 py-2.5 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                    />
                </div>

                <select
                    value={filters.countryId}
                    onChange={(e) => setFilters(prev => ({ ...prev, countryId: e.target.value, stateId: '' }))}
                    className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]"
                >
                    <option value="">All Countries</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <select
                    value={filters.deleted}
                    onChange={(e) => setFilters(prev => ({ ...prev, deleted: e.target.value as any }))}
                    className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[140px]"
                >
                    <option value="exclude">Active Orgs</option>
                    <option value="only">Deleted Orgs</option>
                    <option value="include">All Orgs</option>
                </select>

                <select
                    value={filters.stateId}
                    onChange={(e) => setFilters(prev => ({ ...prev, stateId: e.target.value }))}
                    disabled={!filters.countryId}
                    className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]"
                >
                    <option value="">All States</option>
                    {filterStates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                <select
                    value={filters.categoryId}
                    onChange={(e) => setFilters(prev => ({ ...prev, categoryId: e.target.value }))}
                    className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]"
                >
                    <option value="">All Categories</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <select
                    value={filters.type}
                    onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                    className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]"
                >
                    <option value="">All Types</option>
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private</option>
                    <option value="NON_PROFIT">Non-profit</option>
                </select>

                <select
                    value={filters.priority}
                    onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                    className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]"
                >
                    <option value="">All Priorities</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LOW">Low</option>
                </select>

                <select
                    value={filters.planType}
                    onChange={(e) => setFilters(prev => ({ ...prev, planType: e.target.value }))}
                    className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]"
                >
                    <option value="">All Plans</option>
                    <option value="FREE">Free</option>
                    <option value="BASIC">Basic</option>
                    <option value="PRO">Pro</option>
                    <option value="BUSINESS">Business</option>
                    <option value="ENTERPRISE">Enterprise</option>
                </select>

                <select
                    value={filters.status}
                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]"
                >
                    <option value="">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                </select>

                {(filters.countryId || filters.stateId || filters.categoryId || filters.status || filters.type || filters.priority || filters.planType) && (
                    <button
                        onClick={() => setFilters({ countryId: '', stateId: '', categoryId: '', status: '', type: '', priority: '', planType: '', deleted: 'exclude' })}
                        className="bg-app-secondary hover:bg-slate-200 dark:hover:bg-slate-700 text-[var(--app-text-secondary)] px-4 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                        <X className="w-4 h-4" />
                        Reset
                    </button>
                )}
            </div>

            {loading ? (
                <TableSkeleton cols={8} rows={5} />
            ) : (
                <div className="surface-card rounded-xl border-[var(--app-border)] overflow-x-auto shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-app-secondary/50 text-[var(--app-text-secondary)] text-sm uppercase font-medium">
                            <tr>
                                <th className="px-4 py-4 w-10">
                                    <input
                                        type="checkbox"
                                        checked={filteredOrgs.length > 0 && selectedIds.length === filteredOrgs.length}
                                        onChange={handleSelectAll}
                                        className="rounded border-[var(--app-border)] text-blue-600 focus:ring-blue-500 bg-transparent transition-colors"
                                    />
                                </th>
                                <th className="px-4 py-4 min-w-[280px]">Organization</th>
                                <th className="px-4 py-4 w-[100px]">Priority</th>
                                <th className="px-4 py-4 w-[100px]">Type</th>
                                <th className="px-4 py-4 min-w-[200px]">Contact</th>
                                <th className="px-4 py-4 w-[120px]">Country</th>
                                <th className="px-4 py-4 w-[120px]">Status</th>
                                <th className="px-4 py-4 w-[140px] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filteredOrgs.map((org) => (
                                <tr key={org.id} className={`group hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${selectedIds.includes(org.id) ? 'bg-blue-50/50 dark:bg-slate-700/20' : ''}`}>
                                    <td className="px-4 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(org.id)}
                                            onChange={() => handleSelectRow(org.id)}
                                            className="rounded border-[var(--app-border)] text-blue-600 focus:ring-blue-500 bg-transparent transition-colors"
                                        />
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="relative flex-shrink-0 w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 flex items-center justify-center overflow-hidden transition-all group-hover:border-slate-300 dark:group-hover:border-slate-600 group-hover:shadow-sm">
                                                {org.logo && !org.logo.includes('via.placeholder.com') ? (
                                                    <Image
                                                        key={org.logo}
                                                        src={toProxyImageUrl(org.logo)}
                                                        alt={org.name}
                                                        fill
                                                        className="object-cover"
                                                        sizes="44px"
                                                    />
                                                ) : (
                                                    <Building2 className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                                                )}
                                            </div>
                                            <div className="flex flex-col min-w-0 justify-center gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-slate-900 dark:text-white text-sm truncate max-w-[180px]" title={org.name}>
                                                        {org.name}
                                                    </span>
                                                    {org.isRestricted && (
                                                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-red-400/10 text-red-400 border border-red-400/20 tracking-wider">
                                                            Restricted
                                                        </span>
                                                    )}
                                                </div>
                                                <a
                                                    href={org.website}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate max-w-[180px] font-mono"
                                                    title={org.website}
                                                >
                                                    {org.website ? org.website.replace(/^https?:\/\/(www\.)?/, '') : ''}
                                                </a>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <button
                                            onClick={() => openPriorityModal([org.id], org.priority || 'NORMAL')}
                                            className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all hover:bg-opacity-20 ${org.priority === 'HIGH' ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30' :
                                                org.priority === 'MEDIUM' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30' :
                                                    org.priority === 'LOW' ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30' :
                                                        'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                                                }`}
                                        >
                                            {org.priority || 'NORMAL'}
                                        </button>
                                        {org.priorityExpiresAt && new Date(org.priorityExpiresAt) > new Date() && (
                                            <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                                {Math.ceil((new Date(org.priorityExpiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}d left
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700/50">
                                            {org.type ? org.type.charAt(0) + org.type.slice(1).toLowerCase() : 'Public'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                                        <div className="text-sm truncate max-w-[200px]" title={org.email}>{org.email}</div>
                                    </td>
                                    <td className="px-4 py-4 text-slate-500 dark:text-slate-400 text-sm whitespace-nowrap">{org.country?.name || '-'}</td>
                                    <td className="px-4 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${org.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400' :
                                            org.status === 'REJECTED' ? 'bg-red-500/10 text-red-400' :
                                                'bg-yellow-500/10 text-yellow-400'
                                            }`}>
                                            {org.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-100 transition-opacity">
                                            {org.deletedAt ? (
                                                <>
                                                    <button
                                                        onClick={() => handleRestore(org.id)}
                                                        className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                                                        title="Restore"
                                                    >
                                                        <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handlePermanentDelete(org.id)}
                                                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                                                        title="Permanently Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => handleToggleRestriction(org)}
                                                        className={`p-1.5 rounded-lg transition-colors ${org.isRestricted ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-orange-400 hover:bg-orange-400/10'}`}
                                                        title={org.isRestricted ? "Unrestrict Organization" : "Restrict Organization"}
                                                    >
                                                        {org.isRestricted ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                                                    </button>
                                                    <button
                                                        onClick={() => startEdit(org)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>

                                                    {org.status === 'PENDING' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleStatusChange(org.id, 'APPROVED')}
                                                                className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                                                                title="Approve"
                                                            >
                                                                <CheckCircle className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusChange(org.id, 'REJECTED')}
                                                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                                                                title="Reject"
                                                            >
                                                                <XCircle className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(org.id)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="surface-card rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Organization</h2>
                            <button onClick={() => setEditingOrg(null)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={submitEdit} className="p-6 space-y-4">
                            <div className="space-y-4">
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Organization Logo</label>

                                {/* Toggle between Upload and URL - Mirrored from CountryForm */}
                                <div className="flex gap-4 mb-4 text-sm">
                                    <button
                                        type="button"
                                        onClick={() => { setUseLogoUrl(false); setLogoUrlInput(''); setLogoError(false); }}
                                        className={`px-3 py-1 rounded-full transition-colors ${!useLogoUrl ? 'btn-primary' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                    >
                                        Upload File
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setUseLogoUrl(true); setLogoPathInput(''); setLogoError(false); }}
                                        className={`px-3 py-1 rounded-full transition-colors ${useLogoUrl ? 'btn-primary' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                    >
                                        External URL
                                    </button>
                                </div>

                                {!useLogoUrl ? (
                                    <div className="flex items-start gap-4">
                                        <div className="w-24 h-24 bg-transparent border border-[var(--app-border)] rounded-lg flex items-center justify-center overflow-hidden relative group shrink-0">
                                            {uploadingLogo ? (
                                                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                                            ) : (logoPathInput || (editForm.logo && !editForm.logo.startsWith('http'))) ? (
                                                <>
                                                    <Image
                                                        src={logoPathInput || editForm.logo}
                                                        alt="Logo Preview"
                                                        fill
                                                        className="object-cover"
                                                        onError={() => setLogoError(true)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => { setLogoPathInput(''); setEditForm({ ...editForm, logo: '' }); }}
                                                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-5 h-5 text-white" />
                                                    </button>
                                                </>
                                            ) : (
                                                <Building2 className="w-8 h-8 text-slate-400 dark:text-slate-600" />
                                            )}
                                        </div>

                                        <div className="flex-1 space-y-2">
                                            <input
                                                type="file"
                                                onChange={handleLogoUpload}
                                                accept="image/*"
                                                className="hidden"
                                                id="org-logo-upload"
                                            />
                                            <label
                                                htmlFor="org-logo-upload"
                                                className={`flex items-center justify-center gap-2 w-full px-4 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${uploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}
                                            >
                                                <Upload className="w-4 h-4" />
                                                <span>{logoPathInput || editForm.logo ? 'Change Logo' : 'Upload Logo'}</span>
                                            </label>
                                            <p className="text-xs text-slate-500">
                                                Max 5MB. Formats: PNG, JPG, GIF, SVG.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <input
                                            type="url"
                                            value={logoUrlInput}
                                            onChange={(e) => {
                                                setLogoUrlInput(e.target.value);
                                                // Live preview update
                                                if (toPreviewUrl(e.target.value)) {
                                                    setLogoError(false);
                                                }
                                            }}
                                            placeholder="https://example.com/logo.png"
                                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                                        />
                                        <div className="flex items-center gap-4">
                                            <div className="text-sm text-slate-500 dark:text-slate-400">Preview:</div>
                                            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center relative">
                                                {toPreviewUrl(logoUrlInput) && !logoError ? (
                                                    /* Using img tag here for raw external URL preview resilience before save, similar to CountryForm logic */
                                                    <img
                                                        src={toPreviewUrl(logoUrlInput)}
                                                        alt="Preview"
                                                        className="w-full h-full object-cover"
                                                        onError={() => setLogoError(true)}
                                                    />
                                                ) : (
                                                    <Building2 className="w-4 h-4 text-slate-600" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">Email</label>
                                    <input required type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">Phone</label>
                                    <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm text-slate-600 dark:text-slate-400">Website</label>
                                <input required value={editForm.website} onChange={e => setEditForm({ ...editForm, website: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">Country</label>
                                    <select value={editForm.countryId} onChange={e => setEditForm({ ...editForm, countryId: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                        <option value="">Select Country</option>
                                        {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">State</label>
                                    <select value={editForm.stateId} onChange={e => setEditForm({ ...editForm, stateId: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" disabled={!editForm.countryId}>
                                        <option value="">Select State</option>
                                        {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">Category</label>
                                    <select value={editForm.categoryId} onChange={e => setEditForm({ ...editForm, categoryId: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                        <option value="">Select Category</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">Type</label>
                                    <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                        <option value="PUBLIC">Public</option>
                                        <option value="PRIVATE">Private</option>
                                        <option value="NON_PROFIT">Non-profit</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm text-slate-600 dark:text-slate-400">About Organization</label>
                                <textarea value={editForm.about} onChange={e => setEditForm({ ...editForm, about: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] h-24" placeholder="Description..." />
                            </div>

                            <div className="space-y-3 pt-6 border-t border-slate-700/50">
                                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2 mb-4 px-1">
                                    <Shield className="w-3 h-3" />
                                    Plan & Subscription
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Plan Type</label>
                                        <select
                                            value={planForm.planType}
                                            onChange={e => setPlanForm({ ...planForm, planType: e.target.value })}
                                            className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                        >
                                            <option value="FREE">FREE</option>
                                            <option value="BASIC">BASIC</option>
                                            <option value="PRO">PRO</option>
                                            <option value="BUSINESS">BUSINESS</option>
                                            <option value="ENTERPRISE">ENTERPRISE</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Plan Status</label>
                                        <select
                                            value={planForm.planStatus}
                                            onChange={e => setPlanForm({ ...planForm, planStatus: e.target.value })}
                                            className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                        >
                                            <option value="ACTIVE">ACTIVE</option>
                                            <option value="EXPIRED">EXPIRED</option>
                                            <option value="CANCELLED">CANCELLED</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Duration</label>
                                        <select
                                            value={planForm.durationPreset}
                                            onChange={e => setPlanForm({ ...planForm, durationPreset: e.target.value })}
                                            className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                        >
                                            <option value="7">7 Days</option>
                                            <option value="15">15 Days</option>
                                            <option value="30">30 Days</option>
                                            <option value="custom">Custom</option>
                                        </select>
                                    </div>
                                    {planForm.durationPreset === 'custom' && (
                                        <div className="space-y-2">
                                            <label className="text-sm text-slate-600 dark:text-slate-400">Custom Days</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={planForm.customDays}
                                                onChange={e => setPlanForm({ ...planForm, customDays: e.target.value })}
                                                className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                                placeholder="e.g. 45"
                                            />
                                        </div>
                                    )}
                                </div>
                                {planForm.planType === 'ENTERPRISE' && (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm text-slate-600 dark:text-slate-400">Enterprise Priority Override</label>
                                            <select
                                                value={planForm.priorityOverride}
                                                onChange={e => setPlanForm({ ...planForm, priorityOverride: e.target.value })}
                                                className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                            >
                                                <option value="HIGH">HIGH</option>
                                                <option value="MEDIUM">MEDIUM</option>
                                                <option value="NORMAL">NORMAL</option>
                                                <option value="LOW">LOW</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm text-slate-600 dark:text-slate-400">Enterprise Limits</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="1000000"
                                                    value={planForm.enterpriseMaxWorkspaces}
                                                    onChange={(e) => setPlanForm({ ...planForm, enterpriseMaxWorkspaces: e.target.value })}
                                                    className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                                    placeholder="Workspaces"
                                                />
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="1000000"
                                                    value={planForm.enterpriseMaxLinkedOrgs}
                                                    onChange={(e) => setPlanForm({ ...planForm, enterpriseMaxLinkedOrgs: e.target.value })}
                                                    className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                                    placeholder="Linked Orgs"
                                                />
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="1000000"
                                                    value={planForm.enterpriseMaxApiKeys}
                                                    onChange={(e) => setPlanForm({ ...planForm, enterpriseMaxApiKeys: e.target.value })}
                                                    className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                                    placeholder="API Keys"
                                                />
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="1000000"
                                                    value={planForm.enterpriseMaxMembers}
                                                    onChange={(e) => setPlanForm({ ...planForm, enterpriseMaxMembers: e.target.value })}
                                                    className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                                    placeholder="Members"
                                                />
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Limits apply to workspace count, linked organizations, API keys, and members/invites.
                                            </p>
                                        </div>
                                    </div>
                                )}

                            </div>

                            <div className="space-y-3 pt-6 border-t border-slate-200 dark:border-slate-700/50">
                                <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2 mb-4 px-1">
                                    <Shield className="w-3 h-3" />
                                    Super Admin Controls
                                </h3>

                                <div className="bg-transparent rounded-xl border border-[var(--app-border)] overflow-hidden">
                                    {/* Email Section */}
                                    <div className="p-5 border-b border-slate-200 dark:border-slate-700/50 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Authentication Email</label>
                                            <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700">Primary Login</span>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="relative flex-1 group">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                                                <input
                                                    type="email"
                                                    value={editForm.loginEmail || editForm.email}
                                                    onChange={e => setEditForm({ ...editForm, loginEmail: e.target.value })}
                                                    className="w-full bg-white dark:bg-slate-950/50 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white text-sm focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all placeholder-slate-400 dark:placeholder-slate-600"
                                                    placeholder="Enter login email"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateLoginEmail()}
                                                className="px-4 py-2 btn-primary rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95 whitespace-nowrap"
                                            >
                                                Update Email
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500">Changing this will immediately update the organization's login credentials.</p>
                                    </div>

                                    {/* Password Section */}
                                    <div className="p-5 bg-red-50 dark:bg-red-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-medium text-red-600 dark:text-red-200 flex items-center gap-2">
                                                <Key className="w-4 h-4 text-red-600 dark:text-red-400" />
                                                Emergency Password Reset
                                            </h4>
                                            <p className="text-xs text-red-600/70 dark:text-red-400/60 max-w-sm leading-relaxed">
                                                This will force a logout of all active sessions and require the organization to set a new password on next login.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleResetPassword()}
                                            className="px-4 py-2.5 bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-red-900/20 whitespace-nowrap"
                                        >
                                            <Lock className="w-3.5 h-3.5" />
                                            Reset Credentials
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                                <button type="button" onClick={() => setEditingOrg(null)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">Cancel</button>
                                <button type="submit" disabled={saving} className="px-6 py-2 btn-primary rounded-lg flex items-center gap-2">
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div >
            )
            }

            {/* Priority Modal */}
            {
                priorityModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                        <div className="surface-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Set Priority</h2>
                                <button onClick={() => setPriorityModalOpen(false)} className="text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 space-y-6">
                                <p className="text-[var(--app-text-secondary)] text-sm">
                                    Set priority for <span className="text-[var(--app-text-primary)] font-bold">{priorityTargetIds.length}</span> selected organizations.
                                    Higher priority organizations appear first in search results.
                                </p>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-[var(--app-text-secondary)]">Priority Level</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {['HIGH', 'MEDIUM', 'NORMAL', 'LOW'].map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => setTargetPriority(p)}
                                                className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${targetPriority === p
                                                    ? 'bg-[var(--app-primary)]/10 border-[var(--app-primary)] text-[var(--app-primary)]'
                                                    : 'bg-transparent border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text-primary)]'
                                                    }`}
                                            >
                                                <span className="font-semibold">{p}</span>
                                                {targetPriority === p && <CheckCircle className="w-5 h-5 text-[var(--app-primary)]" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Duration</label>
                                    <select
                                        value={targetDuration}
                                        onChange={(e) => setTargetDuration(parseInt(e.target.value))}
                                        className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-3 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                                    >
                                        <option value={0}>Permanent (No Expiration)</option>
                                        <option value={1}>1 Day</option>
                                        <option value={2}>2 Days</option>
                                        <option value={3}>3 Days</option>
                                        <option value={7}>1 Week</option>
                                        <option value={15}>15 Days</option>
                                        <option value={30}>30 Days</option>
                                    </select>
                                    <p className="text-xs text-slate-500">
                                        Priority will revert to NORMAL after this duration.
                                    </p>
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={() => setPriorityModalOpen(false)}
                                        className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSavePriority}
                                        disabled={saving}
                                        className="px-6 py-2 btn-primary rounded-lg flex items-center gap-2"
                                    >
                                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Save Priority
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                planModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                        <div className="surface-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Set Plan</h2>
                                <button onClick={() => setPlanModalOpen(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 space-y-6">
                                <p className="text-slate-600 dark:text-slate-400 text-sm">
                                    Update plan for <span className="text-slate-900 dark:text-white font-bold">{planTargetIds.length}</span> selected organizations.
                                </p>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Plan Type</label>
                                    <select
                                        value={bulkPlanForm.planType}
                                        onChange={(e) => setBulkPlanForm(prev => ({ ...prev, planType: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="FREE">FREE</option>
                                        <option value="BASIC">BASIC</option>
                                        <option value="PRO">PRO</option>
                                        <option value="BUSINESS">BUSINESS</option>
                                        <option value="ENTERPRISE">ENTERPRISE</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Plan Status</label>
                                    <select
                                        value={bulkPlanForm.planStatus}
                                        onChange={(e) => setBulkPlanForm(prev => ({ ...prev, planStatus: e.target.value }))}
                                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="ACTIVE">ACTIVE</option>
                                        <option value="EXPIRED">EXPIRED</option>
                                        <option value="CANCELLED">CANCELLED</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Duration</label>
                                    <select
                                        value={bulkPlanForm.durationPreset}
                                        onChange={(e) => setBulkPlanForm(prev => ({ ...prev, durationPreset: e.target.value }))}
                                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value="7">7 Days</option>
                                        <option value="15">15 Days</option>
                                        <option value="30">30 Days</option>
                                        <option value="custom">Custom</option>
                                    </select>
                                </div>

                                {bulkPlanForm.durationPreset === 'custom' && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300">Custom Days</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={bulkPlanForm.customDays}
                                            onChange={(e) => setBulkPlanForm(prev => ({ ...prev, customDays: e.target.value }))}
                                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                                            placeholder="e.g. 45"
                                        />
                                    </div>
                                )}

                                {bulkPlanForm.planType === 'ENTERPRISE' && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300">Enterprise Priority Override</label>
                                        <select
                                            value={bulkPlanForm.priorityOverride}
                                            onChange={(e) => setBulkPlanForm(prev => ({ ...prev, priorityOverride: e.target.value }))}
                                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                                        >
                                            <option value="HIGH">HIGH</option>
                                            <option value="MEDIUM">MEDIUM</option>
                                            <option value="NORMAL">NORMAL</option>
                                            <option value="LOW">LOW</option>
                                        </select>
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={() => setPlanModalOpen(false)}
                                        className="px-4 py-2 text-slate-400 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSavePlanBulk}
                                        disabled={saving}
                                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2"
                                    >
                                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Save Plan
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                createOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="surface-card rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create Organization</h2>
                                <button onClick={() => setCreateOpen(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={handleCreateOrg} className="p-6 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">Organization Name</label>
                                    <input required value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Email</label>
                                        <input required type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Phone</label>
                                        <input required value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">Website</label>
                                    <input required value={createForm.website} onChange={e => setCreateForm({ ...createForm, website: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">Address</label>
                                    <input required value={createForm.address} onChange={e => setCreateForm({ ...createForm, address: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" />
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Country</label>
                                        <select required value={createForm.countryId} onChange={e => setCreateForm({ ...createForm, countryId: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                            <option value="">Select</option>
                                            {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">State</label>
                                        <select value={createForm.stateId} onChange={e => setCreateForm({ ...createForm, stateId: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" disabled={!createForm.countryId}>
                                            <option value="">Optional</option>
                                            {states.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Category</label>
                                        <select required value={createForm.categoryId} onChange={e => setCreateForm({ ...createForm, categoryId: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                            <option value="">Select</option>
                                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Type</label>
                                        <select value={createForm.type} onChange={e => setCreateForm({ ...createForm, type: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                            <option value="PUBLIC">Public</option>
                                            <option value="PRIVATE">Private</option>
                                            <option value="NON_PROFIT">Non Profit</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Logo URL (optional)</label>
                                        <input value={createForm.logo} onChange={e => setCreateForm({ ...createForm, logo: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Plan Type</label>
                                        <select value={createForm.planType} onChange={e => setCreateForm({ ...createForm, planType: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                            <option value="FREE">FREE</option>
                                            <option value="BASIC">BASIC</option>
                                            <option value="PRO">PRO</option>
                                            <option value="BUSINESS">BUSINESS</option>
                                            <option value="ENTERPRISE">ENTERPRISE</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Plan Status</label>
                                        <select value={createForm.planStatus} onChange={e => setCreateForm({ ...createForm, planStatus: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                            <option value="ACTIVE">ACTIVE</option>
                                            <option value="EXPIRED">EXPIRED</option>
                                            <option value="CANCELLED">CANCELLED</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Plan Duration</label>
                                        <select value={createForm.durationPreset} onChange={e => setCreateForm({ ...createForm, durationPreset: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                            <option value="7">7 Days</option>
                                            <option value="15">15 Days</option>
                                            <option value="30">30 Days</option>
                                            <option value="custom">Custom</option>
                                        </select>
                                    </div>
                                    {createForm.durationPreset === 'custom' ? (
                                        <div className="space-y-2">
                                            <label className="text-sm text-slate-600 dark:text-slate-400">Custom Days</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={createForm.customDays}
                                                onChange={e => setCreateForm({ ...createForm, customDays: e.target.value })}
                                                className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]"
                                            />
                                        </div>
                                    ) : (
                                        <div />
                                    )}
                                </div>
                                {createForm.planType === 'ENTERPRISE' && (
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-600 dark:text-slate-400">Enterprise Priority Override</label>
                                        <select value={createForm.priorityOverride} onChange={e => setCreateForm({ ...createForm, priorityOverride: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)]">
                                            <option value="HIGH">HIGH</option>
                                            <option value="MEDIUM">MEDIUM</option>
                                            <option value="NORMAL">NORMAL</option>
                                            <option value="LOW">LOW</option>
                                        </select>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-600 dark:text-slate-400">About (optional)</label>
                                    <textarea value={createForm.about} onChange={e => setCreateForm({ ...createForm, about: e.target.value })} className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] h-20" />
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">Cancel</button>
                                    <button type="submit" disabled={creating} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">
                                        {creating ? 'Creating...' : 'Create Organization'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Password Reset Modal */}
            {
                resetPasswordModalOpen && resetTempPassword && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="surface-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Key className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                                    Password Reset Successful
                                </h2>
                                <button
                                    onClick={() => {
                                        setResetPasswordModalOpen(false);
                                        setResetTempPassword(null);
                                    }}
                                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    A temporary password has been generated. Copy it now and share it with the organization securely.
                                </p>
                                <div className="relative">
                                    <div className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-4 font-mono text-lg text-amber-600 dark:text-amber-300 text-center tracking-wider select-all break-all">
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
                                    className={`w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${resetPasswordCopied
                                        ? 'bg-emerald-600 text-white'
                                        : 'btn-primary'
                                        }`}
                                >
                                    {resetPasswordCopied ? (
                                        <>
                                            <CheckCircle className="w-4 h-4" />
                                            Copied to Clipboard!
                                        </>
                                    ) : (
                                        'Copy Password'
                                    )}
                                </button>
                                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3">
                                    <p className="text-xs text-amber-700 dark:text-amber-400/80">
                                        <strong>Security Notice:</strong> This password will not be shown again. Make sure to copy and share it securely before closing this dialog.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
