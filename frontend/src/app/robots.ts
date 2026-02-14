import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.NODE_ENV === 'production' ? 'https://verilnk.com' : 'http://localhost:3000');
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/admin', '/dashboard', '/api', '/org/dashboard', '/org/upgrade', '/auth'],
        },
        sitemap: `${siteUrl}/sitemap.xml`,
    };
}
