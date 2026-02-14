import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, CheckCircle, Eye, FileSearch, AlertTriangle, ClipboardList, BadgeCheck, MessageCircleWarning } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Verification Process',
    description: 'Learn how VeriLnk manually verifies official websites and organizations to protect users from phishing and misinformation.',
    alternates: {
        canonical: '/verification-process',
    },
    openGraph: {
        title: 'Verification Process | VeriLnk',
        description: 'Understand the manual verification steps behind VeriLnk’s trusted directory.',
        type: 'website',
    },
    twitter: {
        title: 'Verification Process | VeriLnk',
        description: 'Understand the manual verification steps behind VeriLnk’s trusted directory.'
    }
};

export default function VerificationProcessPage() {
    const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.NODE_ENV === 'production' ? 'https://verilnk.com' : 'http://localhost:3000');

    const jsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Verification Process",
        "description": "Learn how VeriLnk manually verifies official websites and organizations to protect users from phishing and misinformation.",
        "url": `${siteUrl}/verification-process`
    });

    return (
        <div className="min-h-screen text-slate-800 dark:text-slate-200">
            <section className="relative py-20 overflow-hidden border-b border-slate-200 dark:border-slate-800">
                <div className="absolute inset-0 bg-blue-500/5 -z-10" />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider">
                        <ShieldCheck className="w-4 h-4" />
                        Manual Verification
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white">
                        How VeriLnk Verifies Official Websites
                    </h1>
                    <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                        Every organization listed on VeriLnk is reviewed by humans. We never auto‑approve.
                        This protects people from impersonation, phishing, and fake domains.
                    </p>
                </div>
            </section>

            <section className="py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <Eye className="w-5 h-5 text-blue-500" />
                            Why VeriLnk verifies sites
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                            Official‑looking websites are often used to steal information or redirect users.
                            VeriLnk verifies legitimacy so people can trust what they click.
                        </p>
                    </div>
                    <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <BadgeCheck className="w-5 h-5 text-emerald-500" />
                            What is considered “official”
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                            We verify ownership and authenticity. Official means the domain is controlled by the
                            real organization or agency and matches its public identity.
                        </p>
                    </div>
                </div>
            </section>

            <section className="py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-6">
                    {[
                        { icon: FileSearch, title: 'How organizations get listed', text: 'All submissions are manually reviewed. No auto‑approval, ever.' },
                        { icon: ClipboardList, title: 'Review steps', text: 'Domain checks, identity verification, policy validation, and risk screening.' },
                        { icon: CheckCircle, title: 'What the verified badge means', text: 'Verified entities passed our review and are actively monitored.' },
                    ].map(({ icon: Icon, title, text }) => (
                        <div key={title} className="bg-white dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <Icon className="w-6 h-6 text-blue-500 mb-3" />
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{text}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
                    <div className="bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-8">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">How updates and changes are handled</h2>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            Updates to critical details (like official domains) are routed through our Request Hub and Review Queue.
                            Changes are reviewed by admins before being approved and published.
                        </p>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-8">
                        <h3 className="text-xl font-bold text-amber-900 dark:text-amber-300 mb-3 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Limitations
                        </h3>
                        <ul className="list-disc pl-5 space-y-2 text-amber-900/80 dark:text-amber-200/80 text-sm">
                            <li>No system is perfect — always verify critical information.</li>
                            <li>If something looks suspicious, please report it immediately.</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="py-12 border-t border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-6">
                    <Link href="/search" className="group bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:border-blue-400 transition-colors">
                        <MessageCircleWarning className="w-6 h-6 text-blue-500 mb-3" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 group-hover:text-blue-600">Report a website</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Flag suspicious or incorrect listings.</p>
                    </Link>
                    <Link href="/dashboard" className="group bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:border-blue-400 transition-colors">
                        <ClipboardList className="w-6 h-6 text-emerald-500 mb-3" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 group-hover:text-emerald-600">Recommend a website</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Submit an official site for review.</p>
                    </Link>
                    <Link href="/pricing" className="group bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:border-blue-400 transition-colors">
                        <ShieldCheck className="w-6 h-6 text-purple-500 mb-3" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 group-hover:text-purple-600">Organization signup</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Create or upgrade your organization profile.</p>
                    </Link>
                </div>
            </section>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: jsonLd }}
            />
        </div>
    );
}
