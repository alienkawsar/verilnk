import type { Metadata } from 'next';
import { Suspense } from 'react';
import PricingClient from './pricing-client';

export const metadata: Metadata = {
    title: 'Pricing',
    description: 'Compare VeriLnk plans and choose the right level of verification, analytics, and visibility for your organization.',
    alternates: {
        canonical: '/pricing',
    },
    openGraph: {
        title: 'Pricing | VeriLnk',
        description: 'Compare VeriLnk plans and choose the right level of verification, analytics, and visibility for your organization.',
        type: 'website',
    },
    twitter: {
        title: 'Pricing | VeriLnk',
        description: 'Compare VeriLnk plans and choose the right level of verification, analytics, and visibility for your organization.',
    }
};

export default function PricingPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-900" />}>
            <PricingClient />
        </Suspense>
    );
}
