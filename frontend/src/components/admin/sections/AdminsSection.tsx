import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Shield, Loader2, Search, X, Power } from 'lucide-react';
import { fetchAdmins, createAdmin, updateAdmin, deleteAdmin, setAdminActiveStatus } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';
import { useDebounce } from '@/hooks/useDebounce';
import PasswordFields from '@/components/auth/PasswordFields';
import { validatePassword } from '@/lib/passwordPolicy';

interface Admin {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'SUPER_ADMIN' | 'MODERATOR' | 'VERIFIER' | 'ACCOUNTS';
    isActive: boolean;
    createdAt: string;
}

export default function AdminsSection() {
    const [admins, setAdmins] = useState<Admin[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRole, setSelectedRole] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);

    const loadAdmins = async () => {
        setLoading(true);
        try {
            const data = await fetchAdmins({
                role: selectedRole || undefined,
                search: debouncedSearch || undefined
            });
            setAdmins(data);
        } catch {
            showToast('Failed to load admins', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAdmins();

    }, [selectedRole, debouncedSearch]);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this admin?')) return;
        try {
            await deleteAdmin(id);
            showToast('Admin deleted successfully', 'success');
            loadAdmins();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to delete admin', 'error');
        }
    };

    const handleStatusToggle = async (admin: Admin) => {
        const nextStatus = !admin.isActive;
        const actionLabel = nextStatus ? 'activate' : 'deactivate';
        if (!confirm(`Are you sure you want to ${actionLabel} ${admin.email}?`)) return;

        try {
            await setAdminActiveStatus(admin.id, nextStatus);
            showToast(`Admin ${nextStatus ? 'activated' : 'deactivated'} successfully`, 'success');
            loadAdmins();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update admin status', 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Shield className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                    Manage Admins
                </h1>
                <button
                    onClick={() => { setEditingAdmin(null); setIsModalOpen(true); }}
                    className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2 transition-colors w-full sm:w-auto justify-center"
                >
                    <Plus className="w-5 h-5" />
                    Add Admin
                </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center surface-card p-4 rounded-xl shadow-sm">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search by email or name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full md:w-64 bg-transparent border border-[var(--app-border)] rounded-lg pl-9 pr-4 py-2.5 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 placeholder-[var(--app-text-secondary)]"
                    />
                </div>

                <div className="flex-1 min-w-[150px] max-w-xs">
                    <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="w-full px-4 py-2.5 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                    >
                        <option value="">All Roles</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                        <option value="MODERATOR">Moderator</option>
                        <option value="VERIFIER">Verifier</option>
                        <option value="ACCOUNTS">Accounts</option>
                    </select>
                </div>

                {(searchQuery || selectedRole) && (
                    <button
                        onClick={() => {
                            setSearchQuery('');
                            setSelectedRole('');
                        }}
                        className="p-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-white rounded-lg transition-colors flex items-center gap-2"
                        title="Reset Filters"
                    >
                        <X className="w-4 h-5" />
                        Reset
                    </button>
                )}
            </div>

            {loading ? (
                <TableSkeleton cols={5} rows={5} />
            ) : (
                <div className="surface-card rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-app-secondary/50 text-[var(--app-text-secondary)] text-sm uppercase">
                            <tr>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">Email</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {admins.map((admin) => (
                                <tr key={admin.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                    <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">
                                        {admin.firstName} {admin.lastName}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{admin.email}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${admin.role === 'SUPER_ADMIN' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                                            admin.role === 'MODERATOR' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                                                admin.role === 'ACCOUNTS' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                                                'bg-green-500/10 text-green-600 dark:text-green-400'
                                            }`}>
                                            {admin.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${admin.isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'}`}>
                                            {admin.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-3">
                                        {admin.role === 'ACCOUNTS' && (
                                            <button
                                                onClick={() => handleStatusToggle(admin)}
                                                className={`${admin.isActive ? 'text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300' : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300'}`}
                                                title={admin.isActive ? 'Deactivate ACCOUNTS admin' : 'Activate ACCOUNTS admin'}
                                            >
                                                <Power className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setEditingAdmin(admin); setIsModalOpen(true); }}
                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(admin.id)}
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
            )}

            {isModalOpen && (
                <AdminFormModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    initialData={editingAdmin}
                    onSave={loadAdmins}
                />
            )}
        </div>
    );
}

function AdminFormModal({ isOpen, onClose, initialData, onSave }: any) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [formData, setFormData] = useState({
        firstName: initialData?.firstName || '',
        lastName: initialData?.lastName || '',
        email: initialData?.email || '',
        role: initialData?.role || 'VERIFIER',
        password: '',
    });

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
        setLoading(true);
        try {
            const passwordValidation = validatePassword(formData.password);
            if (formData.password && !passwordValidation.ok) {
                showToast(passwordValidation.message || 'Password is invalid', 'error');
                return;
            }
            if (initialData) {
                await updateAdmin(initialData.id, formData);
            } else {
                await createAdmin(formData);
            }
            showToast(`Admin ${initialData ? 'updated' : 'created'} successfully`, 'success');
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
                    {initialData ? 'Edit Admin' : 'New Admin'}
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
                        <label className="text-sm text-slate-600 dark:text-slate-400 block mb-1">Role</label>
                        <select
                            className="w-full bg-transparent border border-[var(--app-border)] rounded p-2 text-[var(--app-text-primary)]"
                            value={formData.role}
                            onChange={e => setFormData({ ...formData, role: e.target.value })}
                        >
                            <option value="VERIFIER">Verifier</option>
                            <option value="MODERATOR">Moderator</option>
                            <option value="ACCOUNTS">Accounts</option>
                            <option value="SUPER_ADMIN">Super Admin</option>
                        </select>
                    </div>
                    <div>
                        <PasswordFields
                            password={formData.password}
                            setPassword={(value) => setFormData({ ...formData, password: value })}
                            confirmPassword={confirmPassword}
                            setConfirmPassword={setConfirmPassword}
                            required={!initialData}
                            labelPassword={initialData ? 'New Password (Optional)' : 'Password'}
                            labelClassName="text-sm text-slate-600 dark:text-slate-400 block mb-1"
                            inputClassName="w-full bg-transparent border border-[var(--app-border)] rounded p-2 text-[var(--app-text-primary)]"
                            passwordPlaceholder={initialData ? 'Leave blank to keep same' : 'Enter password'}
                            confirmPlaceholder={initialData ? 'Re-enter new password' : 'Re-enter password'}
                        />
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
                            {initialData ? 'Save Changes' : 'Create Admin'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
