import { Metadata } from 'next';
import Link from 'next/link';
import CodeBlock from '@/components/docs/CodeBlock';

export const metadata: Metadata = {
    title: 'Authentication',
    description: 'Learn how to authenticate with the VeriLnk Enterprise API using Bearer tokens, manage API key scopes, and keep your keys secure.',
};

export default function AuthenticationPage() {
    return (
        <>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">
                Authentication
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-10">
                The VeriLnk API uses API keys for authentication. Every request must include a valid key in the Authorization header.
            </p>

            {/* Bearer Token */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    Using your API key
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Include your API key as a Bearer token in the <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">Authorization</code> header:
                </p>
                <CodeBlock
                    code={`curl -X GET "https://api.verilnk.com/api/v1/verify?url=example.com" \\
  -H "Authorization: Bearer vlnk_abc123def456..."`}
                    language="bash"
                />
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                    All API keys start with the prefix <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">vlnk_</code> followed by 64 hex characters (total length: 69 characters).
                </p>
            </section>

            {/* Where to generate */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    Generating API keys
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                    API keys are created in the{' '}
                    <Link href="/enterprise" className="text-blue-600 dark:text-blue-400 underline underline-offset-2">Enterprise Dashboard</Link>{' '}
                    under the <strong className="text-slate-800 dark:text-slate-200">API Keys</strong> tab of your workspace.
                </p>
                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/10 text-sm">
                    <p className="font-semibold text-amber-800 dark:text-amber-400 mb-1">⚠️ Important</p>
                    <p className="text-amber-700 dark:text-amber-300/80">
                        The plain-text key is shown <strong>only once</strong> when created. Copy it immediately — it cannot be retrieved later.
                        If lost, rotate the key to generate a new one.
                    </p>
                </div>
            </section>

            {/* Scopes */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    Scopes
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                    Each API key is granted one or more scopes that control which endpoints it can access.
                    Assign only the scopes your integration needs.
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Scope</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Endpoints</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            <tr>
                                <td className="px-4 py-3">
                                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">read:verify</code>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                    <code className="text-xs">/verify</code>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Verify whether a URL exists in the VeriLnk directory</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3">
                                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">read:directory</code>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                    <code className="text-xs">/directory</code>,{' '}
                                    <code className="text-xs">/categories</code>,{' '}
                                    <code className="text-xs">/countries</code>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Browse and search organizations in the directory</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3">
                                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">read:org-profile</code>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                    <code className="text-xs">/org/:slug</code>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Retrieve detailed profile of a specific organization</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Key Safety */}
            <section className="mb-10">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    Key safety best practices
                </h2>
                <ul className="space-y-3 text-slate-600 dark:text-slate-400">
                    <li className="flex gap-3">
                        <span className="mt-0.5 text-green-500 font-bold">✓</span>
                        <span>Store keys in environment variables or a secrets manager — <strong className="text-slate-800 dark:text-slate-200">never</strong> hard-code them in source files.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="mt-0.5 text-green-500 font-bold">✓</span>
                        <span>Use the <strong className="text-slate-800 dark:text-slate-200">minimum scopes</strong> needed. Keys with fewer permissions limit the impact of a leak.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="mt-0.5 text-green-500 font-bold">✓</span>
                        <span><strong className="text-slate-800 dark:text-slate-200">Rotate keys</strong> regularly. Rotation is instant and revokes the old key immediately.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="mt-0.5 text-red-500 font-bold">✗</span>
                        <span>Do not share keys between applications. Create a separate key for each integration.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="mt-0.5 text-red-500 font-bold">✗</span>
                        <span>Never expose keys in client-side code, browser requests, or public repositories.</span>
                    </li>
                </ul>
            </section>

            {/* Failed auth example */}
            <section>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    Authentication errors
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                    If the key is missing, malformed, revoked, or expired, the API returns <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">401 Unauthorized</code>:
                </p>
                <CodeBlock
                    code={`{
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header. Use: Bearer <api_key>"
}`}
                    language="json"
                    title="401 Unauthorized"
                />
                <p className="text-slate-600 dark:text-slate-400 mt-4 mb-3">
                    If the key is valid but lacks the required scope, you&apos;ll receive <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">403 Forbidden</code>:
                </p>
                <CodeBlock
                    code={`{
  "error": "Forbidden",
  "message": "Missing required scope(s): read:verify",
  "requiredScopes": ["read:verify"],
  "grantedScopes": ["read:directory"]
}`}
                    language="json"
                    title="403 Forbidden — Missing Scope"
                />
            </section>
        </>
    );
}
