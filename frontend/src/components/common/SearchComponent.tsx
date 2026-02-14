'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { searchSites } from '@/lib/api';
import { Search, ShieldCheck, Clock, X, Building, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useCountry } from '@/context/CountryContext';
import { useAuth } from '@/context/AuthContext';
import ReportModal from '../ReportModal';
import LoginModal from '../auth/LoginModal';
import SignupModal from '../auth/SignupModal';

interface SearchResult {
    id: string;
    name: string;
    url: string;
    category_name?: string;
    country_name?: string;
    verification: 'SUCCESS' | 'PENDING' | 'FLAGGED' | 'FAILED';
}

export default function SearchComponent() {
    const { countryCode, stateId } = useCountry();
    const { user } = useAuth();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const requestIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const router = useRouter();
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Modal States
    const [reportSite, setReportSite] = useState<{ id: string; url: string } | null>(null);
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [isSignupOpen, setIsSignupOpen] = useState(false);

    // Debounce logic
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            const trimmed = query.trim();
            if (abortRef.current) {
                abortRef.current.abort();
            }

            if (trimmed.length > 1 && countryCode && countryCode !== 'Global') {
                const requestId = ++requestIdRef.current;
                const controller = new AbortController();
                abortRef.current = controller;
                setLoading(true);
                try {
                    const data = await searchSites({
                        q: trimmed,
                        country: countryCode,
                        stateId: stateId || undefined,
                        limit: 5
                    }, controller.signal);
                    if (requestId === requestIdRef.current) {
                        setResults(data.hits);
                        setShowResults(true);
                    }
                } catch (error: any) {
                    if (error?.name !== 'AbortError') {
                        console.error('Search failed', error);
                    }
                } finally {
                    if (requestId === requestIdRef.current) {
                        setLoading(false);
                    }
                }
            } else {
                setResults([]);
                setShowResults(false);
                setLoading(false);
            }
        }, 300);

        return () => {
            clearTimeout(delayDebounceFn);
            if (abortRef.current) {
                abortRef.current.abort();
            }
        };
    }, [query, countryCode, stateId]);

    // Click outside to close
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [wrapperRef]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim() && countryCode && countryCode !== 'Global') {
            setShowResults(false);
            const params = new URLSearchParams();
            params.set('q', query.trim());
            params.set('country', countryCode);
            if (stateId) params.set('state', stateId);
            router.push(`/search?${params.toString()}`);
        }
    };

    const handleReportClick = (siteId: string, siteUrl: string) => {
        if (!user) {
            setIsLoginOpen(true);
        } else {
            setReportSite({ id: siteId, url: siteUrl });
        }
    };

    const getBadge = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <ShieldCheck className="w-4 h-4 text-green-500" />;
            case 'PENDING':
                return <Clock className="w-4 h-4 text-yellow-500" />;
            case 'FLAGGED':
                return <X className="w-4 h-4 text-red-500" />;
            default:
                return <Building className="w-4 h-4 text-slate-400" />;
        }
    };

    return (
        <div ref={wrapperRef} className="relative w-full max-w-2xl mx-auto">
            <form onSubmit={handleSearch} className="relative z-50">
                <div className="relative group">
                    <div className={`absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 ${showResults ? 'opacity-50' : ''}`}></div>
                    <div className="relative flex items-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
                        <div className="pl-4 text-slate-400">
                            <Search className={`w-5 h-5 ${loading ? 'animate-pulse text-blue-500' : ''}`} />
                        </div>
                        <input
                            type="text"
                            className="w-full px-4 py-4 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                            placeholder="Search verified sites (e.g., 'Ministry of Education', 'Tax Portal')..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => query.length > 1 && setShowResults(true)}
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="p-2 mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </form>

            {/* Results Dropdown */}
            {showResults && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-4 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden z-40 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
                        <span>Best Matches</span>
                        <span className="text-blue-500">Official Sources</span>
                    </div>
                    {results.map((result) => (
                        <div
                            key={result.id}
                            className="group/item flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-l-4 border-transparent hover:border-blue-500 pr-4"
                        >
                            <Link
                                href={`/site/${result.id}`}
                                onClick={() => setShowResults(false)}
                                className="flex-1 flex items-center gap-4 px-4 py-3 min-w-0"
                            >
                                <div className={`p-2 rounded-lg ${result.verification === 'SUCCESS' ? 'bg-green-500/10' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                    {getBadge(result.verification)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-slate-900 dark:text-white truncate flex items-center gap-2">
                                        {result.name}
                                        {result.verification === 'SUCCESS' && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 uppercase tracking-wide">
                                                Verified
                                            </span>
                                        )}
                                    </h4>
                                    <p className="text-sm text-slate-500 truncate flex items-center gap-2">
                                        <span className="font-mono text-xs">{new URL(result.url).hostname}</span>
                                        {result.country_name && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                <span>{result.country_name}</span>
                                            </>
                                        )}
                                    </p>
                                </div>
                            </Link>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleReportClick(result.id, result.url);
                                }}
                                className="p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all focus:opacity-100 focus:outline-none"
                                title="Report this site"
                            >
                                <AlertTriangle className="w-4 h-4" />
                            </button>
                        </div>
                    ))}

                    <Link
                        href={`/search?${(() => {
                            const params = new URLSearchParams();
                            params.set('q', query);
                            params.set('country', countryCode);
                            if (stateId) params.set('state', stateId);
                            return params.toString();
                        })()}`}
                        className="block px-4 py-3 text-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-t border-slate-100 dark:border-slate-700"
                    >
                        View all results for &quot;{query}&quot;
                    </Link>
                </div>
            )}

            <ReportModal
                isOpen={!!reportSite}
                onClose={() => setReportSite(null)}
                siteId={reportSite?.id || ''}
                siteUrl={reportSite?.url || ''}
            />

            <LoginModal
                isOpen={isLoginOpen}
                onClose={() => setIsLoginOpen(false)}
                onSwitchToSignup={() => {
                    setIsSignupOpen(true);
                    setIsLoginOpen(false);
                }}
            />
            <SignupModal
                isOpen={isSignupOpen}
                onClose={() => setIsSignupOpen(false)}
                onSwitchToLogin={() => {
                    setIsLoginOpen(true);
                    setIsSignupOpen(false);
                }}
            />
        </div>
    );
}
