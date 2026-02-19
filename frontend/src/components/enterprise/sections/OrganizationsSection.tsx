'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
    Ban,
    Building2,
    Link2,
    Loader2,
    Plus,
    Search,
    Trash2,
    Upload,
    X,
    XCircle
} from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Loading';
import {
    cancelWorkspaceLinkRequest,
    createWorkspaceOrganization,
    getLinkedOrganizations,
    getWorkspaceLinkRequests,
    isLimitReachedError,
    requestWorkspaceLink,
    unlinkOrganization,
    type EnterpriseLinkRequest,
    type LinkedOrganization
} from '@/lib/enterprise-api';
import { fetchCategories, fetchCountries, fetchStates, uploadPublicOrgLogo } from '@/lib/api';
import PasswordFields from '@/components/auth/PasswordFields';
import { validatePassword } from '@/lib/passwordPolicy';
import type { WorkspaceSectionProps } from '../section-types';
import { normalizeWorkspaceRole } from '../section-types';
import {
    LINK_REQUEST_METHOD_OPTIONS,
    ORG_ID_REGEX,
    type LinkRequestMethod,
    emptyStateIconClass,
    searchInputClass,
    sectionCardClass,
    sectionTitleClass,
    statusBadgeClass,
    tableHeadClass,
    tableRowClass,
    tableWrapperClass
} from './shared';

