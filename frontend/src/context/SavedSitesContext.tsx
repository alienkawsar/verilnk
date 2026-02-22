'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { fetchMySavedSiteIds, saveMySite, unsaveMySite } from '@/lib/api';

interface SavedSitesContextValue {
    savedSiteIds: ReadonlySet<string>;
    loading: boolean;
    isHydrated: boolean;
    isSaved: (siteId: string) => boolean;
    isUpdating: (siteId: string) => boolean;
    toggle: (siteId: string) => Promise<boolean>;
    refresh: () => Promise<void>;
}

const SavedSitesContext = createContext<SavedSitesContextValue | undefined>(undefined);

const toSet = (values: string[]) => new Set(values.filter(Boolean));

export function SavedSitesProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [savedSiteIds, setSavedSiteIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
    const [updatingSiteIds, setUpdatingSiteIds] = useState<Set<string>>(new Set());
    const activeUserIdRef = useRef<string | null>(null);
    const savedSiteIdsRef = useRef<Set<string>>(new Set());
    const updatingSiteIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        activeUserIdRef.current = user?.id ?? null;
    }, [user?.id]);

    useEffect(() => {
        savedSiteIdsRef.current = savedSiteIds;
    }, [savedSiteIds]);

    useEffect(() => {
        updatingSiteIdsRef.current = updatingSiteIds;
    }, [updatingSiteIds]);

    const loadSavedIds = useCallback(async (targetUserId: string) => {
        setLoading(true);
        try {
            const response = await fetchMySavedSiteIds();
            if (activeUserIdRef.current !== targetUserId) return;
            setSavedSiteIds(toSet(response.siteIds || []));
            setHydratedUserId(targetUserId);
        } catch (error: any) {
            if (activeUserIdRef.current !== targetUserId) return;
            setSavedSiteIds(new Set());
            setHydratedUserId(targetUserId);
            if (error?.response?.status !== 401) {
                showToast('Failed to load saved sites', 'error');
            }
        } finally {
            if (activeUserIdRef.current === targetUserId) {
                setLoading(false);
            }
        }
    }, [showToast]);

    useEffect(() => {
        const userId = user?.id;
        if (!userId) {
            setSavedSiteIds(new Set());
            setUpdatingSiteIds(new Set());
            setHydratedUserId(null);
            setLoading(false);
            return;
        }

        setHydratedUserId(null);
        void loadSavedIds(userId);
    }, [user?.id, loadSavedIds]);

    const refresh = useCallback(async () => {
        const userId = activeUserIdRef.current;
        if (!userId) {
            setSavedSiteIds(new Set());
            setUpdatingSiteIds(new Set());
            setHydratedUserId(null);
            setLoading(false);
            return;
        }
        await loadSavedIds(userId);
    }, [loadSavedIds]);

    const isSaved = useCallback((siteId: string) => savedSiteIds.has(siteId), [savedSiteIds]);
    const isUpdating = useCallback((siteId: string) => updatingSiteIds.has(siteId), [updatingSiteIds]);

    const toggle = useCallback(async (siteId: string): Promise<boolean> => {
        const userId = activeUserIdRef.current;
        if (!userId) {
            return false;
        }
        if (updatingSiteIdsRef.current.has(siteId)) {
            return savedSiteIdsRef.current.has(siteId);
        }

        const wasSaved = savedSiteIdsRef.current.has(siteId);
        setUpdatingSiteIds((prev) => {
            const next = new Set(prev);
            next.add(siteId);
            return next;
        });
        setSavedSiteIds((prev) => {
            const next = new Set(prev);
            if (wasSaved) {
                next.delete(siteId);
            } else {
                next.add(siteId);
            }
            return next;
        });

        try {
            if (wasSaved) {
                await unsaveMySite(siteId);
                return false;
            }
            await saveMySite(siteId);
            return true;
        } catch (error: any) {
            setSavedSiteIds((prev) => {
                const next = new Set(prev);
                if (wasSaved) {
                    next.add(siteId);
                } else {
                    next.delete(siteId);
                }
                return next;
            });

            if (error?.response?.status === 404) {
                showToast('Site not found', 'error');
            } else if (error?.response?.status === 401) {
                showToast('Sign in to save sites', 'error');
            } else {
                showToast(wasSaved ? 'Failed to remove saved site' : 'Failed to save site', 'error');
            }

            return wasSaved;
        } finally {
            setUpdatingSiteIds((prev) => {
                const next = new Set(prev);
                next.delete(siteId);
                return next;
            });
        }
    }, [showToast]);

    const value = useMemo<SavedSitesContextValue>(() => ({
        savedSiteIds,
        loading,
        isHydrated: !user?.id || hydratedUserId === user.id,
        isSaved,
        isUpdating,
        toggle,
        refresh
    }), [savedSiteIds, loading, user?.id, hydratedUserId, isSaved, isUpdating, toggle, refresh]);

    return (
        <SavedSitesContext.Provider value={value}>
            {children}
        </SavedSitesContext.Provider>
    );
}

export function useSavedSites() {
    const context = useContext(SavedSitesContext);
    if (!context) {
        throw new Error('useSavedSites must be used within a SavedSitesProvider');
    }
    return context;
}
