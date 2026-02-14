
import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, X, MapPin } from 'lucide-react';
import { fetchCountries, fetchStates, createState, updateState, deleteState } from '@/lib/api';

interface Country {
    id: string;
    name: string;
    code: string;
}

interface State {
    id: string;
    name: string;
    code?: string;
    countryId: string;
    country?: Country;
}

export default function StatesSection() {
    const [states, setStates] = useState<State[]>([]);
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCountryId, setSelectedCountryId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingState, setEditingState] = useState<State | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        countryId: ''
    });

    useEffect(() => {
        loadCountries();
    }, []);

    useEffect(() => {
        if (selectedCountryId) {
            loadStates(selectedCountryId);
        } else {
            setStates([]); // Clear states if no country selected
        }
    }, [selectedCountryId]);

    const loadCountries = async () => {
        try {
            const data = await fetchCountries();
            setCountries(data);
            if (data.length > 0) {
                // Determine default country (e.g., US or first one)
                const defaultCountry = data.find((c: Country) => c.code === 'US') || data[0];
                setSelectedCountryId(defaultCountry.id);
                setFormData(prev => ({ ...prev, countryId: defaultCountry.id }));
            }
        } catch (error) {
            console.error('Failed to load countries', error);
        } finally {
            setLoading(false);
        }
    };

    const loadStates = async (countryId: string) => {
        setLoading(true);
        try {
            const data = await fetchStates(countryId);
            setStates(data);
        } catch (error) {
            console.error('Failed to load states', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingState) {
                await updateState(editingState.id, formData);
            } else {
                await createState(formData);
            }
            setIsModalOpen(false);
            setEditingState(null);
            resetForm();
            loadStates(formData.countryId); // Reload states for the specific country
        } catch (error) {
            console.error('Failed to save state', error);
            alert('Failed to save state. Name might be duplicate.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this state?')) return;
        try {
            await deleteState(id);
            if (selectedCountryId) loadStates(selectedCountryId);
        } catch (error) {
            console.error('Failed to delete state', error);
            alert('Failed to delete state. It might be in use.');
        }
    };

    const openEditModal = (state: State) => {
        setEditingState(state);
        setFormData({
            name: state.name,
            code: state.code || '',
            countryId: state.countryId
        });
        setIsModalOpen(true);
    };

    const openCreateModal = () => {
        setEditingState(null);
        setFormData({
            name: '',
            code: '',
            countryId: selectedCountryId || (countries[0]?.id || '')
        });
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            code: '',
            countryId: selectedCountryId || ''
        });
    };

    const filteredStates = states.filter(state =>
        state.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (state.code && state.code.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">State Management</h2>
                    <p className="text-slate-500 dark:text-slate-400">Manage states/regions for countries</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2 btn-primary rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add State</span>
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 surface-card p-4 rounded-xl shadow-sm">
                {/* Country Selector */}
                <div className="w-full md:w-64">
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Select Country</label>
                    <select
                        value={selectedCountryId}
                        onChange={(e) => {
                            setSelectedCountryId(e.target.value);
                            setFormData(prev => ({ ...prev, countryId: e.target.value }));
                        }} // Only update filter, not form data yet unless opening modal
                        className="w-full px-3 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        {countries.map(country => (
                            <option key={country.id} value={country.id}>
                                {country.name} ({country.code})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex-1 relative">
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search States</label>
                    <Search className="absolute left-3 top-8 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search states..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] placeholder-[var(--app-text-secondary)] focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
            </div>

            {/* List */}
            <div className="surface-card rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-[var(--app-border)] bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] text-sm">
                                <th className="p-4 font-medium">State Name</th>
                                <th className="p-4 font-medium">Code</th>
                                <th className="p-4 font-medium">Country</th>
                                <th className="p-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filteredStates.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-500 dark:text-slate-400">
                                        No states found for this country.
                                    </td>
                                </tr>
                            ) : (
                                filteredStates.map((state) => (
                                    <tr key={state.id} className="group hover:bg-[var(--app-surface-hover)] transition-colors">
                                        <td className="p-4">
                                            <div className="font-medium text-[var(--app-text-primary)]">{state.name}</div>
                                        </td>
                                        <td className="p-4 text-slate-600 dark:text-slate-300">
                                            {state.code ? (
                                                <span className="px-2 py-1 rounded bg-[var(--app-surface-hover)] text-xs font-mono border border-[var(--app-border)]">
                                                    {state.code}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="p-4 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                            <MapPin className="w-3 h-3" />
                                            {countries.find(c => c.id === state.countryId)?.code}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => openEditModal(state)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-400/10 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(state.id)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-400/10 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="surface-card rounded-xl border border-[var(--app-border)] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-[var(--app-border)] flex items-center justify-between">
                            <h3 className="text-xl font-bold text-[var(--app-text-primary)]">
                                {editingState ? 'Edit State' : 'Add New State'}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">
                                    Country
                                </label>
                                <select
                                    value={formData.countryId}
                                    onChange={(e) => setFormData({ ...formData, countryId: e.target.value })}
                                    className="w-full px-3 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:ring-2 focus:ring-blue-500 outline-none"
                                    required
                                >
                                    <option value="" disabled>Select Country</option>
                                    {countries.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">
                                    State Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g. California"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-1">
                                    State Code (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                    className="w-full px-3 py-2 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g. CA"
                                    maxLength={5}
                                />
                                <p className="text-xs text-slate-500 mt-1">Short code like CA, NY, TX</p>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2 border border-[var(--app-border)] hover:bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 btn-primary text-white font-medium rounded-lg transition-colors"
                                >
                                    {editingState ? 'Save Changes' : 'Create State'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
