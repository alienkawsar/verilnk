'use client';

import Image from 'next/image';
import { Loader2, RotateCw } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

type NetworkStateNoticeProps = {
    mode: 'slow' | 'offline';
    title?: string;
    description?: string;
    onRetry?: () => void | Promise<void>;
    showRefresh?: boolean;
    isRetrying?: boolean;
};

export default function NetworkStateNotice({
    mode,
    title,
    description,
    onRetry,
    showRefresh = true,
    isRetrying = false
}: NetworkStateNoticeProps) {
    const { resolvedTheme } = useTheme();

    const imageSrc = resolvedTheme === 'dark'
        ? '/CONNECTION_LOST_DARK.png'
        : '/CONNECTION_LOST_LIGHT.png';

    const resolvedTitle = title || (mode === 'offline' ? 'Connection lost' : 'Connection is slow');
    const resolvedDescription = description || (
        mode === 'offline'
            ? 'You’re offline. Check your connection and try again.'
            : 'Still loading. This may take a bit longer than usual.'
    );

    const handleRetry = () => {
        if (onRetry) {
            onRetry();
            return;
        }
        window.location.reload();
    };

    return (
        <div className="surface-card w-full max-w-md rounded-2xl border border-[var(--app-border)] px-5 py-6 shadow-2xl backdrop-blur-md">
            <div className="mx-auto w-[148px] h-[112px] relative">
                <Image
                    src={imageSrc}
                    alt={mode === 'offline' ? 'Connection lost' : 'Connection is slow'}
                    fill
                    className="object-contain"
                    priority
                />
            </div>

            <h3 className="mt-4 text-center text-lg font-semibold text-[var(--app-text-primary)]">
                {resolvedTitle}
            </h3>
            <p className="mt-2 text-center text-sm text-[var(--app-text-secondary)]">
                {resolvedDescription}
            </p>

            <div className="mt-5 flex items-center justify-center gap-2">
                <button
                    type="button"
                    onClick={handleRetry}
                    disabled={isRetrying}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-[var(--btn-primary)] hover:bg-[var(--btn-secondary)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                    Retry
                </button>

                {showRefresh && (
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] transition-colors"
                    >
                        Refresh
                    </button>
                )}
            </div>
        </div>
    );
}
