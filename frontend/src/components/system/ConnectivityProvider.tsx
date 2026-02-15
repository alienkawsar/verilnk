'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import NetworkStateNotice from '@/components/shared/NetworkStateNotice';
import { useSlowConnectionGate } from '@/hooks/useSlowConnectionGate';
import {
    CONNECTIVITY_MAX_LOADING_MS,
    getConnectivityState,
    isConnectivityRouteTracked,
    runConnectivityRetry,
    setConnectivityOffline,
    subscribeConnectivity
} from '@/lib/connectivity-tracker';

type ConnectivityProviderProps = {
    children: React.ReactNode;
};

export default function ConnectivityProvider({ children }: ConnectivityProviderProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { showToast } = useToast();

    const [state, setState] = useState(getConnectivityState);
    const [retrying, setRetrying] = useState(false);

    useEffect(() => subscribeConnectivity(setState), []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setConnectivityOffline(!window.navigator.onLine);

        const onOffline = () => setConnectivityOffline(true);
        const onOnline = () => setConnectivityOffline(false);

        window.addEventListener('offline', onOffline);
        window.addEventListener('online', onOnline);
        return () => {
            window.removeEventListener('offline', onOffline);
            window.removeEventListener('online', onOnline);
        };
    }, []);

    const trackedRoute = useMemo(() => isConnectivityRouteTracked(pathname), [pathname]);
    const hasPendingRequests = state.activeTrackedRequests > 0;
    const { showOverlay, mode } = useSlowConnectionGate({
        isLoading: hasPendingRequests,
        isOffline: state.isOffline,
        hasFailure: state.hasFailure,
        maxLoadingMs: CONNECTIVITY_MAX_LOADING_MS
    });
    const shouldRenderOverlay = trackedRoute && showOverlay;

    const handleRetry = useCallback(async () => {
        try {
            setRetrying(true);
            const success = await runConnectivityRetry(() => router.refresh());
            if (!success) {
                showToast('Still unable to connect. Check your internet and retry.', 'error');
            }
        } finally {
            setRetrying(false);
        }
    }, [router, showToast]);

    return (
        <>
            {children}

            {shouldRenderOverlay && (
                <div className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-sm flex items-center justify-center p-4">
                    <NetworkStateNotice
                        mode={mode === 'offline' ? 'offline' : 'slow'}
                        onRetry={handleRetry}
                        isRetrying={retrying}
                        showRefresh
                    />
                </div>
            )}
        </>
    );
}
