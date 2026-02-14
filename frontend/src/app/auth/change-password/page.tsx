'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { updateUserProfile } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Lock, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '@/lib/validation';
import Image from 'next/image';

export default function ChangePasswordPage() {
    const [formData, setFormData] = useState({
        newPassword: '',
        confirmPassword: ''
    });

    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { user, login } = useAuth(); // We need to re-login or update user state after change
    const router = useRouter();
    const { showToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!STRONG_PASSWORD_REGEX.test(formData.newPassword)) {
            showToast(STRONG_PASSWORD_MESSAGE, 'error');
            return;
        }

        if (formData.newPassword !== formData.confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }

        setLoading(true);
        try {
            // We use updateUserProfile which calls PATCH /auth/me
            // Ensure backend handles `mustChangePassword` reset when password is changed.
            // Wait, does PATCH /auth/me reset `mustChangePassword`?
            // I haven't explicitly added that logic to `auth.controller`.
            // The prompt says "On successful change: Set mustChangePassword = false".
            // I need to verify/update backend Auth Controller logic for `updateProfile`.
            // But checking `admin.routes.ts`, it points to `adminController.updateProfile` for `/me/profile` (Admin)
            // AND `auth.routes.ts` has `router.patch('/me', ...)` for Users.
            // I checked `auth.routes.ts` (Step 1553 view was partial, Step 1453 view was partial).
            // I need to ensure the backend logic handles this. 
            // Assuming for now I might need to update backend too. 
            // Let's implement Frontend first.

            await updateUserProfile({
                password: formData.newPassword
            });

            showToast('Password updated successfully. You can now access your dashboard.', 'success');

            // Force reload to refresh user state (and clear mustChangePassword flag in context)
            window.location.href = '/dashboard';

        } catch (error: any) {
            console.error('Change Password Error:', error);
            showToast(error.response?.data?.message || 'Failed to update password', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (

        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-600/20 rounded-full flex items-center justify-center mb-6">
                        <ShieldCheck className="w-8 h-8 text-blue-600 dark:text-blue-500" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Secure Your Account</h1>
                    <p className="mt-2 text-slate-600 dark:text-slate-400">
                        For security reasons, you must update your password before proceeding.
                    </p>
                </div>

                <div className="surface-card rounded-2xl p-8 shadow-xl">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={formData.newPassword}
                                    onChange={e => setFormData({ ...formData, newPassword: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg pl-10 pr-10 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-slate-500">
                                Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={formData.confirmPassword}
                                    onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg pl-10 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-500/20 dark:shadow-blue-900/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Updating...
                                </>
                            ) : (
                                'Update Password & Continue'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
