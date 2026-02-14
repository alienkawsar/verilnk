import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Enterprise Dashboard - VeriLnk',
    description: 'Manage workspaces, API keys, and multi-org analytics',
    robots: {
        index: false,
        follow: false,
    },
};

export default function EnterpriseLayout({ children }: { children: React.ReactNode }) {
    return children;
}
