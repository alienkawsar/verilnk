import { Suspense } from 'react';
import Navbar from '@/components/layout/Navbar';
import InviteAcceptClient from './InviteAcceptClient';

export const dynamic = 'force-dynamic';

function InviteSkeleton() {
    return (
        <>
            <Navbar />
            <main className="min-h-screen pt-24 pb-16 bg-slate-50 dark:bg-slate-950">
                <div className="container mx-auto px-4">
                    <div className="max-w-md mx-auto surface-card rounded-xl p-6 mt-10">
                        <div className="h-7 w-48 rounded bg-slate-200 dark:bg-slate-800 animate-pulse mb-3" />
                        <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse mb-2" />
                        <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse mb-6" />
                        <div className="h-10 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                    </div>
                </div>
            </main>
        </>
    );
}

export default function EnterpriseInvitePage() {
    return (
        <Suspense fallback={<InviteSkeleton />}>
            <InviteAcceptClient />
        </Suspense>
    );
}
