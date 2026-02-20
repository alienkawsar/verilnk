'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BarChart3,
    Download,
    FileText,
    Loader2,
    Pencil,
    Receipt,
    Search,
    X
} from 'lucide-react';
import {
    downloadAdminBillingInvoicePdf,
    exportAdminBillingInvoicesCsv,
    exportAdminBillingSubscriptionsCsv,
    fetchAdminBillingInvoices,
    fetchAdminBillingOverview,
    fetchAdminBillingSubscriptions,
    updateAdminBillingInvoice,
    type AdminBillingInvoiceRow,
    type AdminBillingInvoicesQuery,
    type AdminBillingOverviewResponse,
    type AdminBillingSubscriptionRow,
    type AdminBillingSubscriptionsQuery,
    type AdminBillingTerm
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { CardSkeleton, TableSkeleton } from '@/components/ui/Loading';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrencyFromCents } from '@/lib/currency';

const INVOICE_STATUS_OPTIONS: Array<{
    value: AdminBillingInvoicesQuery['status'] | '';
    label: string;
}> = [
    { value: '', label: 'All Statuses' },
    { value: 'DRAFT', label: 'DRAFT' },
    { value: 'OPEN', label: 'OPEN' },
    { value: 'PAID', label: 'PAID' },
    { value: 'VOID', label: 'VOID' },
    { value: 'REFUNDED', label: 'REFUNDED' }
];

const SUBSCRIPTION_STATUS_OPTIONS: Array<{
    value: AdminBillingSubscriptionsQuery['status'] | '';
    label: string;
}> = [
    { value: '', label: 'All Statuses' },
    { value: 'ACTIVE', label: 'ACTIVE' },
    { value: 'TRIALING', label: 'TRIALING' },
    { value: 'PAST_DUE', label: 'PAST_DUE' },
    { value: 'EXPIRED', label: 'EXPIRED' },
    { value: 'CANCELED', label: 'CANCELED' }
];

const PLAN_OPTIONS: Array<{
    value: AdminBillingInvoicesQuery['plan'] | '';
    label: string;
}> = [
    { value: '', label: 'All Plans' },
    { value: 'BASIC', label: 'BASIC' },
    { value: 'PRO', label: 'PRO' },
    { value: 'BUSINESS', label: 'BUSINESS' },
    { value: 'ENTERPRISE', label: 'ENTERPRISE' }
];

const TERM_OPTIONS: Array<{ value: AdminBillingTerm | ''; label: string }> = [
    { value: '', label: 'All Terms' },
    { value: 'MONTHLY', label: 'MONTHLY' },
    { value: 'ANNUAL', label: 'ANNUAL' }
];

const INVOICE_RANGE_OPTIONS: Array<{ value: AdminBillingInvoicesQuery['rangeDays']; label: string }> = [
    { value: undefined, label: 'All Dates' },
    { value: 7, label: 'Last 7 Days' },
    { value: 30, label: 'Last 30 Days' },
    { value: 90, label: 'Last 90 Days' }
];

const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return 'N/A';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString();
};

const formatCurrency = (amountCents: number | null | undefined, currency: string = 'USD') => {
    if (amountCents === null || amountCents === undefined) return 'N/A';
    return formatCurrencyFromCents(amountCents, currency);
};

const invoiceStatusBadgeClass = (status: string) => {
    if (status === 'PAID') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    if (status === 'OPEN' || status === 'DRAFT') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    if (status === 'VOID' || status === 'REFUNDED') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
    return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
};

const subscriptionStatusBadgeClass = (status: string) => {
    if (status === 'ACTIVE' || status === 'TRIALING') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    if (status === 'PAST_DUE') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    if (status === 'EXPIRED' || status === 'CANCELED') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
    return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
};

const inputClassName = 'w-full bg-transparent border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--app-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/30';

const KpiCard = ({ title, value, hint }: { title: string; value: string; hint?: string }) => (
    <div className="surface-card rounded-xl border border-[var(--app-border)] p-4">
        <div className="text-xs text-[var(--app-text-secondary)] uppercase tracking-wide">{title}</div>
        <div className="mt-2 text-xl font-semibold text-[var(--app-text-primary)]">{value}</div>
        {hint ? <div className="mt-1 text-xs text-[var(--app-text-secondary)]">{hint}</div> : null}
    </div>
);

