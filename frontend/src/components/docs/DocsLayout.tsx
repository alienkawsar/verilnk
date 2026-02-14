'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BookOpen,
    Key,
    Search,
    Building2,
    Shield,
    AlertTriangle,
    Clock,
    Zap,
    Menu,
    X,
    ChevronRight,
    ExternalLink
} from 'lucide-react';

interface NavItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
    title: string;
    items: NavItem[];
}

const navigation: NavSection[] = [
    {
        title: 'Getting Started',
        items: [
            { label: 'Overview', href: '/api-docs', icon: BookOpen },
            { label: 'Authentication', href: '/api-docs/authentication', icon: Key },
        ]
    },
    {
        title: 'Endpoints',
        items: [
            { label: 'Verify URL', href: '/api-docs/endpoints/verify', icon: Shield },
            { label: 'Browse Directory', href: '/api-docs/endpoints/directory', icon: Search },
            { label: 'Organization Profile', href: '/api-docs/endpoints/org-profile', icon: Building2 },
        ]
    },
    {
        title: 'Reference',
        items: [
            { label: 'Rate Limits', href: '/api-docs/rate-limits', icon: Zap },
            { label: 'Errors', href: '/api-docs/errors', icon: AlertTriangle },
            { label: 'Changelog', href: '/api-docs/changelog', icon: Clock },
        ]
    }
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Close sidebar on route change
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    const isActive = (href: string) => pathname === href;

    const SidebarContent = () => (
        <>
            {/* Logo / Title */}
            <div className="px-5 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                <Link href="/" className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs mb-3 transition-colors">
                    <ChevronRight className="w-3 h-3 rotate-180" />
                    Back to VeriLnk
                </Link>
                <Link href="/api-docs" className="block">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        API Documentation
                    </h2>
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-full">
                        v1
                    </span>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-4">
                {navigation.map((section) => (
                    <div key={section.title} className="mb-6">
                        <h3 className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {section.title}
                        </h3>
                        <ul className="space-y-0.5">
                            {section.items.map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.href);
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${active
                                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                                }`}
                                        >
                                            <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
                                                }`} />
                                            {item.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800">
                <Link
                    href="/enterprise"
                    className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Enterprise Dashboard
                </Link>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-white dark:bg-slate-950">
            {/* Mobile header */}
            <div className="lg:hidden sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Open navigation"
                >
                    <Menu className="w-5 h-5" />
                </button>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">API Docs</span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-full">
                    v1
                </span>
            </div>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                        onClick={() => setSidebarOpen(false)}
                    />
                    <div className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl">
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Close navigation"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <SidebarContent />
                    </div>
                </div>
            )}

            <div className="flex">
                {/* Desktop sidebar */}
                <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-16 lg:w-64 lg:h-[calc(100vh-4rem)] lg:flex-shrink-0 lg:self-start bg-slate-50/80 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800">
                    <SidebarContent />
                </aside>

                {/* Main content */}
                <main className="flex-1 min-w-0 min-h-screen">
                    <div className="max-w-3xl mx-auto px-6 py-10 lg:py-14">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
