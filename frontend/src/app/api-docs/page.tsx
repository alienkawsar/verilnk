import { Metadata } from 'next';
import Link from 'next/link';
import CodeBlock from '@/components/docs/CodeBlock';

export const metadata: Metadata = {
    title: 'Overview',
    description: 'Get started with the VeriLnk Enterprise API. Verify URLs, browse the trusted directory, and access organization profiles programmatically.',
};

export default function ApiDocsOverview() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            {/* Hero */}
            <div className="mb-12">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
                    VeriLnk Enterprise API
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
                    Programmatic access to VeriLnk&apos;s verification directory. Verify URLs,
                    browse approved organizations, and integrate trust signals
                    into your own applications.
                </p>
            </div>

            {/* Who is it for */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    Who is this for?
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                    The VeriLnk API is available exclusively to <strong className="text-slate-800 dark:text-slate-200">Enterprise plan</strong> subscribers.
                    Each Enterprise workspace can generate scoped API keys from the{' '}
                    <Link href="/enterprise" className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300">
                        Enterprise Dashboard
                    </Link>.
                </p>
                <div className="grid sm:grid-cols-3 gap-3">
                    {[
                        { title: 'Verify URLs', desc: 'Check if a URL is in the VeriLnk trusted directory and get its verification status.' },
                        { title: 'Browse Directory', desc: 'Search and filter verified organizations by country, category, and keyword.' },
                        { title: 'Org Profiles', desc: 'Retrieve detailed profiles of verified organizations including their sites.' },
                    ].map((card) => (
                        <div key={card.title} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                            <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-1">{card.title}</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{card.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Base URL */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    Base URL
                </h2>
                <CodeBlock
                    code="https://api.verilnk.com/api/v1"
                    language="text"
                    title="Base URL"
                />
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                    All endpoints are relative to this base URL. For local development the URL will be{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">http://localhost:3001/api/v1</code>.
                </p>
            </section>

            {/* Authentication Summary */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    Authentication
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                    All requests must include a valid API key in the{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">Authorization</code>{' '}
                    header as a Bearer token.
                </p>
                <CodeBlock
                    code={`Authorization: Bearer vlnk_your_api_key_here`}
                    language="http"
                    title="Header"
                />
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                    <Link href="/api-docs/authentication" className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300">
                        Learn more about authentication →
                    </Link>
                </p>
            </section>

            {/* Quick Start */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    Quick Start
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Verify a URL in one request:
                </p>
                <CodeBlock
                    code={`curl -X GET "https://api.verilnk.com/api/v1/verify?url=example.com" \\
  -H "Authorization: Bearer vlnk_your_api_key_here"`}
                    language="bash"
                    title="cURL"
                />
                <CodeBlock
                    code={`{
  "verified": true,
  "url": "https://example.com",
  "status": "SUCCESS",
  "site": {
    "id": "clx...",
    "name": "Example Site",
    "url": "https://example.com",
    "status": "SUCCESS",
    "category": {
      "id": "clx...",
      "name": "Technology",
      "slug": "technology"
    },
    "country": {
      "id": "clx...",
      "name": "United States",
      "code": "US"
    },
    "createdAt": "2025-01-15T08:30:00.000Z"
  },
  "organization": {
    "id": "clx...",
    "name": "Example Corp",
    "slug": "example-corp",
    "verified": true,
    "logo": "https://cdn.verilnk.com/logos/example.png"
  }
}`}
                    language="json"
                    title="Response — 200 OK"
                />
            </section>

            {/* Quick links */}
            <section>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                    Explore the API
                </h2>
                <div className="space-y-2">
                    {[
                        { label: 'Authentication & Scopes', href: '/api-docs/authentication' },
                        { label: 'Verify URL', href: '/api-docs/endpoints/verify' },
                        { label: 'Browse Directory', href: '/api-docs/endpoints/directory' },
                        { label: 'Organization Profile', href: '/api-docs/endpoints/org-profile' },
                        { label: 'Rate Limits', href: '/api-docs/rate-limits' },
                        { label: 'Error Reference', href: '/api-docs/errors' },
                    ].map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all group"
                        >
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-400">
                                {link.label}
                            </span>
                            <span className="text-slate-400 group-hover:text-blue-500 transition-colors text-xs">→</span>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
