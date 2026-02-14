import type { Metadata } from 'next';
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
    return <PricingClient />;
}
