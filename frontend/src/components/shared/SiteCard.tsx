'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import ReportModal from '@/components/ReportModal';
import LoginModal from '@/components/auth/LoginModal';
import SignupModal from '@/components/auth/SignupModal';
import { useAuth } from '@/context/AuthContext';
import { trackClickFireAndForget } from '@/lib/api';

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
    organizationWebsite?: string | null;
    organization_website?: string | null;
    organization?: { website?: string | null } | null;
}

export default function SiteCard({ site }: { site: Site }) {
    const { user } = useAuth();
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [isSignupOpen, setIsSignupOpen] = useState(false);

    const countryName = site.country_name || site.country?.name;
    const categoryName = site.category_name || site.category?.name;
    const orgWebsite =
        site.organization?.website ||
        site.organization_website ||
        site.organizationWebsite ||
        null;
    const officialWebsite = orgWebsite || site.url;
    const hostname = (() => { try { return new URL(officialWebsite).hostname } catch { return officialWebsite } })();
    const displayName = site.title || site.name || hostname;
    const isVerified = (site as any).isApproved === true || site.status === 'SUCCESS' || site.verification === 'SUCCESS';
    const orgId = site.organization_id || site.organizationId;
    const orgPublic = site.organization_public ?? site.organizationPublic ?? false;
    const hasVerifiedProfile = !!orgId && orgPublic === true;
    const websiteLabel = orgId ? 'Official Website ↗' : 'Visit Website ↗';

    const handleReportClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
            setIsLoginOpen(true);
        } else {
            setIsReportOpen(true);
        }
    };

    const handleOfficialWebsiteClick = () => {
        if (!orgId) return;
        trackClickFireAndForget(orgId, site.id);
    };

    return (
        <>
            <div className="group relative surface-card rounded-xl transition-all duration-300 overflow-hidden shadow-md hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)] hover:border-blue-500/40">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-[var(--app-text-primary)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-2">
                            {displayName}
                            {isVerified && (
                                <>
                                    <ShieldCheck className="w-5 h-5 text-[var(--app-primary)]" />
                                </>
                            )}
                        </h3>
                    </div>
                    <span className="inline-flex items-center text-sm text-[var(--app-text-secondary)] mb-4">
                        {hostname}
                    </span>

                    <div className="flex flex-wrap gap-2 mb-3">
                        {hasVerifiedProfile && (
                            <Link
                                href={`/org/${orgId}`}
                                className="inline-flex items-center justify-center rounded-lg btn-primary px-3 py-1.5 text-xs font-medium transition-all"
                            >
                                Verified Profile
                            </Link>
                        )}
                        <a
                            href={officialWebsite}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleOfficialWebsiteClick}
                            className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187DE9]/30 ${hasVerifiedProfile ? 'border-[#187DE9] text-[#187DE9] hover:border-[#187DE9] hover:text-[#187DE9] hover:bg-[#187DE9]/10 focus-visible:border-[#187DE9] focus-visible:text-[#187DE9]' : 'border-transparent bg-[#187DE9] text-white hover:border-[#187DE9] hover:text-[#187DE9] hover:bg-transparent dark:hover:bg-transparent focus-visible:border-[#187DE9] focus-visible:text-[#187DE9] focus-visible:bg-transparent dark:focus-visible:bg-transparent'}`}
                        >
                            {websiteLabel}
                        </a>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--app-text-secondary)] pt-4 border-t border-[var(--app-border)]">
                        <div className="flex items-center gap-2">
                            {countryName && <span>{countryName}</span>}
                            {countryName && categoryName && <span>•</span>}
                            {categoryName && <span className="capitalize">{categoryName}</span>}
                        </div>
                        <button
                            onClick={handleReportClick}
                            className="inline-flex items-center gap-1 text-[var(--app-text-secondary)] hover:text-red-500 hover:bg-red-500/10 rounded-full px-2 py-1 transition-all"
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
