'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-4">
            <div className="text-center space-y-6 max-w-md mx-auto">
                <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="w-10 h-10 text-red-500 dark:text-red-400" />
                </div>

                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                    Something went wrong!
                </h2>

                <p className="text-slate-500 dark:text-slate-400">
                    We apologize for the inconvenience. An unexpected error has occurred.
                    Our team has been notified.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                    <button
                        onClick={() => reset()}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        Try Again
                    </button>

                    <Link
                        href="/"
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors font-medium border border-slate-200 dark:border-slate-700"
                    >
                        <Home className="w-4 h-4" />
                        Go Home
                    </Link>
                </div>

                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-8 p-4 bg-slate-100 dark:bg-slate-900 rounded-lg text-left overflow-auto max-h-48 text-xs font-mono border border-slate-200 dark:border-slate-800">
                        <p className="font-bold text-red-500 mb-2">Error Details:</p>
                        <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">
                            {error.message || 'Unknown error'}
                        </p>
                        {error.digest && (
                            <p className="mt-2 text-slate-400">Digest: {error.digest}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
