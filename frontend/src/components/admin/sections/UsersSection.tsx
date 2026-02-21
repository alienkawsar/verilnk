import { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Trash2, Users, Loader2, Search, Ban, CheckCircle, X, Hash } from 'lucide-react';
import { fetchUsers, createUserAdmin, updateUserAdmin, deleteUser, restrictUser, fetchCountries, deleteUsersBulk, updateUsersBulk } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';
import { useDebounce } from '@/hooks/useDebounce';
import PasswordFields from '@/components/auth/PasswordFields';
import { validatePassword } from '@/lib/passwordPolicy';

interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    country: string | null;
    isRestricted?: boolean;
    createdAt: string;
    organization?: { name: string; country: { name: string } };
    dailyRequestLimit?: number | null;
    requestLimit?: number | null;
    requestLimitWindow?: number;
}

type CountryOption = {
    id: string;
    name?: string | null;
    code?: string | null;
};

export default function UsersSection() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);

    // Bulk Actions
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Filters
    const [filters, setFilters] = useState({
        countryCode: '',
        stateId: '',
        categoryId: '',
        type: ''
    });

    const requestIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);



    // Lookups

    const [countries, setCountries] = useState<any[]>([]);

    useEffect(() => {
        fetchCountries().then(setCountries).catch(console.error);
    }, []);

    // ...

    const loadUsers = async () => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;
        const requestId = ++requestIdRef.current;

        setLoading(true);
        try {
            const data = await fetchUsers({
                country: filters.countryCode,
                type: filters.type
                // stateId/categoryId ignored by backend now
            }, controller.signal);
            if (requestId === requestIdRef.current) {
                setUsers(data);
            }
        } catch (err: any) {
            if (err?.name !== 'CanceledError') {
                showToast('Failed to load users', 'error');
            }
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        loadUsers();

    }, [filters, debouncedSearch]);

    const handleDelete = async (id: string, email: string) => {
        if (!confirm(`Are you sure you want to delete user ${email}?`)) return;
        try {
            await deleteUser(id);
            showToast('User deleted successfully', 'success');
            loadUsers();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to delete user', 'error');
        }
    };

    const handleToggleRestriction = async (user: User) => {
        const newStatus = !user.isRestricted;
        if (!confirm(`Are you sure you want to ${newStatus ? 'RESTRICT' : 'UNRESTRICT'} user ${user.email}?`)) return;
        try {
            await restrictUser(user.id, newStatus);
            showToast(`User ${newStatus ? 'restricted' : 'unrestricted'} successfully`, 'success');
            loadUsers();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update restriction', 'error');
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected users? This action cannot be undone.`)) return;
        try {
            await deleteUsersBulk(selectedIds);
            showToast(`${selectedIds.length} users deleted successfully`, 'success');
            setSelectedIds([]);
            loadUsers();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to delete users', 'error');
        }
    };

    const handleBulkLimit = async () => {
        const limitStr = prompt("Enter Max Requests (leave empty or 0 for unlimited):");
        if (limitStr === null) return;

        const limit = limitStr.trim() === '' || limitStr === '0' ? null : parseInt(limitStr);
        if (limit !== null && isNaN(limit)) {
            alert("Invalid number");
            return;
        }

        let window = 1;

        if (limit !== null) {
            const windowStr = prompt("Enter Limit Window in Days (1, 7, 15, 30):", "1");
            if (windowStr === null) return;
            window = parseInt(windowStr);
            if (isNaN(window) || ![1, 7, 15, 30].includes(window)) {
                alert("Invalid window. Must be 1, 7, 15, or 30.");
                return;
            }
        }

        try {
            await updateUsersBulk(selectedIds, { requestLimit: limit, requestLimitWindow: window, dailyRequestLimit: limit });
            showToast(`Limits updated for ${selectedIds.length} users`, 'success');
            setSelectedIds([]);
            loadUsers();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update users', 'error');
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(filteredUsers.map(u => u.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        u.name.toLowerCase().includes(debouncedSearch.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                    Manage Users
                </h1>
                {selectedIds.length > 0 && (
                    <div className="flex gap-2 mr-auto ml-4">
                        <button
                            onClick={handleBulkDelete}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Selected ({selectedIds.length})
                        </button>
                        <button
                            onClick={handleBulkLimit}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <Hash className="w-4 h-4" />
                            Set Daily Limit
                        </button>
                    </div>
                )}
                <button
                    onClick={() => { setEditingUser(null); setIsModalOpen(true); }}
                    className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Add User
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="relative lg:col-span-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full surface-card rounded-lg pl-10 pr-4 py-2.5 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                </div>

                {/* Filters */}
                <div className="lg:col-span-3 flex flex-wrap gap-3">
                    <select
                        value={filters.type}
                        onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                        className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 min-w-[200px] shadow-sm"
                    >
                        <option value="">All User Types</option>
                        <option value="general">General Users</option>
                        <option value="organization">Organization Users</option>
                    </select>

                    <select
                        value={filters.countryCode}
                        onChange={(e) => setFilters(prev => ({ ...prev, countryCode: e.target.value }))}
                        className="surface-card rounded-lg px-3 py-2.5 text-[var(--app-text-secondary)] text-sm focus:outline-none focus:border-blue-500 min-w-[200px] shadow-sm"
                    >
                        <option value="">All Countries</option>
                        {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>

                    {(filters.countryCode || filters.type) && (
                        <button
                            onClick={() => setFilters({ countryCode: '', stateId: '', categoryId: '', type: '' })}
                            className="bg-app-secondary hover:bg-slate-200 dark:hover:bg-slate-700 text-[var(--app-text-secondary)] px-4 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2"
                        >
                            <X className="w-4 h-4" />
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {
                loading ? (
                    <TableSkeleton cols={5} rows={5} />
                ) : (
                    <div className="surface-card rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-app-secondary/50 text-[var(--app-text-secondary)] text-sm uppercase">
                                <tr>
                                    <th className="px-6 py-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={filteredUsers.length > 0 && selectedIds.length === filteredUsers.length}
                                            onChange={handleSelectAll}
                                            className="rounded border-[var(--app-border)] text-blue-600 focus:ring-blue-500 bg-transparent"
                                        />
                                    </th>
                                    <th className="px-6 py-4">Name</th>
                                    <th className="px-6 py-4">Email</th>
                                    <th className="px-6 py-4">Country</th>
                                    <th className="px-6 py-4">Request Limit</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 ${selectedIds.includes(user.id) ? 'bg-blue-50/50 dark:bg-slate-700/20' : ''}`}>
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(user.id)}
                                                onChange={() => handleSelectRow(user.id)}
                                                className="rounded border-[var(--app-border)] text-blue-600 focus:ring-blue-500 bg-transparent"
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">
                                            {user.firstName} {user.lastName}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{user.email}</td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{user.country || '-'}</td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                            {user.requestLimit ? `${user.requestLimit} / ${user.requestLimitWindow || 1}d` : (user.dailyRequestLimit ? `${user.dailyRequestLimit} / 1d` : 'Unlimited')}
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.isRestricted ? (
                                                <span className="px-2 py-1 rounded bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-500/20 dark:border-red-500/30">RESTRICTED</span>
                                            ) : (
                                                <span className="px-2 py-1 rounded bg-green-500/10 dark:bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-bold border border-green-500/20 dark:border-green-500/30">ACTIVE</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-3">
                                            <button
                                                onClick={() => handleToggleRestriction(user)}
                                                className={`${user.isRestricted ? 'text-green-600 dark:text-green-400 hover:text-green-500 dark:hover:text-green-300' : 'text-orange-600 dark:text-orange-400 hover:text-orange-500 dark:hover:text-orange-300'}`}
                                                title={user.isRestricted ? "Unrestrict User" : "Restrict User"}
                                            >
                                                {user.isRestricted ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => { setEditingUser(user); setIsModalOpen(true); }}
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(user.id, user.email)}
                                                className="text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            }

            {
                isModalOpen && (
                    <UserFormModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        initialData={editingUser}
                        onSave={loadUsers}
                        countries={countries}
                    />
                )
            }
        </div >
    );
}

