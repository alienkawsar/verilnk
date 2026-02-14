'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const ADMIN_ROLES = ['SUPER_ADMIN', 'MODERATOR', 'VERIFIER'];

export default function SessionMonitor() {
    const { user, session, logout, checkAuth, refresh } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [warningLevel, setWarningLevel] = useState<'first' | 'final' | null>(null);
    const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

    const accountType = useMemo(() => {
        if (!user) return 'anonymous';
        if (user.role && ADMIN_ROLES.includes(user.role)) return 'admin';
        if (user.organizationId) return 'org';
        return 'user';
    }, [user]);

    useEffect(() => {
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
        setWarningLevel(null);

        if (!user || !session?.exp) return;
        if (pathname === '/admin/login') return;

        const now = Date.now();
        const expMs = session.exp * 1000;
        const timeLeft = expMs - now;
        if (timeLeft <= 0) {
            handleExpire();
            return;
        }

        const thresholds = accountType === 'admin' || accountType === 'org'
            ? { first: 10 * 60 * 1000, final: 2 * 60 * 1000 }
            : { first: 15 * 60 * 1000, final: 5 * 60 * 1000 };

        if (timeLeft <= thresholds.final) {
            setWarningLevel('final');
        } else if (timeLeft <= thresholds.first) {
            setWarningLevel('first');
        } else {
            timeoutsRef.current.push(setTimeout(() => setWarningLevel('first'), timeLeft - thresholds.first));
        }
        timeoutsRef.current.push(setTimeout(() => setWarningLevel('final'), Math.max(timeLeft - thresholds.final, 0)));
        timeoutsRef.current.push(setTimeout(handleExpire, Math.max(timeLeft, 0)));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, session?.exp, accountType, pathname]);

    const handleExpire = async () => {
        await logout();
        if (accountType === 'admin') {
            router.replace('/admin/login');
        }
    };

    const handleStaySignedIn = async () => {
        try {
            await refresh();
            await checkAuth();
            setWarningLevel(null);
        } catch {
            await handleExpire();
        }
    };

    const handleLogoutNow = async () => {
        await logout();
        if (accountType === 'admin') {
            router.replace('/admin/login');
        }
    };

    if (!warningLevel || accountType === 'anonymous') return null;

    const isFinal = warningLevel === 'final';

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[min(640px,92vw)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/90 dark:bg-slate-900/80 backdrop-blur-md px-4 py-3 shadow-lg">
                <div className="text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">Session expiring</span>{' '}
                    <span className="text-slate-500 dark:text-slate-400">
                        {isFinal ? 'in a few minutes.' : 'soon.'}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleLogoutNow}
                        className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-white/10 transition-colors"
                    >
                        Logout now
                    </button>
                    <button
                        onClick={handleStaySignedIn}
                        className="px-3 py-2 text-sm rounded-lg btn-primary transition-colors"
                    >
                        Stay signed in
                    </button>
                </div>
            </div>
        </div>
    );
}
