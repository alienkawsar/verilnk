'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ToastProvider } from '@/components/ui/Toast';
import { logoutAdmin, fetchAdminMe } from '@/lib/api';

export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    const [user, setUser] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setMounted(true);

        // Skip auth check on login page
        if (pathname === '/admin/login') {
            setLoading(false);
            return;
        }

        const checkAuth = async () => {
            try {
                const data = await fetchAdminMe();
                if (!['SUPER_ADMIN', 'MODERATOR', 'VERIFIER'].includes(data.user.role)) {
                    await logoutAdmin();
                    router.push('/admin/login');
                    return;
                }
                setUser(data.user);
            } catch (error) {
                console.error('Auth verification failed', error);
                router.push('/admin/login');
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, [pathname, router]);

    if (!mounted) return null;

    if (loading && pathname !== '/admin/login') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full border-4 border-slate-700 border-t-blue-500 h-12 w-12"></div>
            </div>
        );
    }

    if (!mounted) return null;

    if (pathname === '/admin/login') {
        return <>{children}</>;
    }

    return (
        <ToastProvider>
            <div className="min-h-screen">
                {children}
            </div>
        </ToastProvider>
    );
}