function UserFormModal({ isOpen, onClose, initialData, onSave, countries = [] }: any) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [formData, setFormData] = useState({
        firstName: initialData?.firstName || '',
        lastName: initialData?.lastName || '',
        email: initialData?.email || '',
        country: initialData?.country || '',
        password: '',
        dailyRequestLimit: initialData?.dailyRequestLimit?.toString() || '',
        requestLimit: initialData?.requestLimit?.toString() || '',
        requestLimitWindow: initialData?.requestLimitWindow || 1
    });

    const isGlobalCountryValue = (value?: string) => {
        const normalized = String(value || '').trim().toUpperCase();
        if (!normalized) return false;
        if (normalized === 'GLOBAL' || normalized === 'GL' || normalized === 'WW') return true;

        const countryList: CountryOption[] = Array.isArray(countries) ? countries : [];
        const matched = countryList.find((country) => {
            const code = String(country.code || '').trim().toUpperCase();
            const name = String(country.name || '').trim().toUpperCase();
            return country.id === value || code === normalized || name === normalized;
        });
        if (!matched) return false;
        const code = String(matched.code || '').trim().toUpperCase();
        const name = String(matched.name || '').trim().toUpperCase();
        return code === 'GL' || code === 'WW' || name === 'GLOBAL';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const shouldValidatePassword = !initialData || Boolean(formData.password);
        if (shouldValidatePassword && !confirmPassword) {
            showToast('Confirm password is required', 'error');
            return;
        }
        if (shouldValidatePassword && formData.password !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }
        if (isGlobalCountryValue(formData.country)) {
            showToast('Global is not allowed for user country', 'error');
            return;
        }
        setLoading(true);
        try {
            const payload: any = { ...formData };
            // Remove password if empty (prevents validation error)
            if (!payload.password) delete payload.password;
            const passwordValidation = validatePassword(formData.password);
            if (payload.password && !passwordValidation.ok) {
                showToast(passwordValidation.message || 'Password is invalid', 'error');
                return;
            }

            const strLimit = payload.requestLimit;

            // Convert limit to number or null
            // We update both legacy and new fields for compatibility
            if (strLimit === '' || strLimit === '0') {
                payload.requestLimit = null;
                payload.dailyRequestLimit = null;
            } else {
                const parsed = parseInt(strLimit);
                payload.requestLimit = isNaN(parsed) ? null : parsed;
                payload.dailyRequestLimit = payload.requestLimit;
            }

            const rawWindow = payload.requestLimitWindow as any;
            const parsedWindow = parseInt(rawWindow);
            // Default to 1 if parsing fails or invalid
            payload.requestLimitWindow = (isNaN(parsedWindow) || parsedWindow < 1) ? 1 : parsedWindow;

            if (initialData) {
                await updateUserAdmin(initialData.id, payload);
            } else {
                await createUserAdmin(payload);
            }
            showToast(`User ${initialData ? 'updated' : 'created'} successfully`, 'success');
            onSave();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Operation failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="surface-card rounded-xl shadow-2xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                    {initialData ? 'Edit User' : 'New User'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">First Name</label>
                            <input
                                required
                                className="w-full bg-transparent border border-[var(--app-border)] rounded p-2 text-[var(--app-text-primary)]"
                                value={formData.firstName}
                                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">Last Name</label>
                            <input
                                required
                                className="w-full bg-transparent border border-[var(--app-border)] rounded p-2 text-[var(--app-text-primary)]"
                                value={formData.lastName}
                                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">Email</label>
                        <input
                            required
                            type="email"
                            className="w-full bg-transparent border border-[var(--app-border)] rounded p-2 text-[var(--app-text-primary)]"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">Country (Code)</label>
                        <input
                            className="w-full bg-transparent border border-[var(--app-border)] rounded p-2 text-[var(--app-text-primary)]"
                            value={formData.country}
                            onChange={e => setFormData({ ...formData, country: e.target.value })}
                            placeholder="e.g. US"
                        />
                    </div>
                    <div>
                        <PasswordFields
                            password={formData.password}
                            setPassword={(value) => setFormData({ ...formData, password: value })}
                            confirmPassword={confirmPassword}
                            setConfirmPassword={setConfirmPassword}
                            required={!initialData}
                            labelPassword={initialData ? 'Reset Password (Optional)' : 'Password'}
                            labelClassName="text-sm text-slate-600 dark:text-slate-400 block mb-1"
                            inputClassName="w-full bg-transparent border border-[var(--app-border)] rounded p-2 text-[var(--app-text-primary)]"
                            passwordPlaceholder={initialData ? 'Leave blank to keep same' : 'Enter password'}
                            confirmPlaceholder={initialData ? 'Re-enter new password' : 'Re-enter password'}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">Max Requests (0 = Unlimited)</label>
                            <input
                                type="number"
                                min="0"
                                className="w-full bg-transparent border border-[var(--app-border)] rounded p-2 text-[var(--app-text-primary)]"
                                value={formData.requestLimit}
                                onChange={e => setFormData({ ...formData, requestLimit: e.target.value })}
                                placeholder="Unlimited"
                            />
                        </div>
                        <div>
                            <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">Time Window</label>
                            <select
                                className="w-full bg-transparent border border-[var(--app-border)] rounded p-2 text-[var(--app-text-primary)]"
                                value={formData.requestLimitWindow}
                                onChange={e => setFormData({ ...formData, requestLimitWindow: parseInt(e.target.value) })}
                            >
                                <option value={1}>1 Day</option>
                                <option value={7}>7 Days</option>
                                <option value={15}>15 Days</option>
                                <option value={30}>30 Days</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary px-4 py-2 rounded flex items-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {initialData ? 'Save Changes' : 'Create User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
