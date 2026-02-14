import { fetchCountries, fetchCategories, searchSites } from '@/lib/api';
import SiteCard from '@/components/shared/SiteCard';
import Pagination from '@/components/common/Pagination';
// import CategoryGrid from '@/components/home/CategoryGrid'; // Reusing or distinct? Maybe simple list for filters.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

// Generate metadata dynamically
export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }): Promise<Metadata> {
    const resolvedParams = await params;
    const iso = resolvedParams.iso.toUpperCase();
    const countries = await fetchCountries();
    const country = countries.find((c: { code: string, name: string }) => c.code === iso);

    if (!country) return { title: 'Country Not Found' };

    return {
        title: `Verified Official Sites in ${country.name} - VeriLnK`,
        description: `Browse verified official government and education websites in ${country.name}.`,
    };
}

export default async function CountryPage({
    params,
    searchParams,
}: {
    params: Promise<{ iso: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;

    const iso = resolvedParams.iso.toUpperCase();
    const page = Number(resolvedSearchParams.page) || 1;
    const categoryId = resolvedSearchParams.category as string;
    const query = resolvedSearchParams.q as string;

    // Fetch initial data
    const [countries, categories] = await Promise.all([
        fetchCountries(),
        fetchCategories(),
    ]);

    const country = countries.find((c: { code: string, id: string, name: string }) => c.code === iso);

    if (!country) {
        notFound();
    }

    // Fetch sites for this country
    const sitesData = await searchSites({
        country: country.id,
        category: categoryId,
        q: query,
        page,
        limit: 20,
    });

    return (
        <div className="min-h-screen text-slate-900 dark:text-white pb-20">
            {/* Header */}
            <div className="surface-card border-b border-[var(--app-border)] shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <Link href="/" className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 mb-6 transition-colors">&larr; Back to Home</Link>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <span className="text-4xl">{/* Flag emoji could go here if mapped */}</span>
                        Official Sites in {country.name}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        Found {sitesData.total} verified resources
                    </p>
                </div>
            </div>
            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Sidebar Filters */}
                    <aside className="lg:col-span-1">
                        <div className="surface-card rounded-xl p-6 shadow-sm sticky top-4">
                            <h3 className="font-semibold mb-4 text-lg">Categories</h3>
                            <div className="space-y-2">
                                <Link
                                    href={`/country/${iso}`}
                                    className={`block px-3 py-2 rounded-lg text-sm transition-colors ${!categoryId ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                >
                                    All Categories
                                </Link>
                                {categories.map((cat: { id: string; name: string }) => (
                                    <Link
                                        key={cat.id}
                                        href={`/country/${iso}?category=${cat.id}`}
                                        className={`block px-3 py-2 rounded-lg text-sm transition-colors ${categoryId === cat.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                    >
                                        {cat.name}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </aside>

                    {/* Main Content */}
                    <main className="lg:col-span-3">
                        {sitesData.hits.length > 0 ? (
                            <div className="space-y-4">
                                { }
                                {sitesData.hits.map((site: { id: string; name: string; url: string; category?: { name: string }; description?: string; verification?: string }) => (
                                    <SiteCard key={site.id} site={site} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20 surface-card rounded-xl border-dashed border-[var(--app-border)]">
                                <p className="text-lg text-slate-500">No sites found for this filter.</p>
                            </div>
                        )}

                        <Pagination total={sitesData.total} limit={20} />
                    </main>
                </div>
            </div>
        </div>
    );
}
