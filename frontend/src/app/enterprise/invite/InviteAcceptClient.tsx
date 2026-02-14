'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { acceptWorkspaceInvite } from '@/lib/enterprise-api';

export default function InviteAcceptClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
    const missingToken = !token;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [acceptedWorkspaceId, setAcceptedWorkspaceId] = useState<string | null>(null);

    const handleAccept = async () => {
        if (!token) {
            setError('Invite token is missing');
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const result = await acceptWorkspaceInvite(token);
            setAcceptedWorkspaceId((result.member as any).workspaceId || null);
        } catch (err: any) {
            setError(err.message || 'Failed to accept invite');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Navbar />
            <main className="min-h-screen pt-24 pb-16 bg-slate-50 dark:bg-slate-950">
                <div className="container mx-auto px-4">
                    <div className="max-w-md mx-auto surface-card rounded-xl p-6 mt-10">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Enterprise Invite</h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                            Accept this invite to join the workspace.
                        </p>

                        {(error || missingToken) && (
                            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                                <div className="flex items-center gap-2">
                                    <XCircle className="w-4 h-4" />
                                    {error || 'Invite token is missing'}
                                </div>
                            </div>
                        )}

                        {acceptedWorkspaceId ? (
                            <div className="space-y-4">
                                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Invite accepted successfully.
                                    </div>
                                </div>
                                <button
                                    onClick={() => router.push(`/enterprise/${acceptedWorkspaceId}`)}
                                    className="w-full px-4 py-2.5 btn-primary rounded-lg font-medium"
                                >
                                    Open Workspace
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleAccept}
                                disabled={loading || missingToken}
                                className="w-full px-4 py-2.5 btn-primary rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Accepting...
                                    </>
                                ) : (
                                    'Accept Invite'
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}
