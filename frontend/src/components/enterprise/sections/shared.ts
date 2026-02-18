'use client';

export const ORG_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LinkRequestMethod = 'EMAIL' | 'DOMAIN' | 'SLUG' | 'ORG_ID';
export type InviteMethod = 'EMAIL' | 'USER_ID';

export const LINK_REQUEST_METHOD_OPTIONS: Array<{
    value: LinkRequestMethod;
    label: string;
    placeholder: string;
    helper: string;
}> = [
    {
        value: 'EMAIL',
        label: 'Email',
        placeholder: 'owner@organization.com',
        helper: 'Use the organization login email.'
    },
    {
        value: 'DOMAIN',
        label: 'Domain',
        placeholder: 'organization.com',
        helper: 'Use the primary organization website domain.'
    },
    {
        value: 'SLUG',
        label: 'Slug',
        placeholder: 'organization-slug',
        helper: 'Use the public organization slug.'
    },
    {
        value: 'ORG_ID',
        label: 'Organization ID',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        helper: 'Use the exact organization ID (UUID).'
    }
];

export const sectionCardClass = 'surface-card rounded-xl p-5 border border-[var(--app-border)]';
export const sectionTitleClass = 'text-lg font-semibold text-slate-900 dark:text-white';
export const searchInputClass =
    'w-full px-4 py-2.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-primary)] placeholder-[var(--app-text-secondary)]/50 focus:ring-2 focus:ring-[#187DE9]/40 focus:outline-none';
export const secondaryButtonClass =
    'text-sm rounded-lg border border-[var(--app-border)] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors';
export const tableWrapperClass = 'surface-card rounded-xl border border-[var(--app-border)] overflow-hidden';
export const tableHeadClass =
    'bg-slate-50/80 dark:bg-slate-800/50 border-b border-[var(--app-border)] text-xs font-semibold uppercase tracking-wider text-slate-500';
export const tableRowClass = 'border-t border-[var(--app-border)] hover:bg-[var(--app-surface-hover)]';

export const statusBadgeClass = (status: string) => {
    const normalized = status.toUpperCase();
    if (normalized.includes('ACTIVE') || normalized.includes('APPROVED') || normalized.includes('ACCEPTED')) {
        return 'rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
    }
    if (normalized.includes('PENDING') || normalized.includes('REVIEW')) {
        return 'rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
    }
    if (normalized.includes('DENIED') || normalized.includes('REVOKED') || normalized.includes('SUSPENDED')) {
        return 'rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300';
    }
    return 'rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300';
};

export const emptyStateIconClass = 'w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4';

