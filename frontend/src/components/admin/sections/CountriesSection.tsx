'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Plus, Edit, Trash2, Globe, Search } from 'lucide-react';
import { fetchCountries, createCountry, updateCountry, deleteCountry } from '@/lib/api';
import { getImageUrl } from '@/lib/utils';
import CountryForm from '@/components/admin/CountryForm';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';

interface Country {
    id: string;
    name: string;
    code: string;
    flagImage?: string;
    flagImageUrl?: string;
    isEnabled: boolean;
}

export default function CountriesSection() {
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCountry, setEditingCountry] = useState<Country | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const { showToast } = useToast();

    const loadCountries = async () => {
        try {
            const data = await fetchCountries({ includeDisabled: true });
            setCountries(data);
        } catch (error) {
            console.error('Failed to load countries', error);
            showToast('Failed to load countries', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCountries();

    }, []);

    const handleCreate = () => {
        setEditingCountry(null);
        setIsModalOpen(true);
    };

    const handleEdit = (country: Country) => {
        setEditingCountry(country);
        setIsModalOpen(true);
    };

    const handleToggleStatus = async (country: Country) => {
        try {
            // Optimistic update
            const newStatus = !country.isEnabled;
            setCountries(prev => prev.map(c => c.id === country.id ? { ...c, isEnabled: newStatus } : c));

            await updateCountry(country.id, {
                name: country.name,
                code: country.code,
                isEnabled: newStatus
            });
            showToast(`Country ${newStatus ? 'enabled' : 'disabled'}`, 'success');
        } catch (error) {
            showToast('Failed to update status', 'error');
            loadCountries(); // Revert on failure
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete ${name}?`)) return;

        try {
            await deleteCountry(id);
            showToast('Country deleted successfully', 'success');
            await loadCountries();
        } catch {
            showToast('Failed to delete country', 'error');
        }
    };

    const handleSubmit = async (data: any) => {
        setActionLoading(true);
        try {
            if (editingCountry) {
                await updateCountry(editingCountry.id, data);
                showToast('Country updated successfully', 'success');
            } else {
                await createCountry(data);
                showToast('Country created successfully', 'success');
            }
            await loadCountries();
            setIsModalOpen(false);
        } catch (error: unknown) {
            const msg = (error as any).response?.data?.message || 'Operation failed';
            showToast(msg, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const filteredCountries = countries.filter(c =>
        c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.code.toLowerCase().includes(debouncedSearch.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Globe className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                    Countries
                </h1>
                <button
                    onClick={handleCreate}
                    className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2 transition-colors w-full sm:w-auto justify-center"
                >
                    <Plus className="w-5 h-5" />
                    Add Country
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Search countries..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border border-[var(--app-border)] rounded-lg pl-10 pr-4 py-3 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                />
            </div>

            {loading ? (
                <TableSkeleton cols={3} rows={5} />
            ) : (
                <div className="surface-card rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-app-secondary/50 text-[var(--app-text-secondary)] text-sm uppercase">
                            <tr>
                                <th className="px-6 py-4 font-medium">Flag</th>
                                <th className="px-6 py-4 font-medium">Name</th>
                                <th className="px-6 py-4 font-medium">Code</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filteredCountries.map((country) => (
                                <tr key={country.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${!country.isEnabled ? 'opacity-60' : ''}`}>
                                    <td className="px-6 py-4">
                                        <div className="relative w-10 h-7 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden flex items-center justify-center border border-slate-200 dark:border-slate-600">
                                            {(country.flagImage || country.flagImageUrl) ? (
                                                <Image
                                                    src={country.flagImage ? getImageUrl(country.flagImage) : (country.flagImageUrl || '')}
                                                    alt={country.code}
                                                    fill
                                                    className="object-cover"
                                                    sizes="40px"
                                                />
                                            ) : (
                                                <span className="text-xs text-slate-500">{country.code}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">{country.name}</td>
                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono">
                                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700/50 rounded border border-slate-200 dark:border-slate-600/50 text-xs text-slate-600 dark:text-slate-300">
                                            {country.code}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => handleToggleStatus(country)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-800 ${country.isEnabled ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-600'}`}
                                        >
                                            <span className={`${country.isEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm`} />
                                        </button>
                                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                                            {country.isEnabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-3">
                                        <button
                                            onClick={() => handleEdit(country)}
                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 p-2 hover:bg-blue-50 dark:hover:bg-blue-400/10 rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(country.id, country.name)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 p-2 hover:bg-red-50 dark:hover:bg-red-400/10 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredCountries.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-500">
                                        No countries found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <CountryForm
                    initialData={editingCountry}
                    onSubmit={handleSubmit}
                    onCancel={() => setIsModalOpen(false)}
                    isLoading={actionLoading}
                />
            )}
        </div>
    );
}
