import { Metadata } from 'next';
import CodeBlock from '@/components/docs/CodeBlock';

export const metadata: Metadata = {
    title: 'Organization Profile',
    description: 'Retrieve a detailed public profile of a verified VeriLnk organization by slug, including its verified sites.',
};

export default function OrgProfileEndpointPage() {
    return (
        <>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
                Organization Profile
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-8">
                Retrieve the public profile of a verified organization by its slug, including all of its verified sites.
            </p>

            {/* Endpoint */}
            <div className="mb-8 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        GET
                    </span>
                    <code className="text-sm font-mono text-slate-900 dark:text-white">/api/v1/org/:slug</code>
                </div>
            </div>

            {/* Scope */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Required Scope</h2>
                <p className="text-slate-600 dark:text-slate-400">
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">read:org-profile</code>
                </p>
            </section>

            {/* Path Parameters */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Path Parameters</h2>
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
                                <td className="px-4 py-3"><code className="text-xs">slug</code></td>
                                <td className="px-4 py-3 text-slate-500">string</td>
                                <td className="px-4 py-3"><span className="text-red-500 font-semibold text-xs">Required</span></td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                    The organization&apos;s URL slug (e.g. <code className="text-xs">example-corp</code>). Case-insensitive.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Example */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Example Request</h2>
                <CodeBlock
                    code={`curl -X GET "https://api.verilnk.com/api/v1/org/example-corp" \\
  -H "Authorization: Bearer vlnk_your_api_key_here"`}
                    language="bash"
                    title="cURL"
                />
            </section>

            {/* Response — success */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Response — Success</h2>
                <CodeBlock
                    code={`{
  "organization": {
    "id": "clx2b3c4d5e6f",
    "name": "Example Corp",
    "slug": "example-corp",
    "about": "A leading technology company specializing in web infrastructure.",
    "website": "https://example.com",
    "logo": "https://cdn.verilnk.com/logos/example.png",
    "type": "COMPANY",
    "planType": "PROFESSIONAL",
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
    "category": {
      "id": "clx9f8e7d6c5b",
      "name": "Technology",
      "slug": "technology"
    },
    "verified": true,
    "createdAt": "2024-10-01T12:00:00.000Z"
  },
  "sites": [
    {
      "id": "clx1a2b3c4d5e",
      "name": "Example Website",
      "url": "https://example.com",
      "status": "SUCCESS",
      "createdAt": "2025-01-15T08:30:00.000Z"
    },
    {
      "id": "clx6f7g8h9i0j",
      "name": "Example Blog",
      "url": "https://blog.example.com",
      "status": "SUCCESS",
      "createdAt": "2025-02-01T14:15:00.000Z"
    }
  ],
  "siteCount": 2
}`}
                    language="json"
                    title="200 OK"
                />
            </section>

            {/* Response — not found */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Response — Not Found</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    Returned when the slug doesn&apos;t match any approved organization:
                </p>
                <CodeBlock
                    code={`{
  "error": "Not Found",
  "message": "Organization not found or not verified"
}`}
                    language="json"
                    title="404 Not Found"
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
                                <td className="px-4 py-3"><code className="text-xs">organization</code></td>
                                <td className="px-4 py-3 text-slate-500">object</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Full organization profile with about, website, logo, type, planType, country, state, category</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">organization.verified</code></td>
                                <td className="px-4 py-3 text-slate-500">boolean</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Always <code className="text-xs">true</code> (only approved orgs are returned)</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">sites</code></td>
                                <td className="px-4 py-3 text-slate-500">array</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Verified sites belonging to this organization (id, name, url, status, createdAt)</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3"><code className="text-xs">siteCount</code></td>
                                <td className="px-4 py-3 text-slate-500">integer</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Number of verified sites</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}
