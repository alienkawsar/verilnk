import { Metadata } from 'next';
import CodeBlock from '@/components/docs/CodeBlock';

export const metadata: Metadata = {
    title: 'Rate Limits',
    description: 'Understand VeriLnk API rate limits, response headers, and best practices for handling 429 Too Many Requests errors.',
};

export default function RateLimitsPage() {
    return (
        <>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
                Rate Limits
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-10">
                Rate limits protect the API from abuse and ensure fair usage. Every API key is subject to both per-minute and burst limits.
            </p>

            {/* Limits table */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Current Limits</h2>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Limit Type</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Window</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Max Requests</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            <tr>
                                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">Standard</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">1 minute</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">100</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">Burst</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">5 seconds</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">20</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                    Limits are applied per API key. Each key has its own independent counters.
                </p>
            </section>

            {/* Response headers */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Rate Limit Headers</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                    Every API response includes these headers to help you track your usage:
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Header</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">X-RateLimit-Limit</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Maximum requests per minute (always <code className="text-xs">100</code>)</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">X-RateLimit-Remaining</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Requests remaining in the current window</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">X-RateLimit-Reset</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Seconds until the rate limit window resets</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 429 response */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Handling 429 Responses</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                    When you exceed the rate limit, the API returns <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">429 Too Many Requests</code>:
                </p>
                <CodeBlock
                    code={`{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please slow down.",
  "retryAfter": 42
}`}
                    language="json"
                    title="429 Too Many Requests"
                />
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                    The <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">retryAfter</code> field indicates how many seconds to wait before retrying.
                </p>
            </section>

            {/* Best practices */}
            <section>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Best Practices</h2>
                <ul className="space-y-3 text-slate-600 dark:text-slate-400">
                    <li className="flex gap-3">
                        <span className="mt-0.5 text-blue-500 font-bold">1.</span>
                        <span><strong className="text-slate-800 dark:text-slate-200">Monitor headers</strong> — Check <code className="text-xs">X-RateLimit-Remaining</code> and slow down before hitting zero.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="mt-0.5 text-blue-500 font-bold">2.</span>
                        <span><strong className="text-slate-800 dark:text-slate-200">Exponential backoff</strong> — On 429, wait for <code className="text-xs">retryAfter</code> seconds, then retry with increasing delays (e.g. 1s, 2s, 4s).</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="mt-0.5 text-blue-500 font-bold">3.</span>
                        <span><strong className="text-slate-800 dark:text-slate-200">Spread requests</strong> — Avoid firing many requests in a short burst. Space them evenly across the minute window.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="mt-0.5 text-blue-500 font-bold">4.</span>
                        <span><strong className="text-slate-800 dark:text-slate-200">Cache responses</strong> — Verification results don&apos;t change frequently. Cache responses on your side for 5–15 minutes to reduce API calls.</span>
                    </li>
                </ul>
            </section>
        </>
    );
}
