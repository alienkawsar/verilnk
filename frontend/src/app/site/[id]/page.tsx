import { fetchSiteById } from '@/lib/api';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { ShieldCheck, AlertTriangle, ExternalLink, Globe, Clock, Calendar } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const resolvedParams = await params;
    try {
        const site = await fetchSiteById(resolvedParams.id);
        return {
            title: `${site.name} - VeriLnK Verification Status`,
            description: `Verification status for ${site.name} (${site.url}).`,
        };
    } catch {
        console.error('Failed to report site');
        return { title: 'Site Not Found' };
    }
}

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    let site;
    try {
        site = await fetchSiteById(resolvedParams.id);
    } catch {
        notFound();
    }

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return {
                    color: 'green',
                    icon: <ShieldCheck className="w-12 h-12 text-green-500" />,
                    bgColor: 'bg-green-50 dark:bg-green-900/20',
                    borderColor: 'border-green-200 dark:border-green-800',
                    textColor: 'text-green-800 dark:text-green-200',
                    label: 'Officially Verified',
                    description: 'This site has been verified as an official government or education resource.',
                };
            case 'FLAGGED':
                return {
                    color: 'red',
                    icon: <AlertTriangle className="w-12 h-12 text-red-500" />,
                    bgColor: 'bg-red-50 dark:bg-red-900/20',
                    borderColor: 'border-red-200 dark:border-red-800',
                    textColor: 'text-red-800 dark:text-red-200',
                    label: 'Warning: Flagged',
                    description: 'This site has been flagged due to suspicious activity or user reports. Proceed with caution.',
                };
            case 'PENDING':
                return {
                    color: 'yellow',
                    icon: <Clock className="w-12 h-12 text-yellow-500" />,
                    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
                    borderColor: 'border-yellow-200 dark:border-yellow-800',
                    textColor: 'text-yellow-800 dark:text-yellow-200',
                    label: 'Verification Pending',
                    description: 'This site is currently under review by our verification team.',
                };
            default: // FAILED etc
                return {
                    color: 'slate',
                    icon: <AlertTriangle className="w-12 h-12 text-slate-500" />,
                    bgColor: 'bg-slate-50 dark:surface-card',
                    borderColor: 'border-slate-200 dark:border-slate-700',
                    textColor: 'text-slate-800 dark:text-slate-200',
                    label: 'Verification Failed',
                    description: 'This site failed our verification process.',
                };
        }
    };

    const statusConfig = getStatusConfig(site.status);

    return (
        <div className="min-h-screen text-slate-900 dark:text-white py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <Link href="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-6 inline-block">
                    &larr; Back to Home
                </Link>

                {/* Status Banner */}
                <div className={`rounded-2xl p-8 border ${statusConfig.bgColor} ${statusConfig.borderColor} border-opacity-50 mb-8 flex flex-col md:flex-row items-start md:items-center gap-6 shadow-sm`}>
                    <div className="flex-shrink-0 p-4 bg-white dark:bg-slate-900 rounded-full shadow-sm">
                        {statusConfig.icon}
                    </div>
                    <div>
                        <h1 className={`text-2xl font-bold mb-2 ${statusConfig.textColor}`}>
                            {statusConfig.label}
                        </h1>
                        <p className="text-slate-600 dark:text-slate-300 text-lg">
                            {statusConfig.description}
                        </p>
                    </div>
                </div>

                {/* Site Details Card */}
                <div className="surface-card rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-100 dark:border-slate-700">
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{site.name}</h2>
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-6">
                            <Globe className="w-4 h-4" />
                            <span className="font-mono">{new URL(site.url).hostname}</span>
                        </div>

                        <a
                            href={site.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-lg hover:shadow-xl hover:-translate-y-0.5 transform"
                        >
                            Visit Official Site <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>

                    <div className="p-8 bg-slate-50/50 dark:bg-[var(--app-surface-hover)] space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Country</h3>
                                <p className="font-medium text-lg flex items-center gap-2">
                                    {site.country?.name}
                                </p>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Category</h3>
                                <p className="font-medium text-lg">
                                    {site.category?.name}
                                </p>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Last Reviewed</h3>
                                <p className="font-medium flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                    <Calendar className="w-4 h-4 text-slate-400" />
                                    {new Date(site.updatedAt).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Report Link */}
                <div className="text-center mt-8">
                    <p className="text-sm text-slate-400">
                        Is this information incorrect? <a href="#" className="underline hover:text-slate-600 dark:hover:text-slate-200">Report an issue</a>
                    </p>
                </div>

            </div>
        </div>
    );
}
