import DocsLayout from '@/components/docs/DocsLayout';

export const metadata = {
    title: {
        template: '%s | VeriLnk API Docs',
        default: 'VeriLnk API Documentation',
    },
    description: 'Official API documentation for VeriLnk Enterprise. Verify URLs, browse the directory, and access organization profiles programmatically.',
    robots: { index: true, follow: true },
};

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
    return <DocsLayout>{children}</DocsLayout>;
}
