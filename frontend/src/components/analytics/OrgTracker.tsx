'use client';

import { useEffect } from 'react';
import { trackView } from '@/lib/api';

export default function OrgTracker({ orgId }: { orgId: string }) {
    useEffect(() => {
        // Debounce or just fire? Fire once on mount.
        // In strict mode dev, fires twice. That's fine for now, or use ref to prevent.
        const tracked = sessionStorage.getItem(`viewed_org_${orgId}`);
        if (!tracked) {
            trackView(orgId).catch(console.error);
            sessionStorage.setItem(`viewed_org_${orgId}`, 'true');
        }
    }, [orgId]);

    return null;
}
