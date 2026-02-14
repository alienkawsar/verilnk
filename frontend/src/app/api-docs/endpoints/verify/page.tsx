import { Metadata } from 'next';
import CodeBlock from '@/components/docs/CodeBlock';

export const metadata: Metadata = {
    title: 'Verify URL',
    description: 'Verify whether a URL exists in the VeriLnk trusted directory and retrieve its verification status, site details, and organization info.',
};

export default function VerifyEndpointPage() {
    return (
        <>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
                Verify URL
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-8">
                Check whether a URL is registered in the VeriLnk directory and retrieve its verification status.
            </p>

            {/* Endpoint */}
            <div className="mb-8 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        GET
                    </span>
                    <code className="text-sm font-mono text-slate-900 dark:text-white">/api/v1/verify</code>
                </div>
            </div>

            {/* Scope */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Required Scope</h2>
                <p className="text-slate-600 dark:text-slate-400">
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">read:verify</code>
                </p>
            </section>

            {/* Query Parameters */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Query Parameters</h2>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Parameter</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Type</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Required</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">url</code></td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">string</td>
                                <td className="px-4 py-3"><span className="text-red-500 font-semibold text-xs">Required</span></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                    The URL to verify. Protocol is optional — <code className="text-xs">https://</code> is assumed if omitted.
                                    Trailing slashes are stripped automatically.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Sample Request */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Example Request</h2>
                <CodeBlock
                    code={`curl -X GET "https://api.verilnk.com/api/v1/verify?url=example.com" \\
  -H "Authorization: Bearer vlnk_your_api_key_here"`}
                    language="bash"
                    title="cURL"
                />
            </section>

            {/* Response — found & verified */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Response — Verified URL</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    When the URL is found and both the site and its organization are approved:
                </p>
                <CodeBlock
                    code={`{
  "verified": true,
  "url": "https://example.com",
  "status": "SUCCESS",
  "site": {
    "id": "clx1a2b3c4d5e",
    "name": "Example Website",
    "url": "https://example.com",
    "status": "SUCCESS",
    "category": {
      "id": "clx9f8e7d6c5b",
      "name": "Technology",
      "slug": "technology"
    },
    "country": {
      "id": "clx4a5b6c7d8e",
      "name": "United States",
      "code": "US"
    },
    "createdAt": "2025-01-15T08:30:00.000Z"
  },
  "organization": {
    "id": "clx2b3c4d5e6f",
    "name": "Example Corp",
    "slug": "example-corp",
    "verified": true,
    "logo": "https://cdn.verilnk.com/logos/example.png"
  }
}`}
                    language="json"
                    title="200 OK — Verified"
                />
            </section>

            {/* Response — not found */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Response — URL Not Found</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    When the URL does not exist in the VeriLnk directory:
                </p>
                <CodeBlock
                    code={`{
  "verified": false,
  "url": "https://unknown-site.com",
  "message": "URL not found in VeriLnk directory"
}`}
                    language="json"
                    title="200 OK — Not Found"
                />
            </section>

            {/* Response fields */}
            <section>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Response Fields</h2>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
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
                                <td className="px-4 py-3"><code className="text-xs">verified</code></td>
                                <td className="px-4 py-3 text-slate-500">boolean</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                    <code className="text-xs">true</code> when both the site status is <code className="text-xs">SUCCESS</code> and the organization is <code className="text-xs">APPROVED</code>
                                </td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">url</code></td>
                                <td className="px-4 py-3 text-slate-500">string</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">The normalized URL as stored in VeriLnk</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">status</code></td>
                                <td className="px-4 py-3 text-slate-500">string</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Verification status: <code className="text-xs">SUCCESS</code>, <code className="text-xs">PENDING</code>, or <code className="text-xs">FAILED</code></td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">site</code></td>
                                <td className="px-4 py-3 text-slate-500">object</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Site details including name, URL, category, country, and creation date</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">organization</code></td>
                                <td className="px-4 py-3 text-slate-500">object | null</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Owning organization with ID, name, slug, logo, and verified flag</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">message</code></td>
                                <td className="px-4 py-3 text-slate-500">string</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Present only when the URL is not found</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}