export default function OrganizationsSection({
    workspaceId,
    enterpriseAccess,
    userRole,
    showToast
}: WorkspaceSectionProps) {
    const [loading, setLoading] = useState(true);
    const [organizations, setOrganizations] = useState<LinkedOrganization[]>([]);
    const [linkRequests, setLinkRequests] = useState<EnterpriseLinkRequest[]>([]);
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [showRequestLinkModal, setShowRequestLinkModal] = useState(false);
    const [requestLinkMethod, setRequestLinkMethod] = useState<LinkRequestMethod>('EMAIL');
    const [requestIdentifier, setRequestIdentifier] = useState('');
    const [requestIdentifierError, setRequestIdentifierError] = useState<string | null>(null);
    const [requestMessage, setRequestMessage] = useState('');
    const [linkingOrg, setLinkingOrg] = useState(false);

    const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
    const [creatingOrganization, setCreatingOrganization] = useState(false);
    const [uploadingOrgLogo, setUploadingOrgLogo] = useState(false);
    const [orgConfirmPassword, setOrgConfirmPassword] = useState('');
    const [fetchingOrgStates, setFetchingOrgStates] = useState(false);
    const [orgCountries, setOrgCountries] = useState<Array<{ id: string; name: string }>>([]);
    const [orgStates, setOrgStates] = useState<Array<{ id: string; name: string }>>([]);
    const [orgCategories, setOrgCategories] = useState<Array<{ id: string; name: string }>>([]);
    const [orgCreateErrors, setOrgCreateErrors] = useState<Record<string, string>>({});
    const [orgLogoPreviewUrl, setOrgLogoPreviewUrl] = useState<string | null>(null);
    const [orgUploadedLogoUrl, setOrgUploadedLogoUrl] = useState<string | null>(null);
    const [orgCreateForm, setOrgCreateForm] = useState({
        orgName: '',
        email: '',
        password: '',
        website: '',
        phone: '',
        address: '',
        countryId: '',
        stateId: '',
        categoryId: '',
        type: 'PUBLIC' as 'PUBLIC' | 'PRIVATE' | 'NON_PROFIT',
        about: '',
        logo: ''
    });

    const normalizedRole = normalizeWorkspaceRole(userRole);
    const canManageOrganizations = normalizedRole === 'OWNER' || normalizedRole === 'ADMIN';
    const passwordsDoNotMatch = Boolean(orgConfirmPassword) && orgCreateForm.password !== orgConfirmPassword;
    const passwordValidation = useMemo(
        () => validatePassword(orgCreateForm.password),
        [orgCreateForm.password]
    );

    const quotaLimits = enterpriseAccess?.entitlements;
    const quotaUsage = enterpriseAccess?.usage;
    const linkedOrgLimitReached = Boolean(
        quotaLimits
        && quotaUsage
        && quotaLimits.maxLinkedOrgs > 0
        && quotaUsage.linkedOrgs >= quotaLimits.maxLinkedOrgs
    );

    const selectedLinkMethod = LINK_REQUEST_METHOD_OPTIONS.find(
        (option) => option.value === requestLinkMethod
    ) || LINK_REQUEST_METHOD_OPTIONS[0];

    const searchNormalized = search.trim().toLowerCase();
    const filteredOrganizations = useMemo(() => {
        if (!searchNormalized) return organizations;
        return organizations.filter((link) => {
            const name = link.organization?.name?.toLowerCase() || '';
            const slug = link.organization?.slug?.toLowerCase() || '';
            const planType = link.organization?.planType?.toLowerCase() || '';
            return name.includes(searchNormalized) || slug.includes(searchNormalized) || planType.includes(searchNormalized);
        });
    }, [organizations, searchNormalized]);

    const filteredLinkRequests = useMemo(() => {
        if (!searchNormalized) return linkRequests;
        return linkRequests.filter((request) => {
            const orgName = request.organization?.name?.toLowerCase() || '';
            const identifier = request.requestIdentifier?.toLowerCase() || '';
            const status = request.status?.toLowerCase() || '';
            return orgName.includes(searchNormalized) || identifier.includes(searchNormalized) || status.includes(searchNormalized);
        });
    }, [linkRequests, searchNormalized]);

    const restrictedOrganizationsCount = useMemo(
        () => organizations.filter((link) => Boolean(link.organization?.isRestricted)).length,
        [organizations]
    );

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const [{ organizations: orgs }, { requests }] = await Promise.all([
                    getLinkedOrganizations(workspaceId, { signal: controller.signal }),
                    getWorkspaceLinkRequests(workspaceId, { signal: controller.signal }),
                ]);
                if (!isMounted) return;
                setOrganizations(orgs || []);
                setLinkRequests(requests || []);
            } catch (err: any) {
                if (!isMounted || controller.signal.aborted) return;
                const message = err?.message || 'Failed to load organizations';
                setError(message);
                showToast(message, 'error');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        void load();
        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [workspaceId, showToast]);

    useEffect(() => {
        if (!showCreateOrgModal) return;
        fetchCountries()
            .then((rows) => setOrgCountries(Array.isArray(rows) ? rows : []))
            .catch(() => setOrgCountries([]));
        fetchCategories()
            .then((rows) => setOrgCategories(Array.isArray(rows) ? rows : []))
            .catch(() => setOrgCategories([]));
    }, [showCreateOrgModal]);

    useEffect(() => {
        if (!showCreateOrgModal || !orgCreateForm.countryId) {
            setOrgStates([]);
            return;
        }
        let mounted = true;
        setFetchingOrgStates(true);
        fetchStates(orgCreateForm.countryId)
            .then((rows) => {
                if (!mounted) return;
                setOrgStates(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!mounted) return;
                setOrgStates([]);
            })
            .finally(() => {
                if (mounted) setFetchingOrgStates(false);
            });
        return () => {
            mounted = false;
        };
    }, [orgCreateForm.countryId, showCreateOrgModal]);

    useEffect(() => {
        return () => {
            if (orgLogoPreviewUrl) URL.revokeObjectURL(orgLogoPreviewUrl);
        };
    }, [orgLogoPreviewUrl]);

    const refreshData = async () => {
        const [{ organizations: orgs }, { requests }] = await Promise.all([
            getLinkedOrganizations(workspaceId),
            getWorkspaceLinkRequests(workspaceId),
        ]);
        setOrganizations(orgs || []);
        setLinkRequests(requests || []);
    };

    const showQuotaLimitToast = () => {
        showToast(
            `Limit reached: Linked Organizations (${quotaUsage?.linkedOrgs ?? 0}/${quotaLimits?.maxLinkedOrgs ?? 0})`,
            'error'
        );
    };

    const validateLinkRequestIdentifier = (value: string, method: LinkRequestMethod): string | null => {
        if (!value.trim()) return 'Identifier is required';
        if (method === 'ORG_ID' && !ORG_ID_REGEX.test(value.trim())) return 'Enter a valid organization ID (UUID)';
        return null;
    };

    const handleCreateLinkRequest = async () => {
        if (!canManageOrganizations) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (linkedOrgLimitReached) {
            showQuotaLimitToast();
            return;
        }
        const identifierValue = requestIdentifier.trim();
        const validationError = validateLinkRequestIdentifier(identifierValue, requestLinkMethod);
        if (validationError) {
            setRequestIdentifierError(validationError);
            return;
        }
        setRequestIdentifierError(null);

        try {
            setLinkingOrg(true);
            const payload =
                requestLinkMethod === 'ORG_ID'
                    ? {
                        linkMethod: 'ORG_ID' as const,
                        organizationId: identifierValue,
                        message: requestMessage.trim() || undefined
                    }
                    : {
                        linkMethod: requestLinkMethod,
                        identifier: identifierValue,
                        message: requestMessage.trim() || undefined
                    };
            await requestWorkspaceLink(workspaceId, payload);
            showToast('Link request created', 'success');
            setShowRequestLinkModal(false);
            setRequestLinkMethod('EMAIL');
            setRequestIdentifier('');
            setRequestMessage('');
            await refreshData();
        } catch (err: any) {
            if (isLimitReachedError(err)) {
                showToast(err.message, 'error');
                return;
            }
            showToast(err?.message || 'Failed to create link request', 'error');
        } finally {
            setLinkingOrg(false);
        }
    };

    const handleCancelLinkRequest = async (requestId: string) => {
        if (!canManageOrganizations) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (!window.confirm('Cancel this link request?')) return;
        try {
            await cancelWorkspaceLinkRequest(requestId);
            showToast('Link request canceled', 'success');
            await refreshData();
        } catch (err: any) {
            showToast(err?.message || 'Failed to cancel link request', 'error');
        }
    };

    const handleUnlinkOrg = async (link: LinkedOrganization) => {
        if (!canManageOrganizations) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (link.organization?.isRestricted) {
            showToast('Organization is restricted', 'error');
            return;
        }
        if (!window.confirm('Unlink this organization from the workspace?')) return;
        try {
            await unlinkOrganization(workspaceId, link.organizationId);
            showToast('Organization unlinked', 'success');
            await refreshData();
        } catch (err: any) {
            showToast(err?.message || 'Failed to unlink organization', 'error');
        }
    };

    const handleOrgCreateFieldChange = (name: keyof typeof orgCreateForm, value: string) => {
        setOrgCreateForm((prev) => ({ ...prev, [name]: value }));
        setOrgCreateErrors((prev) => {
            if (!prev[name]) return prev;
            const next = { ...prev };
            delete next[name];
            return next;
        });
    };

    const handleOrgLogoUpload = async (file: File) => {
        const isValidType =
            /\.(jpg|jpeg|png|webp|svg)$/i.test(file.name) || file.type.startsWith('image/');
        if (!isValidType) {
            setOrgCreateErrors((prev) => ({ ...prev, logo: 'Invalid file type (png/jpg/jpeg/webp/svg)' }));
            return;
        }
        if (file.size > 1 * 1024 * 1024) {
            setOrgCreateErrors((prev) => ({ ...prev, logo: 'File too large (max 1MB)' }));
            return;
        }

        if (orgLogoPreviewUrl) URL.revokeObjectURL(orgLogoPreviewUrl);
        setOrgLogoPreviewUrl(URL.createObjectURL(file));
        setUploadingOrgLogo(true);
        setOrgCreateErrors((prev) => ({ ...prev, logo: '' }));

        try {
            const result = await uploadPublicOrgLogo(file);
            const finalUrl = result?.path || result?.url;
            setOrgUploadedLogoUrl(finalUrl || null);
            handleOrgCreateFieldChange('logo', finalUrl || '');
        } catch {
            setOrgCreateErrors((prev) => ({ ...prev, logo: 'Failed to upload logo' }));
        } finally {
            setUploadingOrgLogo(false);
        }
    };

    const handleRemoveOrgLogo = () => {
        if (orgLogoPreviewUrl) URL.revokeObjectURL(orgLogoPreviewUrl);
        setOrgLogoPreviewUrl(null);
        setOrgUploadedLogoUrl(null);
        handleOrgCreateFieldChange('logo', '');
        setOrgCreateErrors((prev) => ({ ...prev, logo: '' }));
    };

    const resetCreateOrgForm = () => {
        if (orgLogoPreviewUrl) URL.revokeObjectURL(orgLogoPreviewUrl);
        setOrgCreateForm({
            orgName: '',
            email: '',
            password: '',
            website: '',
            phone: '',
            address: '',
            countryId: '',
            stateId: '',
            categoryId: '',
            type: 'PUBLIC',
            about: '',
            logo: ''
        });
        setOrgCreateErrors({});
        setOrgLogoPreviewUrl(null);
        setOrgUploadedLogoUrl(null);
        setOrgConfirmPassword('');
        setOrgStates([]);
    };

    const handleCreateOrganization = async () => {
        if (!canManageOrganizations) {
            showToast("You don't have permission to do that.", 'error');
            return;
        }
        if (linkedOrgLimitReached) {
            showQuotaLimitToast();
            return;
        }

        const nextErrors: Record<string, string> = {};
        if (!orgCreateForm.orgName.trim()) nextErrors.orgName = 'Organization Name is required';
        if (!orgCreateForm.email.trim()) nextErrors.email = 'Email is required';
        if (!orgCreateForm.website.trim()) nextErrors.website = 'Website is required';
        if (!orgCreateForm.countryId) nextErrors.countryId = 'Country is required';
        if (!orgCreateForm.categoryId) nextErrors.categoryId = 'Category is required';
        if (!orgCreateForm.password) {
            nextErrors.password = 'Password is required';
        } else if (!passwordValidation.ok) {
            nextErrors.password = passwordValidation.message || 'Password is invalid';
        }
        if (!orgConfirmPassword) nextErrors.confirmPassword = 'Confirm password is required';
        if (orgCreateForm.password && orgConfirmPassword && orgCreateForm.password !== orgConfirmPassword) {
            nextErrors.confirmPassword = 'Passwords do not match';
        }
        if (!orgCreateForm.phone.trim()) nextErrors.phone = 'Phone is required';
        if (!orgCreateForm.address.trim()) nextErrors.address = 'Address is required';
        if (!orgCreateForm.type) nextErrors.type = 'Organization Type is required';

        if (Object.keys(nextErrors).length > 0) {
            setOrgCreateErrors(nextErrors);
            return;
        }

        try {
            setCreatingOrganization(true);
            setOrgCreateErrors({});
            await createWorkspaceOrganization(workspaceId, {
                orgName: orgCreateForm.orgName.trim(),
                email: orgCreateForm.email.trim(),
                password: orgCreateForm.password,
                website: orgCreateForm.website.trim(),
                phone: orgCreateForm.phone.trim(),
                address: orgCreateForm.address.trim(),
                countryId: orgCreateForm.countryId,
                stateId: orgCreateForm.stateId || null,
                categoryId: orgCreateForm.categoryId,
                type: orgCreateForm.type,
                about: orgCreateForm.about.trim() || undefined,
                logo: orgCreateForm.logo || undefined
            });
            showToast('Organization created and submitted for approval', 'success');
            setShowCreateOrgModal(false);
            resetCreateOrgForm();
            await refreshData();
        } catch (err: any) {
            if (isLimitReachedError(err)) {
                showToast(err.message, 'error');
                return;
            }
            showToast(err?.message || 'Failed to create organization', 'error');
        } finally {
            setCreatingOrganization(false);
        }
    };

    return (
        <>
            <div className="space-y-6">
                <div className={sectionCardClass}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h2 className={sectionTitleClass}>Linked Organizations</h2>
                            <p className="text-sm text-[var(--app-text-secondary)] mt-1">
                                Manage linked organizations and pending link requests.
                            </p>
                        </div>
                        {canManageOrganizations && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowRequestLinkModal(true)}
                                    disabled={linkedOrgLimitReached}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--app-border)] hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Link2 className="w-4 h-4" />
                                    Request Existing
                                </button>
                                <button
                                    onClick={() => setShowCreateOrgModal(true)}
                                    disabled={linkedOrgLimitReached}
                                    className="inline-flex items-center gap-2 px-4 py-2 btn-primary text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus className="w-4 h-4" />
                                    Create Organization
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="mt-4 relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search organizations and link requests..."
                            className={`pl-9 ${searchInputClass}`}
                        />
                    </div>
                    {linkedOrgLimitReached && (
                        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                            Limit reached: Linked Organizations ({quotaUsage?.linkedOrgs ?? 0}/{quotaLimits?.maxLinkedOrgs ?? 0})
                        </p>
                    )}
                    {restrictedOrganizationsCount > 0 && (
                        <p className="mt-3 text-xs text-red-600 dark:text-red-400">
                            {restrictedOrganizationsCount} linked organization{restrictedOrganizationsCount > 1 ? 's are' : ' is'} restricted. Management actions are disabled.
                        </p>
                    )}
                </div>

                {error && (
                    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}

                <div className={sectionCardClass}>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Organizations</h3>
                    {loading ? (
                        <TableSkeleton cols={4} rows={4} />
                    ) : organizations.length === 0 ? (
                        <div className="py-12 text-center">
                            <Building2 className={emptyStateIconClass} />
                            <p className="text-lg font-semibold text-slate-900 dark:text-white">No linked organizations yet</p>
                            <p className="text-sm text-[var(--app-text-secondary)] mt-1">Link an existing org or create one under this workspace.</p>
                        </div>
                    ) : filteredOrganizations.length === 0 ? (
                        <div className="py-8 text-center text-sm text-[var(--app-text-secondary)]">
                            No organizations match your search.
                        </div>
                    ) : (
                        <div className={tableWrapperClass}>
                            <table className="min-w-full text-sm">
                                <thead className={tableHeadClass}>
                                    <tr>
                                        <th className="px-3 py-2 text-left">Organization</th>
                                        <th className="px-3 py-2 text-left">Plan</th>
                                        <th className="px-3 py-2 text-left">Status</th>
                                        {canManageOrganizations && <th className="px-3 py-2 text-right">Action</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredOrganizations.map((link) => (
                                        <tr key={link.id} className={tableRowClass}>
                                            <td className="px-3 py-3">
                                                <p className="font-medium text-slate-900 dark:text-white">
                                                    {link.organization.name}
                                                </p>
                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                    <p className="text-xs text-[var(--app-text-secondary)]">{link.organization.slug || '—'}</p>
                                                    {link.organization.isRestricted && (
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                                            <Ban className="h-3 w-3" />
                                                            Restricted
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-[var(--app-text-primary)]">
                                                {link.organization.planType}
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className={statusBadgeClass(link.organization.status)}>
                                                    {link.organization.status}
                                                </span>
                                            </td>
                                            {canManageOrganizations && (
                                                <td className="px-3 py-3 text-right">
                                                    <button
                                                        onClick={() => handleUnlinkOrg(link)}
                                                        disabled={Boolean(link.organization.isRestricted)}
                                                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                                        title={link.organization.isRestricted ? 'Organization is restricted' : 'Unlink'}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className={sectionCardClass}>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Link Requests</h3>
                    {loading ? (
                        <TableSkeleton cols={4} rows={3} />
                    ) : linkRequests.length === 0 ? (
                        <p className="text-sm text-[var(--app-text-secondary)]">No link requests yet.</p>
                    ) : filteredLinkRequests.length === 0 ? (
                        <p className="text-sm text-[var(--app-text-secondary)]">No link requests match your search.</p>
                    ) : (
                        <div className={tableWrapperClass}>
                            <table className="min-w-full text-sm">
                                <thead className={tableHeadClass}>
                                    <tr>
                                        <th className="px-3 py-2 text-left">Organization</th>
                                        <th className="px-3 py-2 text-left">Status</th>
                                        <th className="px-3 py-2 text-left">Created</th>
                                        {canManageOrganizations && <th className="px-3 py-2 text-right">Action</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLinkRequests.map((request) => (
                                        <tr key={request.id} className={tableRowClass}>
                                            <td className="px-3 py-3 text-[var(--app-text-primary)]">
                                                {request.organization?.name || request.requestIdentifier || 'Organization'}
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className={statusBadgeClass(request.status)}>
                                                    {request.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-[var(--app-text-secondary)] whitespace-nowrap">
                                                {new Date(request.createdAt).toLocaleDateString()}
                                            </td>
                                            {canManageOrganizations && (
                                                <td className="px-3 py-3 text-right">
                                                    {(request.status === 'PENDING' || request.status === 'PENDING_APPROVAL') && (
                                                        <button
                                                            onClick={() => handleCancelLinkRequest(request.id)}
                                                            disabled={Boolean(request.organization?.isRestricted)}
                                                            className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                                            title={request.organization?.isRestricted ? 'Organization is restricted' : undefined}
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

            {showRequestLinkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-lg w-full shadow-2xl">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                            Request Existing Organization Link
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                                    Link method
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {LINK_REQUEST_METHOD_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => {
                                                setRequestLinkMethod(option.value);
                                                setRequestIdentifierError(null);
                                            }}
                                            className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                                requestLinkMethod === option.value
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                                                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <input
                                    type="text"
                                    value={requestIdentifier}
                                    onChange={(e) => {
                                        setRequestIdentifier(e.target.value);
                                        if (requestIdentifierError) setRequestIdentifierError(null);
                                    }}
                                    placeholder={selectedLinkMethod.placeholder}
                                    className={`w-full px-4 py-2.5 rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white ${
                                        requestIdentifierError ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-700'
                                    }`}
                                />
                                {requestIdentifierError ? (
                                    <p className="text-xs text-red-500 mt-1">{requestIdentifierError}</p>
                                ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedLinkMethod.helper}</p>
                                )}
                            </div>
                            <textarea
                                value={requestMessage}
                                onChange={(e) => setRequestMessage(e.target.value)}
                                placeholder="Optional message to organization owner"
                                className="w-full px-4 py-2.5 h-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowRequestLinkModal(false);
                                    setRequestLinkMethod('EMAIL');
                                    setRequestIdentifier('');
                                    setRequestIdentifierError(null);
                                    setRequestMessage('');
                                }}
                                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateLinkRequest}
                                disabled={linkedOrgLimitReached || linkingOrg || !requestIdentifier.trim()}
                                className="flex-1 px-4 py-2.5 btn-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {linkingOrg ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    'Create Request'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCreateOrgModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="surface-card rounded-xl border border-[var(--app-border)] p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-[var(--app-text-primary)] mb-4">Create Organization</h2>
                        <div className="space-y-4">
                            <div className="flex justify-center">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-full bg-[var(--app-surface-hover)] border-2 border-dashed border-[var(--app-border)] flex items-center justify-center overflow-hidden">
                                        {orgLogoPreviewUrl || orgUploadedLogoUrl || orgCreateForm.logo ? (
                                            <Image
                                                src={orgLogoPreviewUrl || orgUploadedLogoUrl || orgCreateForm.logo}
                                                alt="Organization logo preview"
                                                fill
                                                className="object-cover"
                                                sizes="96px"
                                            />
                                        ) : (
                                            <Building2 className="w-8 h-8 text-slate-400" />
                                        )}
                                        {uploadingOrgLogo && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                                            </div>
                                        )}
                                    </div>
                                    <label className="absolute bottom-0 right-0 btn-primary p-1.5 rounded-full cursor-pointer shadow-lg transition-colors">
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*,.svg"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                void handleOrgLogoUpload(file);
                                            }}
                                        />
                                        <Upload className="w-3.5 h-3.5" />
                                    </label>
                                    {(orgLogoPreviewUrl || orgUploadedLogoUrl || orgCreateForm.logo) && (
                                        <button
                                            type="button"
                                            onClick={handleRemoveOrgLogo}
                                            className="absolute -top-2 -right-2 bg-[var(--app-surface)] text-[var(--app-text-primary)] border border-[var(--app-border)] p-1.5 rounded-full shadow hover:bg-[var(--app-surface-hover)] transition-colors"
                                            aria-label="Remove logo"
                                        >
                                            <XCircle className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {orgCreateErrors.logo && <p className="text-xs text-red-600 dark:text-red-400 text-center">{orgCreateErrors.logo}</p>}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-[var(--app-text-secondary)]">Org Type</label>
                                    <select
                                        value={orgCreateForm.type}
                                        onChange={(e) => handleOrgCreateFieldChange('type', e.target.value)}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                    >
                                        <option value="PUBLIC">Public</option>
                                        <option value="PRIVATE">Private</option>
                                        <option value="NON_PROFIT">Non-profit</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[var(--app-text-secondary)]">Organization Name</label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.orgName}
                                        onChange={(e) => handleOrgCreateFieldChange('orgName', e.target.value)}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                    />
                                    {orgCreateErrors.orgName && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{orgCreateErrors.orgName}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-[var(--app-text-secondary)]">Email</label>
                                    <input
                                        type="email"
                                        value={orgCreateForm.email}
                                        onChange={(e) => handleOrgCreateFieldChange('email', e.target.value)}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                    />
                                    {orgCreateErrors.email && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{orgCreateErrors.email}</p>}
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[var(--app-text-secondary)]">Website</label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.website}
                                        onChange={(e) => handleOrgCreateFieldChange('website', e.target.value)}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                    />
                                    {orgCreateErrors.website && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{orgCreateErrors.website}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-[var(--app-text-secondary)]">Phone</label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.phone}
                                        onChange={(e) => handleOrgCreateFieldChange('phone', e.target.value)}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                    />
                                    {orgCreateErrors.phone && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{orgCreateErrors.phone}</p>}
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[var(--app-text-secondary)]">Address</label>
                                    <input
                                        type="text"
                                        value={orgCreateForm.address}
                                        onChange={(e) => handleOrgCreateFieldChange('address', e.target.value)}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                    />
                                    {orgCreateErrors.address && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{orgCreateErrors.address}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-[var(--app-text-secondary)]">Country</label>
                                    <select
                                        value={orgCreateForm.countryId}
                                        onChange={(e) => {
                                            handleOrgCreateFieldChange('countryId', e.target.value);
                                            handleOrgCreateFieldChange('stateId', '');
                                        }}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                    >
                                        <option value="">Select Country</option>
                                        {orgCountries.map((country) => (
                                            <option key={country.id} value={country.id}>
                                                {country.name}
                                            </option>
                                        ))}
                                    </select>
                                    {orgCreateErrors.countryId && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{orgCreateErrors.countryId}</p>}
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[var(--app-text-secondary)]">State (Optional)</label>
                                    <select
                                        value={orgCreateForm.stateId}
                                        onChange={(e) => handleOrgCreateFieldChange('stateId', e.target.value)}
                                        disabled={!orgCreateForm.countryId || fetchingOrgStates}
                                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)] disabled:opacity-50"
                                    >
                                        <option value="">Select State</option>
                                        {orgStates.map((state) => (
                                            <option key={state.id} value={state.id}>
                                                {state.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-[var(--app-text-secondary)]">Category</label>
                                <select
                                    value={orgCreateForm.categoryId}
                                    onChange={(e) => handleOrgCreateFieldChange('categoryId', e.target.value)}
                                    className="mt-1 w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                >
                                    <option value="">Select Category</option>
                                    {orgCategories.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                                {orgCreateErrors.categoryId && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{orgCreateErrors.categoryId}</p>}
                            </div>

                            <div>
                                <label className="text-xs font-medium text-[var(--app-text-secondary)]">About Organization</label>
                                <textarea
                                    value={orgCreateForm.about}
                                    onChange={(e) => handleOrgCreateFieldChange('about', e.target.value)}
                                    className="mt-1 w-full h-24 px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                />
                            </div>

                            <PasswordFields
                                password={orgCreateForm.password}
                                setPassword={(value) => {
                                    handleOrgCreateFieldChange('password', value);
                                    setOrgCreateErrors((prev) => ({
                                        ...prev,
                                        password: '',
                                        confirmPassword: '',
                                    }));
                                }}
                                confirmPassword={orgConfirmPassword}
                                setConfirmPassword={(value) => {
                                    setOrgConfirmPassword(value);
                                    setOrgCreateErrors((prev) => ({
                                        ...prev,
                                        confirmPassword: '',
                                    }));
                                }}
                                required
                                labelClassName="text-xs font-medium text-[var(--app-text-secondary)]"
                                inputClassName="w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)]"
                                passwordError={orgCreateErrors.password}
                                confirmError={orgCreateErrors.confirmPassword}
                            />
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowCreateOrgModal(false);
                                    resetCreateOrgForm();
                                }}
                                className="flex-1 px-4 py-2.5 border border-[var(--app-border)] text-[var(--app-text-secondary)] font-medium rounded-lg hover:bg-[var(--app-surface-hover)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateOrganization}
                                disabled={
                                    linkedOrgLimitReached
                                    || creatingOrganization
                                    || uploadingOrgLogo
                                    || !orgCreateForm.orgName.trim()
                                    || !orgCreateForm.email.trim()
                                    || !orgCreateForm.password.trim()
                                    || !orgConfirmPassword.trim()
                                    || passwordsDoNotMatch
                                    || !passwordValidation.ok
                                    || !orgCreateForm.website.trim()
                                    || !orgCreateForm.phone.trim()
                                    || !orgCreateForm.address.trim()
                                    || !orgCreateForm.countryId
                                    || !orgCreateForm.categoryId
                                }
                                className="flex-1 px-4 py-2.5 btn-primary font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {creatingOrganization ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create Organization'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
