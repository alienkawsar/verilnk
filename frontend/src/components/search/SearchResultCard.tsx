'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import ReportModal from '@/components/ReportModal';
import LoginModal from '@/components/auth/LoginModal';
import SignupModal from '@/components/auth/SignupModal';
import { useAuth } from '@/context/AuthContext';

interface Site {
    id: string;
    name?: string;
    title?: string;
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

export default function SearchResultCard({ site }: { site: Site }) {
    const { user } = useAuth();
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [isSignupOpen, setIsSignupOpen] = useState(false);

    const countryName = site.country_name || site.country?.name;
    const categoryName = site.category_name || site.category?.name;
    const hostname = (() => { try { return new URL(site.url).hostname } catch { return site.url } })();
    const displayName = site.title || site.name || hostname;
    const isVerified = (site as any).isApproved === true || site.status === 'SUCCESS' || site.verification === 'SUCCESS';
    const orgId = site.organization_id || site.organizationId;
    const orgPublic = site.organization_public ?? site.organizationPublic ?? false;
    const hasVerifiedProfile = !!orgId && orgPublic === true;

    const handleReportClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
            setIsLoginOpen(true);
        } else {
            setIsReportOpen(true);
        }
    };

    return (
        <>
            <div className="group relative bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500/50 transition-all duration-300 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-blue-500/5 dark:hover:shadow-blue-500/10">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-2">
                            {displayName}
                            {isVerified && (
                                <>
                                    <ShieldCheck className="w-5 h-5 text-blue-500" />
                                </>
                            )}
                        </h3>
                    </div>
                    <span className="inline-flex items-center text-sm text-slate-500 dark:text-slate-400 mb-4">
                        {hostname}
                    </span>

                    <div className="flex flex-wrap gap-2 mb-3">
                        {hasVerifiedProfile && (
                            <Link
                                href={`/org/${orgId}`}
                                className="inline-flex items-center justify-center rounded-lg btn-primary px-3 py-1.5 text-xs font-medium transition-colors"
                            >
                                Verified Profile
                            </Link>
                        )}
                        <a
                            href={site.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${hasVerifiedProfile ? 'border border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20' : 'btn-primary'}`}
                        >
                            Official Website ↗
                        </a>
                    </div>
                    {hasVerifiedProfile && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            View VeriLnk verification details
                        </p>
                    )}

                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-500 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center gap-2">
                            {countryName && <span>{countryName}</span>}
                            {countryName && categoryName && <span>•</span>}
                            {categoryName && <span className="capitalize">{categoryName}</span>}
                        </div>
                        <button
                            onClick={handleReportClick}
                            className="inline-flex items-center gap-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full px-2 py-1 transition-all"
                            title="Report this site"
                        >
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-[11px]">Report</span>
                        </button>
                    </div>
                </div>
            </div>

            <ReportModal
                isOpen={isReportOpen}
                onClose={() => setIsReportOpen(false)}
                siteId={site.id}
                siteUrl={site.url}
            />

            <LoginModal
                isOpen={isLoginOpen}
                onClose={() => setIsLoginOpen(false)}
                onSwitchToSignup={() => {
                    setIsLoginOpen(false);
                    setIsSignupOpen(true);
                }}
            />
            <SignupModal
                isOpen={isSignupOpen}
                onClose={() => setIsSignupOpen(false)}
                onSwitchToLogin={() => {
                    setIsSignupOpen(false);
                    setIsLoginOpen(true);
                }}
            />
        </>
    );
}
