
'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCountry } from '@/context/CountryContext';
import SearchBar from '@/components/home/SearchBar';
import ModernDropdown from '@/components/ui/ModernDropdown';
import SiteCard from '@/components/shared/SiteCard';
import NotFoundThemeImage from '@/components/shared/NotFoundThemeImage';
import Pagination from '@/components/common/Pagination';
import { fetchSitesPaginated, fetchStates } from '@/lib/api';
import { Loader2, Hash, MapPin, ShieldCheck } from 'lucide-react';
import { getFlagEmoji, getImageUrl } from '@/lib/utils';

interface HomeClientProps {
    initialCountries: any[];
    initialCategories: any[];
}

export default function HomeClient({ initialCountries, initialCategories }: HomeClientProps) {
    const { countryCode, countryName, countryId, stateId: detectedStateId, flagImage, setCountry } = useCountry();
    const router = useRouter();
    const searchParams = useSearchParams();
    const pageParam = Number(searchParams.get('page')) || 1;
    const page = pageParam < 1 ? 1 : pageParam;
    const PAGE_LIMIT = 15;
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [selectedStateId, setSelectedStateId] = useState<string>('');
    const [hasManualState, setHasManualState] = useState(false);
    const [states, setStates] = useState<any[]>([]);
    const [loadingStates, setLoadingStates] = useState(false);
    const [sites, setSites] = useState<any[]>([]);
    const [loadingSites, setLoadingSites] = useState(false);
    const [totalSites, setTotalSites] = useState(0);
    const [sitesFetchState, setSitesFetchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const resetPageParam = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', '1');
        router.push(`?${params.toString()}`);
    };

    // Initial load & Country change effect
    // Initial load & Country change effect
    useEffect(() => {
        let isMounted = true;
        const currentCountryId = countryId;
        const controller = new AbortController();

        const loadSites = async () => {
            // STRICT: Immediately reset data when country changes to prevent leaks
            if (isMounted) {
                if (currentCountryId) setSites([]);
                setTotalSites(0);
                setLoadingSites(true);
                setSitesFetchState('loading');
            }

            if (!currentCountryId && countryCode !== 'Global') {
                if (isMounted) {
                    setLoadingSites(false);
                    setSitesFetchState('idle');
                }
                return;
            }

            try {
                // If specific country selected
                const params: any = {};
                if (currentCountryId) params.countryId = currentCountryId;
                if (selectedStateId) params.stateId = selectedStateId;
                if (selectedCategoryId) params.categoryId = selectedCategoryId;

                const data = await fetchSitesPaginated({ ...params, page, limit: PAGE_LIMIT }, controller.signal);

                if (isMounted && (currentCountryId === countryId)) {
                    if (data.totalPages > 0 && page > data.totalPages) {
                        const params = new URLSearchParams(searchParams.toString());
                        params.set('page', String(data.totalPages));
                        router.replace(`?${params.toString()}`);
                        return;
                    }
                    setSites(data.items || []);
                    setTotalSites(data.total ?? 0);
                    setSitesFetchState('success');
                }
            } catch (error) {
                if (isMounted) {
                    if (axios.isCancel(error) || (error as Error).name === 'AbortError') {
                        console.log('[HomeClient] Fetch aborted.');
                    } else {
                        console.error("[HomeClient] Failed to load sites:", error);
                        setSitesFetchState('error');
                    }
                }
            } finally {
                if (isMounted) {
                    setLoadingSites(false);
                }
            }
        };

        loadSites();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [countryId, selectedStateId, selectedCategoryId, countryCode, page]); // Removed countryName from dependency to avoid extra re-renders if name changes but Id doesn't? No, context updates both.

    // Load States on Country Change
    useEffect(() => {
        const controller = new AbortController();

        if (countryId) {
            const loadStates = async () => {
                setLoadingStates(true);
                try {
                    console.log(`[HomeClient] Fetching states for ${countryId}...`);
                    const data = await fetchStates(countryId, controller.signal);
                    setStates(data);
                } catch (error) {
                    if (axios.isCancel(error) || (error as Error).name === 'AbortError') {
                        console.log('[HomeClient] States fetch aborted.');
                    } else {
                        console.error("Failed to load states", error);
                    }
                } finally {
                    setLoadingStates(false);
                }
            };
            loadStates();
            setSelectedStateId(''); // Reset state on country change
        } else {
            setStates([]);
            setSelectedStateId('');
        }

        return () => {
            controller.abort();
        };
    }, [countryId]);

    useEffect(() => {
        if (!hasManualState && detectedStateId && !selectedStateId) {
            setSelectedStateId(detectedStateId);
            resetPageParam();
        }
    }, [detectedStateId, hasManualState, selectedStateId]);

    // Country Dropdown Options
    const countryOptions = initialCountries.map(c => {
        const image = c.flagImage ? getImageUrl(c.flagImage) : (c.flagImageUrl || '');
        return {
            id: c.id,
            label: c.name,
            value: c.id,
            image
        };
    });

    // Category Dropdown Options
    const categoryOptions = initialCategories.map(c => ({
        id: c.id,
        label: c.name,
        value: c.id
    }));
    // Add "All Categories" option
    categoryOptions.unshift({ id: '', label: 'All Categories', value: '' });

    // State Dropdown Options
    const stateOptions = states.map(s => ({
        id: s.id,
        label: s.name,
        value: s.id
    }));
    stateOptions.unshift({ id: '', label: 'All States/Regions', value: '' });

    const handleCountryChange = (id: string) => {
        const country = initialCountries.find(c => c.id === id);
        if (country) {
            const image = country.flagImage ? getImageUrl(country.flagImage) : (country.flagImageUrl || '');
            setCountry(country.code, country.name, country.id, image);
            // Reset filters
            setSelectedCategoryId('');
            setSelectedStateId('');
            setHasManualState(false);
            resetPageParam();
        }
    };

    const showNoResults = !loadingSites && sites.length === 0 && sitesFetchState === 'success';
    const showLoadError = !loadingSites && sites.length === 0 && sitesFetchState === 'error';

    return (
        <div className="min-h-screen pb-20 bg-app">
            {/* Hero Section - New Dark Glass & Glow */}
            <div className="relative bg-glow pt-24 pb-20 px-4 overflow-hidden ">
                <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center text-center">

                    {/* Privacy Badge */}
                    <div className="flex items-center justify-center gap-2 text-[10px] sm:text-xs text-blue-600 dark:text-blue-200/80 mb-8 ">
                        <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                        <span>Find Verified Official Websites — Worldwide, <span className="text-gray-700 dark:text-blue-100 font-medium">completely private and secure.</span></span>
                    </div>

                    <div className="w-full max-w-3xl mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <SearchBar stateId={selectedStateId} />
                    </div>
                </div>
            </div>

            {/* Filters & Content Section */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-20">
                <div className="surface-card rounded-2xl shadow-2xl p-6 md:p-8">
                    {/* Filters */}
                    <div className="flex flex-col lg:flex-row gap-6 mb-8 items-end">
                        <div className="w-full lg:w-1/4">
                            <ModernDropdown
                                label="Select Country"
                                placeholder="Choose a country..."
                                options={countryOptions}
                                value={countryId || ''}
                                onChange={handleCountryChange}
                            />
                        </div>

                        {/* State Dropdown - Only show if states exist or loading */}
                        <div className={`w-full lg:w-1/4 transition-all duration-300 ${countryId ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            {/* Show if states exist or loading. If verified no states, maybe hide or show disabled? Better to show "No regions available" if loaded & empty? 
                                Actually, sticking to standard dropdown behavior. */ }
                            <ModernDropdown
                                label="Filter by State/Province"
                                placeholder={loadingStates ? "Loading..." : "All States/Regions"}
                                options={stateOptions}
                                value={selectedStateId}
                                onChange={(value) => {
                                    setSelectedStateId(value);
                                    setHasManualState(true);
                                    resetPageParam();
                                }}
                                disabled={!countryId || loadingStates || states.length === 0}
                            />
                        </div>

                        <div className={`w-full lg:w-1/4 transition-all duration-300 ${countryId ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            <ModernDropdown
                                label="Filter by Category"
                                placeholder="All Categories"
                                options={categoryOptions}
                                value={selectedCategoryId}
                                onChange={(value) => {
                                    setSelectedCategoryId(value);
                                    resetPageParam();
                                }}
                            />
                        </div>
                        <div className="w-full lg:w-1/4 pb-2 text-slate-500 text-sm">
                            {loadingSites ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Updating results...
                                </div>
                            ) : (
                                <span>{totalSites} verified sites found</span>
                            )}
                        </div>
                    </div>

                    {/* Sites Grid */}
                    {loadingSites && sites.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500" />
                            <p>Loading verified sites...</p>
                        </div>
                    ) : sites.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {sites.map((site) => (
                                    <SiteCard key={site.id} site={site} />
                                ))}
                            </div>
                            <Pagination total={totalSites} limit={PAGE_LIMIT} />
                        </>
                    ) : showLoadError ? (
                        <div className="text-center py-20 text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                            <div className="flex justify-center mb-4">
                                <NotFoundThemeImage
                                    alt="Unable to load sites"
                                    className="h-24 w-24 sm:h-28 sm:w-28 object-contain"
                                />
                            </div>
                            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Unable to load sites
                            </h3>
                            <p className="max-w-md mx-auto">
                                Please check your connection and try again.
                            </p>
                        </div>
                    ) : showNoResults ? (
                        <div className="text-center py-20 text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                            <div className="flex justify-center mb-4">
                                <NotFoundThemeImage
                                    alt="No sites found"
                                    className="h-24 w-24 sm:h-28 sm:w-28 object-contain"
                                />
                            </div>
                            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                                No sites found
                            </h3>
                            <p className="max-w-md mx-auto">
                                We couldn't find any verified sites properly matching your filters.
                                Try selecting a different country or category.
                            </p>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Category Grid Fallback / Promotion */}
            {!countryId && (
                <div className="container mx-auto px-4 mt-20">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {initialCategories.slice(0, 4).map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategoryId(cat.id)}
                                className="p-6 surface-card rounded-xl hover:border-blue-500/50 hover:bg-white/5 transition-all flex flex-col items-center gap-3 group"
                            >
                                <div className="p-3 bg-blue-500/10 rounded-full group-hover:bg-blue-500/20 transition-colors">
                                    <Hash className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                                </div>
                                <span className="font-medium capitalize text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-200">{cat.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
