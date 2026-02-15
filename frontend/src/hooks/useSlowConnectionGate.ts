'use client';

import { useEffect, useState } from 'react';

type UseSlowConnectionGateOptions = {
    isLoading: boolean;
    isOffline: boolean;
    hasFailure: boolean;
    maxLoadingMs: number;
    isAborted?: boolean;
};

type UseSlowConnectionGateResult = {
    showOverlay: boolean;
    mode: 'slow' | 'offline' | null;
};

export function useSlowConnectionGate({
    isLoading,
    isOffline,
    hasFailure,
    maxLoadingMs,
    isAborted = false
}: UseSlowConnectionGateOptions): UseSlowConnectionGateResult {
    const [isStuckLoading, setIsStuckLoading] = useState(false);
    const [hadLoadingCycle, setHadLoadingCycle] = useState(false);

    useEffect(() => {
        if (!isLoading) {
            setIsStuckLoading(false);
            return;
        }

        setHadLoadingCycle(true);
        setIsStuckLoading(false);
        const timer = setTimeout(() => {
            setIsStuckLoading(true);
        }, maxLoadingMs);

        return () => clearTimeout(timer);
    }, [isLoading, maxLoadingMs]);

    useEffect(() => {
        if (!isLoading && !hasFailure) {
            setHadLoadingCycle(false);
        }
    }, [isLoading, hasFailure]);

    const showOverlay = !isAborted && (
        (isLoading && isStuckLoading) ||
        (!isLoading && hadLoadingCycle && hasFailure)
    );

    if (!showOverlay) {
        return {
            showOverlay: false,
            mode: null
        };
    }

    return {
        showOverlay: true,
        mode: isOffline ? 'offline' : 'slow'
    };
}
