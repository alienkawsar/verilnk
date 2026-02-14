import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Organization Dashboard',
    robots: {
        index: false,
        follow: false,
    },
};

export default function OrgDashboardLayout({ children }: { children: React.ReactNode }) {
    return children;
}
