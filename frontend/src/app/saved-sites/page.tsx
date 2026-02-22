'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import SiteCard from '@/components/shared/SiteCard';
import { fetchMySavedSites, type SavedSiteItem } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSavedSites } from '@/hooks/useSavedSites';

const PAGE_SIZE = 15;

const matchesSite = (site: SavedSiteItem, rawQuery: string) => {
    const query = rawQuery.trim().toLowerCase();
    if (!query) return true;

    const fields = [
        site.title,
        site.name,
        site.url,
        site.country_name,
        site.country?.name,
        site.category_name,
        site.category?.name
    ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

    return fields.some((field) => field.includes(query));
};

export default function SavedSitesPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const { isSaved, isHydrated, loading: savedLoading } = useSavedSites();

    const [savedSites, setSavedSites] = useState<SavedSiteItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            const params = new URLSearchParams({
                login: 'true',
                returnTo: '/saved-sites'
            });
            router.replace(`/?${params.toString()}`);
            return;
        }

        let cancelled = false;
        setLoadingInitial(true);
        setError(null);

        fetchMySavedSites({ limit: PAGE_SIZE })
            .then((response) => {
                if (cancelled) return;
                setSavedSites(Array.isArray(response.items) ? response.items : []);
                setNextCursor(response.nextCursor ?? null);
            })
            .catch((err: any) => {
                if (cancelled) return;
                setSavedSites([]);
                setNextCursor(null);
                setError(err?.response?.data?.message || 'Failed to load saved sites');
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingInitial(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [authLoading, user?.id, router]);

    const visibleSavedSites = useMemo(
        () => savedSites.filter((site) => isSaved(site.id)),
        [savedSites, isSaved]
    );

    const filteredSites = useMemo(
        () => visibleSavedSites.filter((site) => matchesSite(site, query)),
        [visibleSavedSites, query]
    );

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        setError(null);

        try {
            const response = await fetchMySavedSites({
                limit: PAGE_SIZE,
                cursor: nextCursor
            });

            setSavedSites((prev) => {
                const byId = new Map(prev.map((site) => [site.id, site]));
                for (const site of response.items || []) {
                    byId.set(site.id, site);
                }
                return Array.from(byId.values());
            });
            setNextCursor(response.nextCursor ?? null);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to load more saved sites');
        } finally {
            setLoadingMore(false);
        }
    };

    if (authLoading || (user && (!isHydrated || savedLoading || loadingInitial))) {
        return (
            <main className='min-h-screen bg-app p-4 md:p-8'>
                <div className='max-w-7xl mx-auto flex items-center justify-center py-24 text-slate-500 dark:text-slate-400'>
                    <Loader2 className='w-6 h-6 animate-spin mr-2' />
                    Loading saved sites...
                </div>
            </main>
        );
    }

    return (
        <main className='min-h-screen bg-app p-4 md:p-8'>
            <div className='max-w-7xl mx-auto space-y-6'>
                <Link
                    href='/'
                    className='inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-colors'
                >
                    <ArrowLeft className='w-4 h-4 mr-2' />
                    Back to Home
                </Link>

                <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
                    <div>
                        <h1 className='text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-blue-600 dark:from-white dark:to-blue-200'>
                            Saved Sites
                        </h1>
                        <p className='text-sm text-slate-500 dark:text-slate-400 mt-1'>
                            Quickly revisit the verified sites you bookmarked.
                        </p>
                    </div>

                    <div className='w-full md:w-80 relative'>
                        <Search className='w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2' />
                        <input
                            type='search'
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder='Search saved sites...'
                            className='w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40'
                        />
                    </div>
                </div>

                {error && (
                    <div className='rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-600 dark:text-red-300'>
                        {error}
                    </div>
                )}

                {filteredSites.length > 0 ? (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                        {filteredSites.map((site) => (
                            <SiteCard key={site.id} site={site} />
                        ))}
                    </div>
                ) : (
                    <div className='text-center py-20 surface-card rounded-2xl shadow-sm'>
                        <h2 className='text-xl font-semibold text-slate-900 dark:text-slate-200 mb-2'>
                            {query.trim() ? 'No matches found' : 'No saved sites yet'}
                        </h2>
                        <p className='text-slate-500 dark:text-slate-400'>
                            {query.trim()
                                ? 'Try a different keyword.'
                                : 'Save a site from any listing to see it here.'}
                        </p>
                    </div>
                )}

                {nextCursor && !query.trim() && (
                    <div className='flex justify-center'>
                        <button
                            type='button'
                            onClick={loadMore}
                            disabled={loadingMore}
                            className='inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
                        >
                            {loadingMore && <Loader2 className='w-4 h-4 animate-spin' />}
                            Load more
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}
