'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Lock, AlertCircle } from 'lucide-react';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { LoadingSpinner } from '@/components/ui/Loading';
import { fetchAdminMe } from '@/lib/api';

export default function AdminLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Call the Proxy Route
            // This sets the HttpOnly cookie on the Next.js domain
            await axios.post('/api/auth/admin/login', { email, password });
            let destination = '/admin/dashboard';
            try {
                const me = await fetchAdminMe();
                if (me?.user?.role === 'ACCOUNTS') {
                    destination = '/admin/billing';
                }
            } catch {
                // Fallback to dashboard if role fetch fails after login.
            }
            router.replace(destination);
        } catch (err: unknown) {
            let msg = 'Login failed. Please check server connection.';

            if (axios.isAxiosError(err) && err.response?.data?.message) {
                msg = err.response.data.message;
            } else if (err instanceof Error) {
                msg = err.message;
            }

            setError(msg);
            console.error('Login failed details:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value);
        if (error) setError('');
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value);
        if (error) setError('');
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-app">
            <div className="max-w-md w-full surface-card p-8 rounded-2xl shadow-2xl">
                <div className="flex justify-center mb-8">
                    <div className="p-3 bg-blue-600/10 rounded-full ring-4 ring-blue-600/5">
                        <Lock className="w-8 h-8 text-blue-600" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-center text-[var(--app-text-primary)] mb-2">Welcome Back</h2>
                <p className="text-[var(--app-text-secondary)] text-center mb-8 text-sm">Enter your credentials to access the admin panel</p>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={handleEmailChange}
                            className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                            placeholder="example@gmail.com"
                            required
                            disabled={isLoading}
                        />
                    </div>

                    <PasswordInput
                        label="Password"
                        value={password}
                        onChange={handlePasswordChange}
                        placeholder="••••••••"
                        required
                        disabled={isLoading}
                    />

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm flex items-center gap-2 animate-in slide-in-from-top-2 fade-in">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <input
                                id="remember-me"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="h-4 w-4 rounded border-[var(--app-border)] bg-transparent text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer disabled:opacity-50"
                                disabled={isLoading}
                            />
                            <label htmlFor="remember-me" className="ml-2 block text-sm text-[var(--app-text-secondary)] cursor-pointer">
                                Keep me logged in
                            </label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 btn-primary font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <LoadingSpinner className="border-white border-t-transparent" />
                                <span>Authenticating...</span>
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