export default function BillingSection() {
    const { showToast } = useToast();

    const [overview, setOverview] = useState<AdminBillingOverviewResponse | null>(null);
    const [overviewLoading, setOverviewLoading] = useState(true);

    const [subscriptions, setSubscriptions] = useState<AdminBillingSubscriptionRow[]>([]);
    const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
    const [subscriptionsPagination, setSubscriptionsPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

    const [invoices, setInvoices] = useState<AdminBillingInvoiceRow[]>([]);
    const [invoicesLoading, setInvoicesLoading] = useState(true);
    const [invoicesPagination, setInvoicesPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

    const [subSearch, setSubSearch] = useState('');
    const [subPlan, setSubPlan] = useState<AdminBillingSubscriptionsQuery['plan']>();
    const [subTerm, setSubTerm] = useState<AdminBillingTerm | undefined>();
    const [subStatus, setSubStatus] = useState<AdminBillingSubscriptionsQuery['status']>();
    const [subStartDate, setSubStartDate] = useState('');
    const [subEndDate, setSubEndDate] = useState('');
    const [subPage, setSubPage] = useState(1);
    const [subLimit, setSubLimit] = useState(20);

    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoicePlan, setInvoicePlan] = useState<AdminBillingInvoicesQuery['plan']>();
    const [invoiceTerm, setInvoiceTerm] = useState<AdminBillingTerm | undefined>();
    const [invoiceStatus, setInvoiceStatus] = useState<AdminBillingInvoicesQuery['status']>();
    const [invoiceRangeDays, setInvoiceRangeDays] = useState<AdminBillingInvoicesQuery['rangeDays']>(30);
    const [invoicePage, setInvoicePage] = useState(1);
    const [invoiceLimit, setInvoiceLimit] = useState(20);

    const [editingInvoice, setEditingInvoice] = useState<AdminBillingInvoiceRow | null>(null);
    const [editStatus, setEditStatus] = useState<AdminBillingInvoiceRow['status']>('OPEN');
    const [editInternalNote, setEditInternalNote] = useState('');
    const [invoiceSaving, setInvoiceSaving] = useState(false);
    const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

    const debouncedSubSearch = useDebounce(subSearch, 300);
    const debouncedInvoiceSearch = useDebounce(invoiceSearch, 300);

    const loadOverview = useCallback(async () => {
        setOverviewLoading(true);
        try {
            const response = await fetchAdminBillingOverview();
            setOverview(response);
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to load billing overview', 'error');
        } finally {
            setOverviewLoading(false);
        }
    }, [showToast]);

    const subscriptionQuery = useMemo<AdminBillingSubscriptionsQuery>(() => ({
        search: debouncedSubSearch || undefined,
        plan: subPlan,
        billingTerm: subTerm,
        status: subStatus,
        startDate: subStartDate || undefined,
        endDate: subEndDate || undefined,
        page: subPage,
        limit: subLimit
    }), [debouncedSubSearch, subPlan, subTerm, subStatus, subStartDate, subEndDate, subPage, subLimit]);

    const invoiceQuery = useMemo<AdminBillingInvoicesQuery>(() => ({
        search: debouncedInvoiceSearch || undefined,
        plan: invoicePlan,
        billingTerm: invoiceTerm,
        status: invoiceStatus,
        rangeDays: invoiceRangeDays,
        page: invoicePage,
        limit: invoiceLimit
    }), [debouncedInvoiceSearch, invoicePlan, invoiceTerm, invoiceStatus, invoiceRangeDays, invoicePage, invoiceLimit]);

    const loadSubscriptions = useCallback(async () => {
        setSubscriptionsLoading(true);
        try {
            const response = await fetchAdminBillingSubscriptions(subscriptionQuery);
            setSubscriptions(response.subscriptions || []);
            setSubscriptionsPagination(response.pagination);
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to load subscriptions', 'error');
            setSubscriptions([]);
        } finally {
            setSubscriptionsLoading(false);
        }
    }, [showToast, subscriptionQuery]);

    const loadInvoices = useCallback(async () => {
        setInvoicesLoading(true);
        try {
            const response = await fetchAdminBillingInvoices(invoiceQuery);
            setInvoices(response.invoices || []);
            setInvoicesPagination(response.pagination);
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to load invoices', 'error');
            setInvoices([]);
        } finally {
            setInvoicesLoading(false);
        }
    }, [showToast, invoiceQuery]);

    useEffect(() => {
        loadOverview();
    }, [loadOverview]);

    useEffect(() => {
        loadSubscriptions();
    }, [loadSubscriptions]);

    useEffect(() => {
        loadInvoices();
    }, [loadInvoices]);

    const mrrLabel = overview?.mrrCents === null ? 'N/A' : formatCurrency(overview?.mrrCents, 'USD');
    const arrLabel = overview?.arrCents === null ? 'N/A' : formatCurrency(overview?.arrCents, 'USD');

    const handleDownloadInvoice = async (invoice: AdminBillingInvoiceRow) => {
        setDownloadingInvoiceId(invoice.id);
        try {
            await downloadAdminBillingInvoicePdf(invoice.id, {
                organizationName: invoice.organization.name,
                organizationId: invoice.organization.id,
                invoiceNumber: invoice.invoiceNumber,
                invoiceDate: invoice.issuedAt
            });
            showToast('Invoice PDF downloaded', 'success');
        } catch (error: any) {
            showToast(error?.message || 'Failed to download invoice PDF', 'error');
        } finally {
            setDownloadingInvoiceId(null);
        }
    };

    const openEditInvoice = (invoice: AdminBillingInvoiceRow) => {
        setEditingInvoice(invoice);
        setEditStatus(invoice.status);
        setEditInternalNote(invoice.internalNote || '');
    };

    const closeEditInvoice = () => {
        setEditingInvoice(null);
        setInvoiceSaving(false);
    };

    const handleSaveInvoice = async () => {
        if (!editingInvoice) return;
        if (editInternalNote.length > 2000) {
            showToast('Internal note must be 2000 characters or less', 'error');
            return;
        }

        setInvoiceSaving(true);
        try {
            await updateAdminBillingInvoice(editingInvoice.id, {
                status: editStatus,
                internalNote: editInternalNote.trim() ? editInternalNote : null
            });
            showToast('Invoice updated successfully', 'success');
            closeEditInvoice();
            await Promise.all([loadInvoices(), loadOverview()]);
        } catch (error: any) {
            showToast(error?.response?.data?.message || 'Failed to update invoice', 'error');
            setInvoiceSaving(false);
        }
    };

    const exportSubscriptions = async () => {
        try {
            await exportAdminBillingSubscriptionsCsv({
                search: debouncedSubSearch || undefined,
                plan: subPlan,
                billingTerm: subTerm,
                status: subStatus,
                startDate: subStartDate || undefined,
                endDate: subEndDate || undefined
            });
            showToast('Subscription export downloaded', 'success');
        } catch (error: any) {
            showToast(error?.message || 'Failed to export subscriptions', 'error');
        }
    };

    const exportInvoices = async () => {
        try {
            await exportAdminBillingInvoicesCsv({
                search: debouncedInvoiceSearch || undefined,
                plan: invoicePlan,
                billingTerm: invoiceTerm,
                status: invoiceStatus,
                rangeDays: invoiceRangeDays
            });
            showToast('Invoice export downloaded', 'success');
        } catch (error: any) {
            showToast(error?.message || 'Failed to export invoices', 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[var(--app-text-primary)]">Sales & Billing Dashboard</h2>
                        <p className="text-xs text-[var(--app-text-secondary)]">Enterprise billing operations console (read-only analytics + safe invoice edits).</p>
                    </div>
                </div>
            </div>

            {overviewLoading ? (
                <CardSkeleton count={4} />
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <KpiCard title="MRR" value={mrrLabel} hint="Monthly recurring revenue" />
                        <KpiCard title="ARR" value={arrLabel} hint="Annual recurring revenue" />
                        <KpiCard
                            title="New Paid Organizations"
                            value={`${overview?.newPaidOrganizations.last7Days || 0} / ${overview?.newPaidOrganizations.last30Days || 0}`}
                            hint="7 days / 30 days"
                        />
                        <KpiCard
                            title="Failed / Void Payments"
                            value={`${overview?.failedVoidPayments.total || 0}`}
                            hint={`Failed ${overview?.failedVoidPayments.failedPayments || 0} + Void ${overview?.failedVoidPayments.voidInvoices || 0}`}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="surface-card rounded-xl border border-[var(--app-border)] p-4">
                            <div className="text-xs text-[var(--app-text-secondary)] uppercase tracking-wide">Active Subscriptions by Plan</div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                <div className="flex justify-between"><span>BASIC</span><span className="font-medium">{overview?.activeSubscriptionsByPlan.BASIC || 0}</span></div>
                                <div className="flex justify-between"><span>PRO</span><span className="font-medium">{overview?.activeSubscriptionsByPlan.PRO || 0}</span></div>
                                <div className="flex justify-between"><span>BUSINESS</span><span className="font-medium">{overview?.activeSubscriptionsByPlan.BUSINESS || 0}</span></div>
                                <div className="flex justify-between"><span>ENTERPRISE</span><span className="font-medium">{overview?.activeSubscriptionsByPlan.ENTERPRISE || 0}</span></div>
                            </div>
                        </div>

                        <div className="surface-card rounded-xl border border-[var(--app-border)] p-4">
                            <div className="text-xs text-[var(--app-text-secondary)] uppercase tracking-wide">Active Subscriptions by Billing Term</div>
                            <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                                <div className="flex justify-between"><span>MONTHLY</span><span className="font-medium">{overview?.activeSubscriptionsByBillingTerm.MONTHLY || 0}</span></div>
                                <div className="flex justify-between"><span>ANNUAL</span><span className="font-medium">{overview?.activeSubscriptionsByBillingTerm.ANNUAL || 0}</span></div>
                            </div>
                        </div>

                        <div className="surface-card rounded-xl border border-[var(--app-border)] p-4">
                            <div className="text-xs text-[var(--app-text-secondary)] uppercase tracking-wide">Renewals Due</div>
                            <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                                <div className="flex justify-between"><span>Next 30 Days</span><span className="font-medium">{overview?.renewalsDue.next30Days || 0}</span></div>
                                <div className="flex justify-between"><span>Next 60 Days</span><span className="font-medium">{overview?.renewalsDue.next60Days || 0}</span></div>
                                <div className="flex justify-between"><span>Next 90 Days</span><span className="font-medium">{overview?.renewalsDue.next90Days || 0}</span></div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="surface-card rounded-xl border border-[var(--app-border)] p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h3 className="text-base font-semibold text-[var(--app-text-primary)]">Subscriptions</h3>
                        <p className="text-xs text-[var(--app-text-secondary)]">Read-only list of active and historical subscriptions.</p>
                    </div>
                    <button
                        type="button"
                        onClick={exportSubscriptions}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
                    >
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-6 gap-3">
                    <div className="xl:col-span-2 relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]" />
                        <input
                            value={subSearch}
                            onChange={(event) => {
                                setSubSearch(event.target.value);
                                setSubPage(1);
                            }}
                            placeholder="Search organization"
                            className={`${inputClassName} pl-9`}
                        />
                    </div>
                    <select
                        value={subPlan || ''}
                        onChange={(event) => {
                            setSubPlan((event.target.value || undefined) as AdminBillingSubscriptionsQuery['plan']);
                            setSubPage(1);
                        }}
                        className={inputClassName}
                    >
                        {PLAN_OPTIONS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}
                    </select>
                    <select
                        value={subTerm || ''}
                        onChange={(event) => {
                            setSubTerm((event.target.value || undefined) as AdminBillingTerm | undefined);
                            setSubPage(1);
                        }}
                        className={inputClassName}
                    >
                        {TERM_OPTIONS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}
                    </select>
                    <select
                        value={subStatus || ''}
                        onChange={(event) => {
                            setSubStatus((event.target.value || undefined) as AdminBillingSubscriptionsQuery['status']);
                            setSubPage(1);
                        }}
                        className={inputClassName}
                    >
                        {SUBSCRIPTION_STATUS_OPTIONS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="date"
                            value={subStartDate}
                            onChange={(event) => {
                                setSubStartDate(event.target.value);
                                setSubPage(1);
                            }}
                            className={inputClassName}
                        />
                        <input
                            type="date"
                            value={subEndDate}
                            onChange={(event) => {
                                setSubEndDate(event.target.value);
                                setSubPage(1);
                            }}
                            className={inputClassName}
                        />
                    </div>
                </div>

                {subscriptionsLoading ? (
                    <TableSkeleton cols={7} rows={6} />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
                        <table className="w-full text-sm">
                            <thead className="bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] text-left">
                                <tr>
                                    <th className="px-4 py-3">Organization</th>
                                    <th className="px-4 py-3">Plan</th>
                                    <th className="px-4 py-3">Billing Term</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Renewal / Expiry</th>
                                    <th className="px-4 py-3">MRR Contribution</th>
                                    <th className="px-4 py-3">Last Invoice Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--app-border)]">
                                {subscriptions.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-[var(--app-text-secondary)]">No subscriptions found.</td>
                                    </tr>
                                ) : (
                                    subscriptions.map((row) => (
                                        <tr key={row.id} className="hover:bg-[var(--app-surface-hover)]/50">
                                            <td className="px-4 py-3 font-medium text-[var(--app-text-primary)]">{row.organization.name}</td>
                                            <td className="px-4 py-3">{row.plan}</td>
                                            <td className="px-4 py-3">{row.billingTerm || 'N/A'}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${subscriptionStatusBadgeClass(row.status)}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">{formatDate(row.renewalDate)}</td>
                                            <td className="px-4 py-3">{formatCurrency(row.mrrContributionCents, row.currency || 'USD')}</td>
                                            <td className="px-4 py-3">{row.lastInvoiceStatus || 'N/A'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-[var(--app-text-secondary)]">
                        Page {subscriptionsPagination.page} of {subscriptionsPagination.totalPages} ({subscriptionsPagination.total} total)
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={String(subLimit)}
                            onChange={(event) => {
                                setSubLimit(Number(event.target.value));
                                setSubPage(1);
                            }}
                            className="px-2 py-1.5 rounded border border-[var(--app-border)] bg-transparent text-xs"
                        >
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                        </select>
                        <button
                            type="button"
                            disabled={subPage <= 1}
                            onClick={() => setSubPage((value) => Math.max(1, value - 1))}
                            className="px-3 py-1.5 rounded text-xs border border-[var(--app-border)] disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            disabled={subPage >= subscriptionsPagination.totalPages}
                            onClick={() => setSubPage((value) => Math.min(subscriptionsPagination.totalPages, value + 1))}
                            className="px-3 py-1.5 rounded text-xs border border-[var(--app-border)] disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            <div className="surface-card rounded-xl border border-[var(--app-border)] p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h3 className="text-base font-semibold text-[var(--app-text-primary)]">Invoices</h3>
                        <p className="text-xs text-[var(--app-text-secondary)]">Download invoices and safely update status/internal notes.</p>
                    </div>
                    <button
                        type="button"
                        onClick={exportInvoices}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
                    >
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-6 gap-3">
                    <div className="xl:col-span-2 relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)]" />
                        <input
                            value={invoiceSearch}
                            onChange={(event) => {
                                setInvoiceSearch(event.target.value);
                                setInvoicePage(1);
                            }}
                            placeholder="Search invoice # or organization"
                            className={`${inputClassName} pl-9`}
                        />
                    </div>
                    <select
                        value={invoiceStatus || ''}
                        onChange={(event) => {
                            setInvoiceStatus((event.target.value || undefined) as AdminBillingInvoicesQuery['status']);
                            setInvoicePage(1);
                        }}
                        className={inputClassName}
                    >
                        {INVOICE_STATUS_OPTIONS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}
                    </select>
                    <select
                        value={invoicePlan || ''}
                        onChange={(event) => {
                            setInvoicePlan((event.target.value || undefined) as AdminBillingInvoicesQuery['plan']);
                            setInvoicePage(1);
                        }}
                        className={inputClassName}
                    >
                        {PLAN_OPTIONS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}
                    </select>
                    <select
                        value={invoiceTerm || ''}
                        onChange={(event) => {
                            setInvoiceTerm((event.target.value || undefined) as AdminBillingTerm | undefined);
                            setInvoicePage(1);
                        }}
                        className={inputClassName}
                    >
                        {TERM_OPTIONS.map((option) => <option key={option.label} value={option.value || ''}>{option.label}</option>)}
                    </select>
                    <select
                        value={invoiceRangeDays ?? ''}
                        onChange={(event) => {
                            const value = event.target.value;
                            setInvoiceRangeDays(value ? Number(value) as AdminBillingInvoicesQuery['rangeDays'] : undefined);
                            setInvoicePage(1);
                        }}
                        className={inputClassName}
                    >
                        {INVOICE_RANGE_OPTIONS.map((option) => (
                            <option key={option.label} value={option.value || ''}>{option.label}</option>
                        ))}
                    </select>
                </div>

                {invoicesLoading ? (
                    <TableSkeleton cols={9} rows={6} />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-[var(--app-border)]">
                        <table className="w-full text-sm">
                            <thead className="bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] text-left">
                                <tr>
                                    <th className="px-4 py-3">Invoice #</th>
                                    <th className="px-4 py-3">Organization</th>
                                    <th className="px-4 py-3">Plan</th>
                                    <th className="px-4 py-3">Billing Term</th>
                                    <th className="px-4 py-3">Amount</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Issued Date</th>
                                    <th className="px-4 py-3">Updated Date</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--app-border)]">
                                {invoices.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-8 text-center text-[var(--app-text-secondary)]">No invoices found.</td>
                                    </tr>
                                ) : (
                                    invoices.map((row) => (
                                        <tr key={row.id} className="hover:bg-[var(--app-surface-hover)]/50">
                                            <td className="px-4 py-3 font-medium text-[var(--app-text-primary)]">{row.invoiceNumber}</td>
                                            <td className="px-4 py-3">{row.organization.name}</td>
                                            <td className="px-4 py-3">{row.plan}</td>
                                            <td className="px-4 py-3">{row.billingTerm || 'N/A'}</td>
                                            <td className="px-4 py-3">{formatCurrency(row.amountCents, row.currency)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${invoiceStatusBadgeClass(row.status)}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">{formatDate(row.issuedAt)}</td>
                                            <td className="px-4 py-3">{formatDate(row.updatedAt)}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadInvoice(row)}
                                                        disabled={downloadingInvoiceId === row.id}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--app-border)] hover:bg-[var(--app-surface-hover)] disabled:opacity-60"
                                                    >
                                                        {downloadingInvoiceId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                                        PDF
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditInvoice(row)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" /> Edit
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-[var(--app-text-secondary)]">
                        Page {invoicesPagination.page} of {invoicesPagination.totalPages} ({invoicesPagination.total} total)
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={String(invoiceLimit)}
                            onChange={(event) => {
                                setInvoiceLimit(Number(event.target.value));
                                setInvoicePage(1);
                            }}
                            className="px-2 py-1.5 rounded border border-[var(--app-border)] bg-transparent text-xs"
                        >
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                        </select>
                        <button
                            type="button"
                            disabled={invoicePage <= 1}
                            onClick={() => setInvoicePage((value) => Math.max(1, value - 1))}
                            className="px-3 py-1.5 rounded text-xs border border-[var(--app-border)] disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            disabled={invoicePage >= invoicesPagination.totalPages}
                            onClick={() => setInvoicePage((value) => Math.min(invoicesPagination.totalPages, value + 1))}
                            className="px-3 py-1.5 rounded text-xs border border-[var(--app-border)] disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {editingInvoice && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-xl surface-card rounded-xl border border-[var(--app-border)] shadow-2xl">
                        <div className="p-4 border-b border-[var(--app-border)] flex items-center justify-between">
                            <div>
                                <h4 className="text-base font-semibold text-[var(--app-text-primary)] flex items-center gap-2">
                                    <Receipt className="w-4 h-4" /> Edit Invoice
                                </h4>
                                <p className="text-xs text-[var(--app-text-secondary)] mt-1">{editingInvoice.invoiceNumber} • {editingInvoice.organization.name}</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeEditInvoice}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-sm text-[var(--app-text-secondary)] block mb-1.5">Status</label>
                                <select
                                    value={editStatus}
                                    onChange={(event) => setEditStatus(event.target.value as AdminBillingInvoiceRow['status'])}
                                    className={inputClassName}
                                >
                                    <option value="DRAFT">DRAFT</option>
                                    <option value="OPEN">OPEN</option>
                                    <option value="PAID">PAID</option>
                                    <option value="VOID">VOID</option>
                                    <option value="REFUNDED">REFUNDED</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-[var(--app-text-secondary)] block mb-1.5">Internal Note</label>
                                <textarea
                                    value={editInternalNote}
                                    onChange={(event) => setEditInternalNote(event.target.value)}
                                    maxLength={2000}
                                    rows={5}
                                    placeholder="Internal notes only (not customer visible)."
                                    className={inputClassName}
                                />
                                <div className="mt-1 text-xs text-[var(--app-text-secondary)] text-right">
                                    {editInternalNote.length}/2000
                                </div>
                            </div>

                            <div className="rounded-lg border border-[var(--app-border)] p-3 text-xs text-[var(--app-text-secondary)] flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Only <span className="font-medium">status</span> and <span className="font-medium">internalNote</span> can be updated.
                            </div>
                        </div>

                        <div className="p-4 border-t border-[var(--app-border)] flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={closeEditInvoice}
                                className="px-3 py-1.5 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveInvoice}
                                disabled={invoiceSaving}
                                className="btn-primary px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-60"
                            >
                                {invoiceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
