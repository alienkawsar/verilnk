import { Suspense } from 'react';
import { fetchCategories, searchSites } from '@/lib/api';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isGlobalCountryCode } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import Link from 'next/link';
import CategoryGrid from '@/components/home/CategoryGrid';
import { ArrowLeft } from 'lucide-react';
import SiteCard from '@/components/shared/SiteCard';
import Pagination from '@/components/common/Pagination';

export const metadata: Metadata = {
    title: 'Search',
    description: 'Search verified websites and official organizations by keyword and country.',
    alternates: {
        canonical: '/search',
    },
    robots: {
        index: false,
        follow: true,
    }
};

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; country?: string; state?: string; category?: string; page?: string }>;
}) {
    return (
        <main className="min-h-screen bg-app p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                <Link href="/" className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
                </Link>
                <Suspense fallback={<div className="text-center p-12 text-slate-500 dark:text-slate-400">Loading results...</div>}>
                    <SearchResults searchParams={searchParams} />
                </Suspense>
            </div>
        </main>
    );
}

interface Site {
    id: string;
    name: string;
    url: string;
    description?: string;
    country_name?: string;
    country?: { name: string };
    category_name?: string;
    category?: { name: string };
    verification?: string;
    status?: string;
    organization_id?: string | null;
    organization_public?: boolean;
    organizationId?: string | null;
    organizationPublic?: boolean;
}

interface SearchResponse {
    hits: Site[];
    total: number;
    exact?: Site[];
    categoryExpansion?: Site[];
    detectedCategory?: { id: string; name: string; slug: string };
    scope?: { countryIso?: string; stateCode?: string };
}

async function SearchResults({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; country?: string; state?: string; category?: string; page?: string }>;
}) {
    const { q, country, state, category, page } = await searchParams;
    const PAGE_LIMIT = 15;
    let pageNum = Number(page) || 1;
    if (pageNum < 1) pageNum = 1;
    const isGlobalSearch = isGlobalCountryCode(country);
    const effectiveState = isGlobalSearch ? undefined : state;

    let sites: Site[] = [];
    let total = 0;
    let exact: Site[] = [];
    let categoryExpansion: Site[] = [];
    let detectedCategory: { id: string; name: string; slug: string } | undefined;
    let scope: { countryIso?: string; stateCode?: string } | undefined;

    // STRICT: MeiliSearch ONLY. No database fallback.
    try {
        if (!country) {
            console.warn('Strict Search: No country provided. Returning empty.');
            sites = [];
        } else if (!q || q.length < 2) {
            console.log('Strict Search: Query too short. Returning empty.');
            sites = [];
        } else {
            console.log(`Strict Search: Querying Meilisearch for country=${country}, q=${q}`);
            const results = (await searchSites({
                q: q || '', // Empty query matches all in Meili if correctly configured (or we rely on filters)
                country,
                stateId: effectiveState,
                category,
                page: pageNum,
                limit: PAGE_LIMIT
            })) as SearchResponse;
            total = results.total || 0;
            const totalPages = total === 0 ? 0 : Math.ceil(total / PAGE_LIMIT);
            if (totalPages > 0 && pageNum > totalPages) {
                const params = new URLSearchParams();
                if (q) params.set('q', q);
                if (country) params.set('country', country);
                if (effectiveState) params.set('state', effectiveState);
                if (category) params.set('category', category);
                params.set('page', String(totalPages));
                redirect(`/search?${params.toString()}`);
            }
            sites = results.hits || [];
            exact = results.exact || [];
            categoryExpansion = results.categoryExpansion || [];
            detectedCategory = results.detectedCategory;
            scope = results.scope;
        }
    } catch (error) {
        console.error('Strict Search Failed:', error);
        sites = [];
    }

    // Fetch categories if we are in a country view (to show grid)
    let categories = [];
    if (country && !category && !q) {
        categories = await fetchCategories().catch(() => []);
    }

    // Retrieve names for header
    let headerTitle = 'All Sites';
    if (q) headerTitle = `Search Results for "${q}"`;
    else if (country && category) headerTitle = 'Sites in Category';
    else if (country) headerTitle = 'Sites in Country';
    else if (category) headerTitle = 'Sites in Category';

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-blue-600 dark:from-white dark:to-blue-200 capitalize">
                {headerTitle}
            </h1>

            {/* Show Category Grid if only country is selected */}
            {categories.length > 0 && (
                <div className="mb-10">
                    <CategoryGrid categories={categories} currentCountryId={country} />
                    <div className="border-t border-slate-200 dark:border-slate-700 my-8"></div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">All Verified Sites</h2>
                </div>
            )}

            {sites.length === 0 ? (
                <div className="text-center py-20 surface-card rounded-2xl shadow-sm">
                    <h3 className="text-xl font-medium text-slate-900 dark:text-slate-300 mb-2">No verification records found</h3>
                    <p className="text-slate-500 dark:text-slate-400">Try adjusting your filters or search terms.</p>
                </div>
            ) : (
                <>
                    {detectedCategory ? (
                        <div className="space-y-8">
                            <section className="space-y-4">
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                    Matches for "{q}"
                                </h2>
                                {exact.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {exact.map((site: Site) => (
                                            <SiteCard key={site.id} site={site} />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        No direct matches on this page.
                                    </p>
                                )}
                            </section>

                            <section className="space-y-4">
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                    More from {detectedCategory.name} ({scope?.countryIso || country}
                                    {scope?.stateCode ? ` - ${scope.stateCode}` : ''})
                                </h2>
                                {categoryExpansion.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {categoryExpansion.map((site: Site) => (
                                            <SiteCard key={site.id} site={site} />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        No additional category results on this page.
                                    </p>
                                )}
                            </section>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {sites.map((site: Site) => (
                                <SiteCard key={site.id} site={site} />
                            ))}
                        </div>
                    )}
                    <Pagination total={total} limit={PAGE_LIMIT} />
                </>
            )}
        </div>
    );
}
