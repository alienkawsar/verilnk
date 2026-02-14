
import { MetadataRoute } from 'next';

// Minimal static sitemap for now. 
// Ideally we fetch dynamic countries/categories here.
// But for safety and avoiding build-time fetch complexity without verified environment variables, 
// we start with static pages.

type OrgSitemapEntry = {
    id: string;
    updatedAt?: string;
    name?: string;
    countryCode?: string;
};

const fetchOrgSitemapEntries = async (): Promise<OrgSitemapEntry[]> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
    const apiBase = apiUrl.startsWith('http') ? apiUrl : `http://localhost:8000${apiUrl}`;
    try {
        const res = await fetch(`${apiBase}/organizations/public-sitemap`, { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return data?.entries || [];
    } catch {
        return [];
    }
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.NODE_ENV === 'production' ? 'https://verilnk.com' : 'http://localhost:3000');

    const staticRoutes = [
        '',
        '/verification-process',
        '/about',
        '/privacy',
        '/terms',
        '/contact',
        '/pricing'
    ].map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: route === '' ? 1.0 : 0.8,
    }));

    const orgEntries = await fetchOrgSitemapEntries();
    const orgRoutes = orgEntries.map((org) => ({
        url: `${baseUrl}/org/${org.id}`,
        lastModified: org.updatedAt ? new Date(org.updatedAt) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
    }));

    return [...staticRoutes, ...orgRoutes];
}
