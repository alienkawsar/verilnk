import { Metadata } from 'next';
import CodeBlock from '@/components/docs/CodeBlock';

export const metadata: Metadata = {
    title: 'Browse Directory',
    description: 'Search and filter verified organizations and sites in the VeriLnk directory with pagination, country, category, and keyword filters.',
};

export default function DirectoryEndpointPage() {
    return (
        <>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
                Browse Directory
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-8">
                Search and filter verified sites in the VeriLnk directory. Results are paginated and include only approved organizations with verified sites.
            </p>

            {/* Endpoint */}
            <div className="mb-8 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        GET
                    </span>
                    <code className="text-sm font-mono text-slate-900 dark:text-white">/api/v1/directory</code>
                </div>
            </div>

            {/* Scope */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Required Scope</h2>
                <p className="text-slate-600 dark:text-slate-400">
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">read:directory</code>
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
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Default</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">country</code></td>
                                <td className="px-4 py-3 text-slate-500">string</td>
                                <td className="px-4 py-3 text-slate-500">—</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">ISO 3166-1 alpha-2 country code (e.g. <code className="text-xs">US</code>, <code className="text-xs">BD</code>)</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">category</code></td>
                                <td className="px-4 py-3 text-slate-500">string</td>
                                <td className="px-4 py-3 text-slate-500">—</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Category slug (e.g. <code className="text-xs">technology</code>, <code className="text-xs">finance</code>)</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">search</code></td>
                                <td className="px-4 py-3 text-slate-500">string</td>
                                <td className="px-4 py-3 text-slate-500">—</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Free-text search across site name and URL (case-insensitive)</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">page</code></td>
                                <td className="px-4 py-3 text-slate-500">integer</td>
                                <td className="px-4 py-3 text-slate-500"><code className="text-xs">1</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Page number (1-indexed)</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">limit</code></td>
                                <td className="px-4 py-3 text-slate-500">integer</td>
                                <td className="px-4 py-3 text-slate-500"><code className="text-xs">20</code></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Results per page (min 1, max 100)</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Sample Request */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Example Requests</h2>
                <CodeBlock
                    code={`# Basic listing
curl -X GET "https://api.verilnk.com/api/v1/directory" \\
  -H "Authorization: Bearer vlnk_your_api_key_here"

# With filters
curl -X GET "https://api.verilnk.com/api/v1/directory?country=US&category=technology&page=1&limit=10" \\
  -H "Authorization: Bearer vlnk_your_api_key_here"

# Search by keyword
curl -X GET "https://api.verilnk.com/api/v1/directory?search=stripe&limit=5" \\
  -H "Authorization: Bearer vlnk_your_api_key_here"`}
                    language="bash"
                    title="cURL"
                />
            </section>

            {/* Response */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Response</h2>
                <CodeBlock
                    code={`{
  "sites": [
    {
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
      "state": {
        "id": "clx7g8h9i0j1k",
        "name": "California",
        "code": "CA"
      },
      "organization": {
        "id": "clx2b3c4d5e6f",
        "name": "Example Corp",
        "slug": "example-corp",
        "logo": "https://cdn.verilnk.com/logos/example.png"
      },
      "createdAt": "2025-01-15T08:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8
  }
}`}
                    language="json"
                    title="200 OK"
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
                                <td className="px-4 py-3"><code className="text-xs">sites</code></td>
                                <td className="px-4 py-3 text-slate-500">array</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Array of verified site objects with category, country, state, and organization</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">sites[].state</code></td>
                                <td className="px-4 py-3 text-slate-500">object | null</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">State/province with id, name, and code (may be null)</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">sites[].organization</code></td>
                                <td className="px-4 py-3 text-slate-500">object | null</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Owning organization with id, name, slug, and logo</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">pagination.page</code></td>
                                <td className="px-4 py-3 text-slate-500">integer</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Current page number</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">pagination.limit</code></td>
                                <td className="px-4 py-3 text-slate-500">integer</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Items per page</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">pagination.total</code></td>
                                <td className="px-4 py-3 text-slate-500">integer</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Total number of matching sites</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">pagination.totalPages</code></td>
                                <td className="px-4 py-3 text-slate-500">integer</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Total number of pages</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}
