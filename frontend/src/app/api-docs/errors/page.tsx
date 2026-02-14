import { Metadata } from 'next';
import CodeBlock from '@/components/docs/CodeBlock';

export const metadata: Metadata = {
    title: 'Errors',
    description: 'Standard error response format and common error codes for the VeriLnk Enterprise API.',
};

export default function ErrorsPage() {
    return (
        <>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
                Errors
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-10">
                The VeriLnk API uses standard HTTP status codes and returns a consistent JSON error body.
            </p>

            {/* Error schema */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Error Response Format</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                    All error responses follow this structure:
                </p>
                <CodeBlock
                    code={`{
  "error": "Error Type",
  "message": "A human-readable description of what went wrong."
}`}
                    language="json"
                    title="Error Schema"
                />
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 mt-4">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Field</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Type</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">error</code></td>
                                <td className="px-4 py-3 text-slate-500">string</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Machine-readable error type (e.g. &quot;Unauthorized&quot;, &quot;Not Found&quot;)</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">message</code></td>
                                <td className="px-4 py-3 text-slate-500">string</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Human-readable explanation of the error</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">requiredScopes</code></td>
                                <td className="px-4 py-3 text-slate-500">string[]</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Only on 403 scope errors — scopes the endpoint requires</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">grantedScopes</code></td>
                                <td className="px-4 py-3 text-slate-500">string[]</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Only on 403 scope errors — scopes your key has</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">retryAfter</code></td>
                                <td className="px-4 py-3 text-slate-500">integer</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Only on 429 — seconds to wait before retrying</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* HTTP Status Codes */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">HTTP Status Codes</h2>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Code</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Error Type</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs text-green-600">200</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">—</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Success. The request was processed normally.</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs text-amber-600">400</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Bad Request</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Missing or invalid request parameters.</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs text-red-600">401</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Unauthorized</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Missing, invalid, revoked, or expired API key.</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs text-red-600">403</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Forbidden</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Valid key but missing required scope, or workspace doesn&apos;t have Enterprise plan.</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs text-amber-600">404</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Not Found</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">The requested resource (e.g. organization) was not found.</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs text-orange-600">429</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Too Many Requests</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Rate limit or burst limit exceeded.</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs text-red-600">500</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Internal Server Error</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">An unexpected error occurred. Contact support if persistent.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Common error examples */}
            <section>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Common Error Examples</h2>

                <h3 className="text-md font-semibold text-slate-900 dark:text-white mt-6 mb-2">Missing API key</h3>
                <CodeBlock
                    code={`{
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header. Use: Bearer <api_key>"
}`}
                    language="json"
                    title="401 Unauthorized"
                />

                <h3 className="text-md font-semibold text-slate-900 dark:text-white mt-6 mb-2">Invalid key format</h3>
                <CodeBlock
                    code={`{
  "error": "Unauthorized",
  "message": "Invalid API key format"
}`}
                    language="json"
                    title="401 Unauthorized"
                />

                <h3 className="text-md font-semibold text-slate-900 dark:text-white mt-6 mb-2">No Enterprise plan</h3>
                <CodeBlock
                    code={`{
  "error": "Forbidden",
  "message": "Enterprise plan required for API access"
}`}
                    language="json"
                    title="403 Forbidden"
                />

                <h3 className="text-md font-semibold text-slate-900 dark:text-white mt-6 mb-2">Missing scope</h3>
                <CodeBlock
                    code={`{
  "error": "Forbidden",
  "message": "Missing required scope(s): read:verify",
  "requiredScopes": ["read:verify"],
  "grantedScopes": ["read:directory"]
}`}
                    language="json"
                    title="403 Forbidden"
                />

                <h3 className="text-md font-semibold text-slate-900 dark:text-white mt-6 mb-2">Missing required parameter</h3>
                <CodeBlock
                    code={`{
  "error": "Bad Request",
  "message": "Missing required query parameter: url"
}`}
                    language="json"
                    title="400 Bad Request"
                />

                <h3 className="text-md font-semibold text-slate-900 dark:text-white mt-6 mb-2">Rate limit exceeded</h3>
                <CodeBlock
                    code={`{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please slow down.",
  "retryAfter": 42
}`}
                    language="json"
                    title="429 Too Many Requests"
                />

                <h3 className="text-md font-semibold text-slate-900 dark:text-white mt-6 mb-2">Server error</h3>
                <CodeBlock
                    code={`{
  "error": "Internal Server Error",
  "message": "Failed to verify URL"
}`}
                    language="json"
                    title="500 Internal Server Error"
                />
            </section>
        </>
    );
}
