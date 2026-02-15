'use client';

import { useEffect, useState } from 'react';
import { getPublicOrganization, trackView, trackClick } from '@/lib/api';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import { ExternalLink, MapPin, Globe, Building2, Tag, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toProxyImageUrl } from '@/lib/imageProxy';

interface OrgProfileContentProps {
    initialData?: any;
}

function OrgProfileContent({ initialData }: OrgProfileContentProps) {
    const params = useParams();
    const id = params?.id as string;

    const [org, setOrg] = useState<any>(initialData || null);
    const [loading, setLoading] = useState(!initialData);

    useEffect(() => {
        if (!id) return;

        const init = async () => {
            // Use initialData if available and valid (simple check), otherwise fetch
            // But if initialData is for a different ID (unlikely in Page), we should refetch?
            // Since Page key changes with ID, this component remounts.

            if (!initialData) {
                try {
                    const data = await getPublicOrganization(id);
                    setOrg(data);
                } catch (error) {
                    console.error("Failed to load org", error);
                } finally {
                    setLoading(false);
                }
            }

            // Track View (always)
            try {
                await trackView(id);
            } catch (e) {
                console.error("Analytics view tracking failed", e);
            }
        };

        init();
    }, [id, initialData]);

    const handleWebsiteClick = () => {
        if (org && org.website && id) {
            trackClick(id).catch(err => console.error("Analytics click tracking failed", err));
            window.open(org.website, '_blank');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
            </div>
        );
    }

    if (!org) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <Building2 className="w-16 h-16 mb-4 text-slate-300 dark:text-slate-700" />
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Organization Not Found</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2">The organization you are looking for does not exist or is not verified.</p>
                <Link href="/" className="mt-8 text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2 font-medium">
                    <ArrowLeft className="w-4 h-4" /> Return Home
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-20 bg-app relative">
            {/* Background Effects (Absolute) */}
            <div className="absolute top-0 left-0 w-full h-[600px] overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-glow"></div>
                <div className="absolute inset-0 bg-slate-200/20 dark:bg-blue-950/15"></div>
                {/* Fade out at bottom of header area */}
                <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-slate-50 dark:from-slate-950 to-transparent"></div>
            </div>

            {/* Single Content Wrapper */}
            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24">

                {/* Header Section */}
                <div className="mb-12 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-[#101627]/70 backdrop-blur-xl shadow-lg shadow-slate-200/40 dark:shadow-black/25 p-4 sm:p-6">
                    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-4 sm:gap-5">
                                <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-white/85 dark:bg-[#212121]/65 rounded-xl p-3 border border-slate-100/80 dark:border-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
                                    {org.logo && !org.logo.includes('via.placeholder.com') ? (
                                        <Image
                                            key={org.logo} // Force re-render if URL changes
                                            src={toProxyImageUrl(org.logo)}
                                            alt={org.name}
                                            fill
                                            className="object-contain p-2"
                                            sizes="(max-width: 768px) 80px, 96px"
                                        />
                                    ) : (
                                        <Building2 className="w-10 h-10 text-slate-400 dark:text-slate-500" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white truncate">{org.name}</h1>
                                        {org.isVerified && <VerifiedBadge />}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                        <span className="inline-flex items-center gap-1.5 bg-white/80 dark:bg-[#212121]/65 px-3 py-1 rounded-full border border-slate-200/70 dark:border-slate-700/60">
                                            <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                            {org.country?.name || 'Country'}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 bg-white/80 dark:bg-[#212121]/65 px-3 py-1 rounded-full border border-slate-200/70 dark:border-slate-700/60">
                                            <Tag className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                            {org.category?.name || 'Uncategorized'}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 bg-white/80 dark:bg-[#212121]/65 px-3 py-1 rounded-full border border-slate-200/70 dark:border-slate-700/60">
                                            <ShieldCheck className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                            PRIVATE
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {org.website && (
                            <div className="w-full md:w-auto md:shrink-0">
                                <button
                                    onClick={handleWebsiteClick}
                                    className="inline-flex w-full md:w-auto items-center justify-center gap-1.5 rounded-xl bg-[#187DE9] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1E90FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#101627]"
                                >
                                    Official Website
                                    <ExternalLink className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Body Content */}
                <div className="grid gap-8 lg:grid-cols-3">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-6">
                        <section className="bg-white/80 dark:bg-slate-900/60 rounded-2xl p-6 md:p-8 shadow-lg shadow-slate-200/40 dark:shadow-black/20 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-blue-500" />
                                About Organization
                            </h2>
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                                {org.about || "No description provided for this organization."}
                            </p>
                        </section>

                        <section className="bg-white/80 dark:bg-slate-900/60 rounded-2xl p-6 md:p-8 shadow-lg shadow-slate-200/40 dark:shadow-black/20 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <Globe className="w-5 h-5 text-purple-500" />
                                Contact Information
                            </h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="rounded-xl bg-white/60 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 p-4">
                                    <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
                                        <MapPin className="w-3.5 h-3.5" />
                                        Physical Address
                                    </p>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                                        {org.address || "Address not available"}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-white/60 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 p-4">
                                    <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
                                        <Globe className="w-3.5 h-3.5" />
                                        Digital Contact
                                    </p>
                                    {org.email && (
                                        <div className="mb-1">
                                            <a href={`mailto:${org.email}`} className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium">
                                                {org.email}
                                            </a>
                                        </div>
                                    )}
                                    {org.phone && <div className="text-sm text-slate-700 dark:text-slate-300 font-medium">{org.phone}</div>}
                                    {!org.email && !org.phone && <span className="text-sm text-slate-400 italic">No contact info provided</span>}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Right Column */}
                    <aside className="space-y-6">
                        <section className="bg-white/80 dark:bg-slate-900/60 rounded-2xl p-6 shadow-lg shadow-slate-200/40 dark:shadow-black/20 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Verification Status</h2>
                            <div className="flex items-start gap-3 text-green-700 dark:text-green-400 bg-green-50/80 dark:bg-green-900/20 p-4 rounded-xl border border-green-200/60 dark:border-green-900/30">
                                <VerifiedBadge className="w-5 h-5 shrink-0 mt-0.5" showText={false} />
                                <div>
                                    <span className="font-semibold block">Identity Verified</span>
                                    <span className="text-xs opacity-90">Officially verified entity</span>
                                </div>
                            </div>
                            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                This organization has been verified by VeriLnk. {org.website ? (
                                    <>Official domain: <strong>{(() => { try { return new URL(org.website).hostname; } catch { return org.website; } })()}</strong>.</>
                                ) : 'Official domain verified.'}
                            </p>
                        </section>

                        <section className="bg-white/80 dark:bg-slate-900/60 rounded-2xl p-6 shadow-lg shadow-slate-200/40 dark:shadow-black/20 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Trust Summary</h2>
                            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
                                <li className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5" /> Manual verification by admins</li>
                                <li className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5" /> Verified badge shown on listings</li>
                                <li className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5" /> Official website ownership reviewed</li>
                            </ul>
                        </section>

                        <section className="bg-white/80 dark:bg-slate-900/60 rounded-2xl p-6 shadow-lg shadow-slate-200/40 dark:shadow-black/20 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Organization Details</h2>
                            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-slate-500">Country</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{org.country?.name || 'Not provided'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-slate-500">Category</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{org.category?.name || 'Not provided'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-slate-500">Type</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{org.type || 'Not provided'}</span>
                                </div>
                                {org.website && (
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-slate-500">Website</span>
                                        <span className="font-medium text-slate-900 dark:text-white truncate">
                                            {(() => { try { return new URL(org.website).hostname; } catch { return org.website; } })()}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </section>

                        <div className="text-left">
                            <Link href="/" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors font-medium">
                                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Directory
                            </Link>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

export default function OrgProfileClient({ initialData }: { initialData?: any }) {
    return <OrgProfileContent initialData={initialData} />;
}
