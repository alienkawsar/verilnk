import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchCategoryBySlug, fetchCountries, fetchSites } from '@/lib/api';

const getBaseUrl = () => {
    return process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.NODE_ENV === 'production' ? 'https://verilnk.com' : 'http://localhost:3000');
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const resolvedParams = await params;
    const category = await fetchCategoryBySlug(resolvedParams.slug);

    if (!category || category.isActive === false) {
        return { title: 'Category Not Found | VeriLnk' };
    }

    const description = category.description?.trim().slice(0, 160) ||
        `Browse verified ${category.name} resources curated by VeriLnk.`;

    const baseUrl = getBaseUrl();
    return {
        title: `${category.name} | VeriLnk`,
        description,
        alternates: {
            canonical: `${baseUrl}/categories/${category.slug}`
        },
        openGraph: {
            title: `${category.name} | VeriLnk`,
            description,
            url: `${baseUrl}/categories/${category.slug}`
        }
    };
}

export default async function CategoryLandingPage({ params }: { params: Promise<{ slug: string }> }) {
    const resolvedParams = await params;
    const category = await fetchCategoryBySlug(resolvedParams.slug);

    if (!category || category.isActive === false) {
        notFound();
    }

    const sites = await fetchSites({ categoryId: category.id, status: 'SUCCESS' });
    const countries = await fetchCountries();

    const countryMap = new Map<string, { code: string; name: string }>();
    for (const site of sites) {
        if (site.country?.code && site.country?.name) {
            countryMap.set(site.country.code, { code: site.country.code, name: site.country.name });
        }
    }

    const countriesWithCategory = countries.filter((country: { code: string }) => countryMap.has(country.code));

    const baseUrl = getBaseUrl();
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": category.name,
        "description": category.description || undefined,
        "url": `${baseUrl}/categories/${category.slug}`
    };

    return (
        <div className="min-h-screen text-slate-900 dark:text-white pb-20">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            {/* Header */}
            <div className="surface-card border-b border-[var(--app-border)] shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <Link href="/" className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 mb-6 transition-colors">
                        &larr; Back to Home
                    </Link>
                    <h1 className="text-3xl font-bold">{category.name}</h1>
                    {category.description && (
                        <p className="text-slate-600 dark:text-slate-300 mt-3 max-w-3xl">
                            {category.description}
                        </p>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {countriesWithCategory.length > 0 ? (
                    <div className="surface-card rounded-2xl p-6">
                        <h2 className="text-lg font-semibold mb-4">Browse by Country</h2>
                        <div className="flex flex-wrap gap-3">
                            {countriesWithCategory.map((country: { code: string; name: string }) => (
                                <Link
                                    key={country.code}
                                    href={`/country/${country.code}/categories/${category.slug}`}
                                    className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                                >
                                    {country.name}
                                </Link>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="surface-card border-dashed border-[var(--app-border)] rounded-2xl p-8 text-center text-[var(--app-text-secondary)]">
                        No verified sites are available for this category yet.
                    </div>
                )}
            </div>
        </div>
    );
}
