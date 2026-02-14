import type { Metadata } from 'next';
import OrgProfileClient from './OrgProfileClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type OrgPublic = {
    id: string;
    name: string;
    website?: string;
    address?: string;
    phone?: string;
    email?: string;
    country?: { name?: string; code?: string };
    state?: { name?: string };
    category?: { name?: string };
    isVerified?: boolean;
    type?: string;
    about?: string;
    logo?: string;
};

const getApiBase = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
    if (apiUrl.startsWith('http')) return apiUrl;
    return `http://localhost:8000${apiUrl}`;
};

const fetchPublicOrg = async (id: string): Promise<OrgPublic | null> => {
    try {
        const res = await fetch(`${getApiBase()}/organizations/${id}/public`, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const resolvedParams = await params;
    const org = await fetchPublicOrg(resolvedParams.id);
    const trimmedAbout = org?.about ? org.about.trim().slice(0, 160) : '';
    const description = org?.name
        ? (trimmedAbout || `View verified details for ${org.name}${org?.country?.name ? ` in ${org.country.name}` : ''}.`)
        : 'Verified organization profile on VeriLnk.';

    if (!org) {
        return {
            title: { absolute: 'Organization Not Found | VeriLnk' },
            description: 'This organization is not available.',
            robots: { index: false, follow: false },
        };
    }

    return {
        title: { absolute: `${org.name} | VeriLnk` },
        description,
        alternates: {
            canonical: `/org/${resolvedParams.id}`,
        },
        openGraph: {
            title: `${org.name} | VeriLnk`,
            description,
            type: 'website',
        },
        twitter: {
            title: `${org.name} | VeriLnk`,
            description,
        }
    };
}

export default async function OrgProfilePage({ params }: { params: { id: string } }) {
    const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.NODE_ENV === 'production' ? 'https://verilnk.com' : 'http://localhost:3000');
    const resolvedParams = await params;
    const org = await fetchPublicOrg(resolvedParams.id);

    const jsonLd = org ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": org.name,
        "url": org.website || `${siteUrl}/org/${org.id}`,
        "logo": org.logo || undefined,
        "description": org.about || undefined,
        "address": org.address ? {
            "@type": "PostalAddress",
            "streetAddress": org.address,
            "addressCountry": org.country?.code || org.country?.name
        } : undefined
    }) : null;

    return (
        <>
            <OrgProfileClient initialData={org} />
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: jsonLd }}
                />
            )}
        </>
    );
}
