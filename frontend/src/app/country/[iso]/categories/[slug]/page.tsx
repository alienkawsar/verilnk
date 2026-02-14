import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteCard from '@/components/shared/SiteCard';
import { fetchCategoryBySlug, fetchCountries, fetchSites, fetchStates } from '@/lib/api';

const getBaseUrl = () => {
    return process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.NODE_ENV === 'production' ? 'https://verilnk.com' : 'http://localhost:3000');
};

export async function generateMetadata({
    params
}: {
    params: Promise<{ iso: string; slug: string }>;
}): Promise<Metadata> {
    const resolvedParams = await params;
    const iso = resolvedParams.iso.toUpperCase();
    const category = await fetchCategoryBySlug(resolvedParams.slug);
    const countries = await fetchCountries();
    const country = countries.find((c: { code: string }) => c.code === iso);

    if (!category || category.isActive === false || !country) {
        return { title: 'Category Not Found | VeriLnk' };
    }

    const description = category.description?.trim().slice(0, 160) ||
        `Browse verified ${category.name} resources in ${country.code}.`;
    const baseUrl = getBaseUrl();

    return {
        title: `${category.name} in ${country.code} | VeriLnk`,
        description,
        alternates: {
            canonical: `${baseUrl}/country/${country.code}/categories/${category.slug}`
        },
        openGraph: {
            title: `${category.name} in ${country.code} | VeriLnk`,
            description,
            url: `${baseUrl}/country/${country.code}/categories/${category.slug}`
        }
    };
}

export default async function CountryCategoryPage({
    params,
    searchParams
}: {
    params: Promise<{ iso: string; slug: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;

    const iso = resolvedParams.iso.toUpperCase();
    const category = await fetchCategoryBySlug(resolvedParams.slug);
    const countries = await fetchCountries();
    const country = countries.find((c: { code: string; id: string; name: string }) => c.code === iso);

    if (!category || category.isActive === false || !country) {
        notFound();
    }

    const stateId = typeof resolvedSearchParams.stateId === 'string' ? resolvedSearchParams.stateId : undefined;
    const states = await fetchStates(country.id);

    const sites = await fetchSites({
        countryId: country.id,
        categoryId: category.id,
        stateId,
        status: 'SUCCESS'
    });

    const baseUrl = getBaseUrl();
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": `${category.name} in ${country.name}`,
        "url": `${baseUrl}/country/${country.code}/categories/${category.slug}`,
        "isPartOf": {
            "@type": "WebSite",
            "name": "VeriLnk",
            "url": baseUrl
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white pb-20">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <div className="surface-card border-b border-[var(--app-border)]">
                <div className="container mx-auto px-4 py-8">
                    <Link href={`/country/${country.code}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block">
                        &larr; Back to {country.name}
                    </Link>
                    <h1 className="text-3xl font-bold">
                        {category.name} in {country.name}
                    </h1>
                    {category.description && (
                        <p className="text-slate-600 dark:text-slate-300 mt-2 max-w-3xl">
                            {category.description}
                        </p>
                    )}
                </div>
            </div>

            <div className="container mx-auto px-4 py-10 space-y-6">
                {states.length > 0 && (
                    <form
                        method="get"
                        action={`/country/${country.code}/categories/${category.slug}`}
                        className="flex flex-wrap gap-3 items-end surface-card rounded-2xl p-4"
                    >
                        <div className="flex flex-col gap-2">
                            <label className="text-sm text-slate-500">Filter by state</label>
                            <select
                                name="stateId"
                                defaultValue={stateId || ''}
                                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
                            >
                                <option value="">All states</option>
                                {states.map((state: { id: string; name: string }) => (
                                    <option key={state.id} value={state.id}>{state.name}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
                        >
                            Apply
                        </button>
                    </form>
                )}

                {sites.length > 0 ? (
                    <div className="space-y-4">
                        {sites.map((site: { id: string; name: string; url: string; category?: { name: string } }) => (
                            <SiteCard key={site.id} site={site} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 surface-card rounded-xl border-dashed border-[var(--app-border)]">
                        <p className="text-lg text-slate-500">No verified sites found for this filter.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
