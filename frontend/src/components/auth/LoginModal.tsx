import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { loginSchema } from '@/lib/validation';
import { z } from 'zod';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { signIn, useSession } from 'next-auth/react';
import Image from 'next/image';
import { resolvePostLoginDestination } from '@/lib/auth-redirect';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSwitchToSignup: () => void;
}

export default function LoginModal({ isOpen, onClose, onSwitchToSignup }: LoginModalProps) {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [errors, setErrors] = useState<{ email?: string; password?: string, captcha?: string }>({});
    const [loading, setLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [generalError, setGeneralError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { login } = useAuth();
    const { data: session } = useSession();
    const { executeRecaptcha } = useGoogleReCaptcha();

    // Sync Google Session with Legacy Auth
    useEffect(() => {
        const syncGoogleSession = async () => {
            if (session?.user?.email && !loading && !isGoogleLoading) {
                try {
                    setIsGoogleLoading(true);
                    const res = await axios.post('/api/auth/sync-google');
                    if (res.data.user) {
                        login(res.data.user);

                        const user = res.data.user;
                        const returnTo = new URLSearchParams(window.location.search).get('returnTo');
                        window.location.href = resolvePostLoginDestination(user, returnTo);

                        onClose();
                    }
                } catch (error) {
                    console.error("Google Sync Failed", error);
                } finally {
                    setIsGoogleLoading(false);
                }
            }
        };

        if (isOpen && session) {
            syncGoogleSession();
        }
    }, [session, isOpen, login, onClose]);

    if (!isOpen) return null;

    const validateField = (name: keyof typeof formData, value: string) => {
        try {
            loginSchema.shape[name].parse(value);
            setErrors(prev => ({ ...prev, [name]: undefined }));
        } catch (error) {
            if (error instanceof z.ZodError) {

                const message = (error as any).errors?.[0]?.message;
                if (message) {
                    setErrors(prev => ({ ...prev, [name]: message }));
                }
            }
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        validateField(name as keyof typeof formData, value);
    };

    const handleGoogleLogin = () => {
        setIsGoogleLoading(true);
        signIn('google');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setGeneralError('');

        // Check Captcha (only if configured)
        const recaptchaEnabled = Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
        let captchaValue = null;
        let captchaAction: string | null = null;
        if (recaptchaEnabled) {
            if (!executeRecaptcha) {
                setErrors(prev => ({ ...prev, captcha: "Security check initializing, please wait..." }));
                return;
            }
            captchaValue = await executeRecaptcha('login');
            captchaAction = 'login';
            if (!captchaValue) {
                setErrors(prev => ({ ...prev, captcha: "Security check failed. Please try again." }));
                return;
            }
        }

        // Full validation before submit
        const result = loginSchema.safeParse(formData);
        if (!result.success) {
            const newErrors: any = {};
            result.error.issues.forEach(issue => {
                newErrors[issue.path[0]] = issue.message;
            });
            setErrors(newErrors);
            return;
        }

        setLoading(true);

        try {
            const res = await axios.post('http://localhost:8000/api/auth/login', {
                ...formData,
                captchaToken: captchaValue,
                captchaAction
            }, { withCredentials: true });

            const user = res.data.user;
            login(user);

            const returnTo = new URLSearchParams(window.location.search).get('returnTo');
            window.location.href = resolvePostLoginDestination(user, returnTo);

            onClose();
        } catch (err: any) {
            setGeneralError(err.response?.data?.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-8 overflow-hidden">
                {/* Decorative Background */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl" />

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="mb-8 text-center">
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
                        Welcome Back
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">Sign in to continue to VeriLnk</p>
                </div>

                {/* Google Login Button */}
                <div className="mb-6">
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={isGoogleLoading || loading}
                        className="active:scale-[0.98] transition-all w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGoogleLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Image
                                    src="https://www.google.com/favicon.ico"
                                    alt="Google"
                                    width={20}
                                    height={20}
                                    className="w-5 h-5"
                                />
                                Sign in with Google
                            </>
                        )}
                    </button>
                    {/* Divider */}
                    <div className="relative mt-6 flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                        </div>
                        <div className="relative bg-white dark:bg-slate-900 px-4">
                            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Or, sign in with email</span>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {generalError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center flex items-center justify-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {generalError}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Email Address</label>
                        <div className="relative">
                            <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${errors.email ? 'text-red-500' : 'text-slate-500'}`} />
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                className={`w-full bg-slate-50 dark:bg-slate-800/50 border rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 transition-all font-sans ${errors.email
                                    ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/50'
                                    : 'border-slate-200 dark:border-slate-700 focus:border-blue-500/50 focus:ring-blue-500/50'
                                    }`}
                                placeholder="name@example.com"
                            />
                        </div>
                        {errors.email && <p className="text-xs text-red-400 ml-1">{errors.email}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Password</label>
                        <div className="relative">
                            <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${errors.password ? 'text-red-500' : 'text-slate-500'}`} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                value={formData.password}
                                onChange={handleInputChange}
                                className={`w-full bg-slate-50 dark:bg-slate-800/50 border rounded-lg pl-10 pr-10 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 transition-all font-sans ${errors.password
                                    ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/50'
                                    : 'border-slate-200 dark:border-slate-700 focus:border-blue-500/50 focus:ring-blue-500/50'
                                    }`}
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {errors.password && <p className="text-xs text-red-400 ml-1">{errors.password}</p>}
                    </div>

                    {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !executeRecaptcha && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                            Security check initializing, please wait...
                        </div>
                    )}
                    {errors.captcha && <p className="text-xs text-red-400 text-center">{errors.captcha}</p>}

                    <button
                        type="submit"

                        disabled={loading || (Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) && !executeRecaptcha)}
                        className="w-full btn-primary font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
                    </button>
                </form>

                {/* Footer */}
                <div className="mt-4 text-center">
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                        Don&apos;t have an account?{' '}
                        <button
                            onClick={onSwitchToSignup}
                            className="text-blue-400 hover:text-blue-300 font-medium transition-colors focus:outline-none"
                        >
                            Create account
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}
