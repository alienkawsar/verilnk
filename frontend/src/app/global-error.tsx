'use client';

import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body className="text-slate-900 dark:text-white">
                <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="text-center space-y-6 max-w-md mx-auto">
                        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle className="w-10 h-10 text-red-500 dark:text-red-400" />
                        </div>

                        <h2 className="text-3xl font-bold">Critical Error</h2>
                        <p className="text-slate-500 dark:text-slate-400">
                            A critical system error occurred. Please try refreshing the page.
                        </p>

                        <button
                            onClick={() => reset()}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium mt-4"
                        >
                            Refresh Application
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
