
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, Globe, Users, Award } from 'lucide-react';

export const metadata: Metadata = {
    title: 'About Us',
    description: 'Learn about VeriLnk, the global standard for verifying official government and education websites.',
    alternates: {
        canonical: '/about',
    },
    openGraph: {
        title: 'About Us | VeriLnk',
        description: 'Learn about VeriLnk, the global standard for verifying official government and education websites.',
        type: 'website',
    },
    twitter: {
        title: 'About Us | VeriLnk',
        description: 'Learn about VeriLnk, the global standard for verifying official government and education websites.',
    }
};

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-app relative pb-20">
            {/* Background Layers */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* Hero Glow */}
                <div className="absolute top-0 left-0 w-full h-[500px] bg-blue-600/5" />

                {/* Creator Section Background (Bottom Aligned) */}
                <div className="absolute bottom-0 left-0 w-full h-[500px] bg-slate-100 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-800/50" />
            </div>

            {/* Single Content Wrapper */}
            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 space-y-24">

                {/* Hero Section */}
                <section className="text-center">
                    <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-6">
                        Securing the Digital <span className="text-blue-600 dark:text-blue-500">Trust</span>
                    </h1>
                    <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 leading-relaxed max-w-3xl mx-auto">
                        VeriLnk is the global standard for verifying official digital presences.
                        We help users distinguish authentic government, education, and healthcare websites from fraudulent copycats.
                    </p>
                </section>

                {/* Mission Grid */}
                <section>
                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/30 transition-all group shadow-sm dark:shadow-none">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6 group-hover:scale-110 transition-transform">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Authentication</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                Rigorous verification process to ensure every link on our platform is legitimate and official.
                            </p>
                        </div>
                        <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-purple-500/30 transition-all group shadow-sm dark:shadow-none">
                            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400 mb-6 group-hover:scale-110 transition-transform">
                                <Globe className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Global Reach</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                Mapping the digital infrastructure of nations worldwide, from federal ministries to local schools.
                            </p>
                        </div>
                        <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-green-500/30 transition-all group shadow-sm dark:shadow-none">
                            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-600 dark:text-green-400 mb-6 group-hover:scale-110 transition-transform">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Community Driven</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                Powered by a community of vigilant users and moderators committed to a safer internet.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Creator Section */}
                <section>
                    <div className="flex flex-col md:flex-row items-center gap-12 py-8">
                        <div className="flex-1 space-y-6 text-center md:text-left">
                            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Meet the Founder</h2>
                            <p className="text-slate-600 dark:text-slate-400 leading-loose">
                                VeriLnk was conceptualized and built by <strong className="text-slate-900 dark:text-white">Md Kawsar Alam</strong>,
                                a Programmer passionate about digital security and UX.
                                Recognizing the rise in phishing scams targeting essential services,
                                Kawsar created VeriLnk to provide a centralized source of truth.
                            </p>
                            <div className="flex justify-center md:justify-start gap-4">
                                <Link
                                    href="https://github.com/alienkawsar"
                                    className="px-5 py-2.5 surface-card hover:bg-[var(--app-surface-hover)] text-[var(--app-text-primary)] rounded-lg text-sm font-medium transition-colors"
                                >
                                    GitHub Profile
                                </Link>
                                <Link
                                    href="https://linkedin.com/in/alienkawsar"
                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
                                >
                                    Connect on LinkedIn
                                </Link>
                            </div>
                        </div>
                        <div className="relative w-64 h-64 md:w-80 md:h-80 flex-shrink-0">
                            {/* Placeholder for Creator Image - Using Generic Avatar concept or abstract shape if actual photo unavailable */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-blue-600 rounded-full blur-2xl opacity-20 animate-pulse" />
                            <div className="relative w-full h-full surface-card rounded-2xl flex items-center justify-center overflow-hidden">
                                <Award className="w-24 h-24 text-slate-400 dark:text-slate-600" />
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
