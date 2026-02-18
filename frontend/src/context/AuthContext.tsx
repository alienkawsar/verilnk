"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { usePathname, useRouter } from 'next/navigation';
import {
    buildForcePasswordChangeRoute,
    getDefaultPostLoginRoute,
    sanitizeReturnTo
} from '@/lib/auth-redirect';

interface User {
    id: string;
    name: string;
    email: string;
    country?: string;
    firstName?: string;
    lastName?: string;
    description?: string;
    profileImage?: string;
    organizationId?: string | null;
    planType?: string;
    role?: string;
    isRestricted?: boolean;
    dailyRequestLimit?: number | null;
    requestLimit?: number | null;
    requestLimitWindow?: number;
    used?: number;
    remaining?: number | null;
    mustChangePassword?: boolean;
}

interface SessionInfo {
    exp?: number;
    iat?: number;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    session: SessionInfo | null;
    login: (userData: User) => void;
    logout: () => void;
    checkAuth: () => Promise<void>;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const JUST_LOGGED_OUT_FLAG = 'verilnk_just_logged_out';


export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<SessionInfo | null>(null);
    const router = useRouter();
    const pathname = usePathname();

    const checkAuth = async () => {
        const currentPath = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');

        if (currentPath.startsWith('/admin')) {
            setUser(null);
            setSession(null);
            setLoading(false);
            return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

        const fetchSession = async (endpoint: string) => {
            try {
                const res = await axios.get(`${apiUrl}${endpoint}`, { withCredentials: true });
                return res.data;
            } catch (error) {
                return null;
            }
        };

        try {
            // 1. Try Org Session (Preferred if available)
            let data = await fetchSession('/auth/org/me');

            // 2. If no Org session, try User Session
            if (!data) {
                data = await fetchSession('/auth/user/me');
            }

            if (data?.user) {
                setUser(data.user);
                setSession(data.session || null);

                // Forced Password Change Redirect
                if (data.user.mustChangePassword && window.location.pathname !== '/auth/change-password') {
                    const searchParams = new URLSearchParams(window.location.search);
                    const queryReturnTo = sanitizeReturnTo(searchParams.get('returnTo'));
                    const currentPathWithQuery = `${window.location.pathname}${window.location.search || ''}`;
                    const currentPathReturnTo = sanitizeReturnTo(currentPathWithQuery);
                    const fallbackReturnTo = getDefaultPostLoginRoute(data.user);
                    const returnToTarget = queryReturnTo || currentPathReturnTo || fallbackReturnTo;

                    window.location.href = buildForcePasswordChangeRoute(returnToTarget);
                    return;
                }
            } else {
                // No public session found (Admin session ignored here)
                setUser(null);
                setSession(null);
            }
        } catch (error) {
            setUser(null);
            setSession(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        checkAuth();
    }, [pathname]);

    const login = (userData: User) => {
        setUser(userData);
        checkAuth();
    };

    const logout = async () => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
            await axios.post(`${apiUrl}/auth/logout`, {}, { withCredentials: true });
            setUser(null);
            setSession(null);
            if (typeof window !== 'undefined') {
                sessionStorage.setItem(JUST_LOGGED_OUT_FLAG, String(Date.now()));
            }
            router.replace('/');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const refresh = async () => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
            const res = await axios.post(`${apiUrl}/auth/refresh`, {}, { withCredentials: true });
            if (res.data?.session) {
                setSession(res.data.session);
                return;
            }
            throw new Error('Session refresh failed');
        } catch (error) {
            console.error('Session refresh failed', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, session, login, logout, checkAuth, refresh }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
