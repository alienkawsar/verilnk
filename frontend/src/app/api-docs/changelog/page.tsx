import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Changelog',
    description: 'Release history and versioning information for the VeriLnk Enterprise API.',
};

export default function ChangelogPage() {
    return (
        <>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
                Changelog
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-10">
                Track API changes, new features, and breaking changes. The API follows semantic versioning — the current version is <strong className="text-slate-800 dark:text-slate-200">v1</strong>.
            </p>

            {/* Versioning */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Versioning</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                    The API version is included in the URL path: <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">/api/v1/...</code>
                </p>
                <ul className="space-y-2 text-slate-600 dark:text-slate-400 text-sm">
                    <li className="flex gap-2">
                        <span className="text-slate-400">•</span>
                        <strong className="text-slate-800 dark:text-slate-200">Major</strong> version changes (v1 → v2) may include breaking changes. The previous version will remain available during a deprecation period.
                    </li>
                    <li className="flex gap-2">
                        <span className="text-slate-400">•</span>
                        <strong className="text-slate-800 dark:text-slate-200">Minor</strong> additions (new fields, new endpoints) are added without a version bump and are always backward-compatible.
                    </li>
                </ul>
            </section>

            {/* Changelog entries */}
            <section>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Release History</h2>

                <div className="relative border-l-2 border-slate-200 dark:border-slate-800 pl-6 space-y-10">
                    {/* v1.0 */}
                    <div className="relative">
                        <div className="absolute -left-8 top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-white dark:border-slate-950"></div>
                        <div className="mb-2 flex items-center gap-3">
                            <span className="px-2.5 py-1 text-xs font-bold uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                                v1.0
                            </span>
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                                February 2026
                            </span>
                        </div>
                        <h3 className="text-md font-semibold text-slate-900 dark:text-white mb-2">
                            Initial Release
                        </h3>
                        <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                            <li className="flex gap-2">
                                <span className="mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">new</span>
                                <span><code className="text-xs">GET /api/v1/verify</code> — Verify URL status and retrieve site/org details</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">new</span>
                                <span><code className="text-xs">GET /api/v1/directory</code> — Browse verified directory with filters and pagination</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">new</span>
                                <span><code className="text-xs">GET /api/v1/org/:slug</code> — Retrieve organization public profile</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">new</span>
                                <span><code className="text-xs">GET /api/v1/categories</code> — List available categories</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">new</span>
                                <span><code className="text-xs">GET /api/v1/countries</code> — List supported countries</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">feature</span>
                                <span>API key authentication with scoped permissions</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">feature</span>
                                <span>Rate limiting (100/min, 20/5s burst) with response headers</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">feature</span>
                                <span>Enterprise workspace management with API key create, rotate, and revoke</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </section>
        </>
    );
}
