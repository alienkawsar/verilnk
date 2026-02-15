'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit, Trash2, Link as LinkIcon, ExternalLink, Filter, Search, FileText, CheckSquare, Square } from 'lucide-react';
import { fetchCountries, fetchStates, fetchCategories, fetchSites, createSite, updateSite, deleteSite, fetchOrganizations, bulkDeleteSites } from '@/lib/api';
import SiteForm from '@/components/admin/SiteForm';
import BulkImportModal from '../BulkImportModal';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';
import { useDebounce } from '@/hooks/useDebounce';
import { useRouter } from 'next/navigation';

interface Site {
    id: string;
    name: string;
    url: string;
    countryId: string;
    categoryId: string;
    status: string;
    country: { name: string };
    category: { name: string };
}

interface UrlsSectionProps {
    user?: { role: string };
}
export default function UrlsSection({ user }: UrlsSectionProps) {
    const router = useRouter();
    const [sites, setSites] = useState<Site[]>([]);
    const [countries, setCountries] = useState<any[]>([]);
    const [states, setStates] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [organizations, setOrganizations] = useState<any[]>([]);

    // Filters
    const [selectedCountry, setSelectedCountry] = useState('');
    const [selectedState, setSelectedState] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedOrganization, setSelectedOrganization] = useState('');
    const [selectedType, setSelectedType] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const debouncedSearch = useDebounce(searchQuery, 300);
    const requestIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isMetaLoading, setIsMetaLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSite, setEditingSite] = useState<Site | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

    // Bulk Selection State
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isProcessingBulk, setIsProcessingBulk] = useState(false);

    const { showToast } = useToast();

    const handleAdminRequestError = useCallback((error: any, endpoint: string, fallbackMessage: string) => {
        const status = error?.response?.status;

        if (process.env.NODE_ENV !== 'production') {
            console.error(`[UrlsSection] ${endpoint} failed`, {
                status,
                message: error?.response?.data?.message || error?.message || 'Unknown error'
            });
        }

        if (status === 401 || status === 403) {
            showToast('Session expired. Please sign in again.', 'error');
            router.push('/admin/login');
            return;
        }

        showToast(fallbackMessage, 'error');
    }, [router, showToast]);

    // Initial load for filters
    useEffect(() => {
        const loadMetaData = async () => {
            try {
                const [cData, catData, orgData] = await Promise.all([
                    fetchCountries(),
                    fetchCategories(),
                    fetchOrganizations()
                ]);
                setCountries(cData);
                setCategories(catData.sort((a: { priority: number }, b: { priority: number }) => b.priority - a.priority));
                setOrganizations(orgData);
            } catch (error) {
                handleAdminRequestError(error, 'metadata', 'Failed to load filter options');
            } finally {
                setIsMetaLoading(false);
            }
        };
        loadMetaData();

    }, [handleAdminRequestError]);

    const loadSites = async () => {
        // Now flexible loading (no forced filters)
        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;
        const requestId = ++requestIdRef.current;

        setLoading(true);
        setLoadError(null);

        try {
            const data = await fetchSites({
                countryId: selectedCountry || undefined,
                stateId: selectedState || undefined,
                categoryId: selectedCategory || undefined,
                organizationId: selectedOrganization || undefined,
                search: debouncedSearch || undefined,
                type: selectedType || undefined
            }, controller.signal);
            if (requestId === requestIdRef.current) {
                setSites(data);
            }
        } catch (error: any) {
            if (error?.name !== 'CanceledError') {
                setLoadError('Failed to load sites');
                handleAdminRequestError(error, 'sites', 'Failed to load sites');
            }
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    };

    // Reset selection when sites change (e.g. filter change)
    useEffect(() => {
        setSelectedIds([]);
    }, [sites]);

    const toggleSelectAll = () => {
        if (selectedIds.length === sites.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(sites.map(s => s.id));
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Are you sure you want to permanently delete ${selectedIds.length} sites? This cannot be undone.`)) return;

        setIsProcessingBulk(true);
        try {
            await bulkDeleteSites(selectedIds);
            showToast(`Successfully deleted ${selectedIds.length} sites`, 'success');
            setSelectedIds([]);
            await loadSites();
        } catch (error: any) {
            console.error(error);
            showToast(error.response?.data?.message || 'Failed to delete sites', 'error');
        } finally {
            setIsProcessingBulk(false);
        }
    };

    useEffect(() => {
        if (selectedCountry) {
            const loadStates = async () => {
                try {
                    const data = await fetchStates(selectedCountry);
                    setStates(data);
                } catch {
                    console.error('Failed to load states');
                }
            };
            loadStates();
            setSelectedState(''); // Reset state when country changes
        } else {
            setStates([]);
            setSelectedState('');
        }
    }, [selectedCountry]);

    useEffect(() => {
        loadSites();

    }, [selectedCountry, selectedState, selectedCategory, selectedOrganization, selectedType, debouncedSearch]);

    const handleCreate = () => {
        setEditingSite(null);
        setIsModalOpen(true);
    };

    const handleEdit = (site: Site) => {
        setEditingSite(site);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete ${name}?`)) return;

        try {
            await deleteSite(id);
            showToast('Site deleted successfully', 'success');
            // Refresh list if we have active filters
            // Or just always refresh now that we have flexible loading
            await loadSites();
        } catch {
            showToast('Failed to delete site', 'error');
        }
    };

    const handleSubmit = async (data: { name: string; url: string; countryId: string; categoryId: string }) => {
        // Cookies used automatically for auth

        setActionLoading(true);
        try {
            if (editingSite) {
                await updateSite(editingSite.id, data);
                showToast('Site updated successfully', 'success');
            } else {
                await createSite(data);
                showToast('Site created successfully', 'success');
            }
            // Always reload
            await loadSites();
            setIsModalOpen(false);
        } catch (error: unknown) {
            const msg = (error as any).response?.data?.message || 'Operation failed';
            showToast(msg, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'SUCCESS': return 'bg-green-500/10 text-green-400 border-green-500/20';
            case 'FAILED': return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'PENDING': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
            default: return 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <LinkIcon className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                    URL Manager
                </h1>

                <div className="flex gap-3 w-full sm:w-auto">
                    {user?.role === 'SUPER_ADMIN' && (
                        <button
                            onClick={() => setIsBulkModalOpen(true)}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors flex-1 sm:flex-initial justify-center shadow-lg shadow-green-900/20"
                        >
                            <FileText className="w-5 h-5" />
                            Bulk Import
                        </button>
                    )}
                    {user?.role === 'SUPER_ADMIN' && selectedIds.length > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={isProcessingBulk}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors flex-1 sm:flex-initial justify-center shadow-lg shadow-red-900/20 disabled:opacity-50"
                        >
                            <Trash2 className="w-5 h-5" />
                            Delete ({selectedIds.length})
                        </button>
                    )}
                    <button
                        onClick={handleCreate}
                        className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2 transition-colors flex-1 sm:flex-initial justify-center shadow-lg shadow-blue-900/20"
                    >
                        <Plus className="w-5 h-5" />
                        Add Site
                    </button>
                </div>
            </div>

            <div className="surface-card p-4 rounded-xl flex flex-wrap gap-2 items-center shadow-sm">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search URL Name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full md:w-56 surface-card rounded-lg pl-9 pr-4 py-2.5 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors placeholder:[var(--app-text-secondary)]"
                    />
                </div>
                <div className="flex-1 min-w-[110px]">
                    <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="w-full px-3 py-2.5 surface-card rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 text-sm"
                        disabled={isMetaLoading}
                    >
                        <option value="">All Types</option>
                        <option value="independent">Independent</option>
                        <option value="organization">Organization</option>
                    </select>
                </div>
                <div className="flex-1 min-w-[110px]">
                    <select
                        value={selectedOrganization}
                        onChange={(e) => setSelectedOrganization(e.target.value)}
                        className="w-full px-3 py-2.5 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 text-sm"
                        disabled={isMetaLoading}
                    >
                        <option value="">All Orgs</option>
                        {organizations.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[110px]">
                    <select
                        value={selectedCountry}
                        onChange={(e) => setSelectedCountry(e.target.value)}
                        className="w-full px-3 py-2.5 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 text-sm"
                        disabled={isMetaLoading}
                    >
                        <option value="">All Countries</option>
                        {countries.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[110px]">
                    <select
                        value={selectedState}
                        onChange={(e) => setSelectedState(e.target.value)}
                        className="w-full px-3 py-2.5 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 text-sm"
                        disabled={isMetaLoading || !selectedCountry}
                    >
                        <option value="">All States</option>
                        {states.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[110px]">
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full px-3 py-2.5 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 text-sm"
                        disabled={isMetaLoading}
                    >
                        <option value="">All Categories</option>
                        {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <button
                        onClick={() => {
                            setSearchQuery('');
                            setSelectedCountry('');
                            setSelectedState('');
                            setSelectedCategory('');
                            setSelectedOrganization('');
                            setSelectedType('');
                        }}
                        className="p-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-white rounded-lg transition-colors disabled:opacity-50"
                        title="Reset Filters"
                    >
                        <Filter className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {
                loading ? (
                    <TableSkeleton cols={4} rows={5} />
                ) : loadError ? (
                    <div className="text-center text-red-600 dark:text-red-400 py-12 border border-red-200 dark:border-red-800 rounded-xl bg-red-50 dark:bg-red-900/20">
                        <p className="font-medium">Unable to load sites right now.</p>
                        <button
                            type="button"
                            onClick={loadSites}
                            className="mt-3 inline-flex items-center px-3 py-1.5 rounded-lg text-sm border border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                ) : sites.length > 0 ? (
                    <div className="surface-card rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-app-secondary/50 text-[var(--app-text-secondary)] text-sm uppercase">
                                <tr>
                                    {user?.role === 'SUPER_ADMIN' && (
                                        <th className="px-6 py-4 w-12">
                                            <input
                                                type="checkbox"
                                                checked={sites.length > 0 && selectedIds.length === sites.length}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                                            />
                                        </th>
                                    )}
                                    <th className="px-6 py-4 font-medium">Name</th>
                                    <th className="px-6 py-4 font-medium">URL</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {sites.map((site) => (
                                    <tr key={site.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                        {user?.role === 'SUPER_ADMIN' && (
                                            <td className="px-6 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(site.id)}
                                                    onChange={() => toggleSelection(site.id)}
                                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                                                />
                                            </td>
                                        )}
                                        <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">{site.name}</td>
                                        <td className="px-6 py-4">
                                            <a
                                                href={site.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 flex items-center gap-1 hover:underline text-sm"
                                            >
                                                {site.url.replace('https://', '')} <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(site.status)}`}>
                                                {site.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-3">
                                            <button
                                                onClick={() => handleEdit(site)}
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 p-2 hover:bg-blue-50 dark:hover:bg-blue-400/10 rounded-lg transition-colors"
                                                title="Edit"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(site.id, site.name)}
                                                className="text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 p-2 hover:bg-red-50 dark:hover:bg-red-400/10 rounded-lg transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center text-[var(--app-text-secondary)] py-12 border-2 border-dashed border-[var(--app-border)] rounded-xl bg-app-secondary/50">
                        {selectedCountry && selectedCategory ? 'No sites found for this selection.' : 'Select a Country and Category to view sites.'}
                    </div>
                )
            }

            {
                isModalOpen && (
                    <SiteForm
                        initialData={editingSite}
                        countries={countries}
                        categories={categories}
                        onSubmit={handleSubmit}
                        onCancel={() => setIsModalOpen(false)}
                        isLoading={actionLoading}
                    />
                )
            }
            {
                isBulkModalOpen && (
                    <BulkImportModal
                        onClose={() => {
                            setIsBulkModalOpen(false);
                            loadSites();
                        }}
                    />
                )
            }
        </div >
    );
}
