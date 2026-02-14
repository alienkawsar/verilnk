import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Organization Upgrade',
    robots: {
        index: false,
        follow: false,
    },
};

export default function OrgUpgradeLayout({ children }: { children: React.ReactNode }) {
    return children;
}
