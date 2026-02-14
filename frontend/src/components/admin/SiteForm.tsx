'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

import { fetchStates } from '@/lib/api';

interface SiteFormProps {
    initialData?: {
        id: string;
        name: string;
        url: string;
        countryId: string;
        stateId?: string;
        categoryId: string;
    } | null;
    countries: { id: string; name: string }[];
    categories: { id: string; name: string }[];
    onSubmit: (data: any) => Promise<void>; // Explicit any to allow flexible data
    onCancel: () => void;
    isLoading: boolean;
}

export default function SiteForm({ initialData, countries, categories, onSubmit, onCancel, isLoading }: SiteFormProps) {
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [countryId, setCountryId] = useState('');
    const [stateId, setStateId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [states, setStates] = useState<{ id: string; name: string; code?: string }[]>([]);
    const [loadingStates, setLoadingStates] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {

        if (initialData) {
            setName(initialData.name);
            setUrl(initialData.url);
            setCountryId(initialData.countryId);
            setStateId(initialData.stateId || '');
            setCategoryId(initialData.categoryId);
        } else {
            setName('');
            setUrl('');
            setCountryId('');
            setStateId('');
            setCategoryId('');
        }
    }, [initialData]);

    useEffect(() => {
        if (countryId) {
            const loadStates = async () => {
                setLoadingStates(true);
                try {
                    const data = await fetchStates(countryId);
                    setStates(data);
                } catch (error) {
                    console.error('Failed to load states', error);
                } finally {
                    setLoadingStates(false);
                }
            };
            loadStates();
        } else {
            setStates([]);
            setStateId('');
        }
    }, [countryId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!url.startsWith('https://')) {
            setError('URL must start with https://');
            return;
        }

        try {
            await onSubmit({ name, url, countryId, stateId: stateId || undefined, categoryId });
        } catch (err: any) {
            setError(err.response?.data?.message || 'Something went wrong');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="surface-card rounded-xl p-6 w-full max-w-md border border-[var(--app-border)] max-h-[90vh] overflow-y-auto shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-[var(--app-text-primary)]">
                        {initialData ? 'Edit Site' : 'Add New Site'}
                    </h3>
                    <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/10 text-red-400 p-3 rounded-lg mb-4 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Site Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">URL (https://)</label>
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                            required
                            placeholder="https://example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Country</label>
                        <select
                            value={countryId}
                            onChange={(e) => setCountryId(e.target.value)}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                            required
                        >
                            <option value="">Select Country</option>
                            {countries.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">State (Optional)</label>
                        <select
                            value={stateId}
                            onChange={(e) => setStateId(e.target.value)}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                            disabled={!countryId || loadingStates}
                        >
                            <option value="">{loadingStates ? 'Loading...' : 'Select State (Optional)'}</option>
                            {states.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name} {s.code ? `(${s.code})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">Category</label>
                        <select
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            className="w-full px-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                            required
                        >
                            <option value="">Select Category</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition-colors"
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 btn-primary rounded-lg disabled:opacity-50"
                        >
                            {isLoading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
