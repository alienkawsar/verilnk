import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { updateAdminProfile } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import PasswordFields from '@/components/auth/PasswordFields';
import { validatePassword } from '@/lib/passwordPolicy';

interface AccountSectionProps {
    user: { firstName?: string; lastName?: string; email: string; role: string } | null;
}

export default function AccountSection({ user }: AccountSectionProps) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    // Profile State
    const [firstName, setFirstName] = useState(user?.firstName || '');
    const [lastName, setLastName] = useState(user?.lastName || '');
    const [email, setEmail] = useState(user?.email || '');

    // Password State
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await updateAdminProfile({ firstName, lastName, email });
            showToast('Profile updated successfully', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update profile', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.ok) {
            showToast(passwordValidation.message || 'Password is invalid', 'error');
            return;
        }

        setLoading(true);
        try {
            await updateAdminProfile({ password });
            showToast('Password updated successfully', 'success');
            setPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update password', 'error');
        } finally {
            setLoading(false);
        }
    };

    const isRestricted = ['MODERATOR', 'VERIFIER'].includes(user?.role || '');

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">My Account</h1>

            {/* Profile Information */}
            <div className="surface-card rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Profile Information</h2>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                            <input
                                type="text"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                            <input
                                type="text"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                className="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            readOnly={isRestricted}
                            className={`w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 ${isRestricted ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        {isRestricted && <p className="text-xs text-slate-500 mt-1">Email cannot be changed by Moderators or Verifiers.</p>}
                    </div>
                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>

            {/* Change Password (Restricted) */}
            {!isRestricted && (
                <div className="surface-card rounded-xl p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Change Password</h2>
                    <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                        <PasswordFields
                            password={password}
                            setPassword={setPassword}
                            confirmPassword={confirmPassword}
                            setConfirmPassword={setConfirmPassword}
                            required
                            labelPassword="New Password"
                            labelConfirm="Confirm New Password"
                            labelClassName="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                            inputClassName="w-full bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500"
                            confirmPlaceholder="Re-enter password"
                        />
                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading || !password}
                                className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Update Password
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
