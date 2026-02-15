'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Building2,
    CalendarDays,
    Download,
    Eye,
    Landmark,
    Loader2,
    Search,
    X
} from 'lucide-react';
import {
    downloadAdminEnterpriseInvoicePdf,
    downloadAdminOrganizationInvoicePdf,
    fetchAdminEnterpriseInvoices,
    fetchAdminOrganizationInvoices,
    type AdminBillingInvoice,
    type AdminBillingInvoiceListResponse,
    type AdminBillingInvoiceListParams
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { TableSkeleton } from '@/components/ui/Loading';

type BillingTab = 'ORGANIZATION' | 'ENTERPRISE';

const STATUS_OPTIONS: Array<{ value: AdminBillingInvoiceListParams['status']; label: string }> = [
    { value: undefined, label: 'All Statuses' },
    { value: 'OPEN', label: 'OPEN' },
    { value: 'PAID', label: 'PAID' },
    { value: 'VOID', label: 'VOID' }
];

const ORG_PLAN_OPTIONS: Array<{ value: AdminBillingInvoiceListParams['planType']; label: string }> = [
    { value: undefined, label: 'All Plans' },
    { value: 'BASIC', label: 'Basic' },
    { value: 'PRO', label: 'Pro' },
    { value: 'BUSINESS', label: 'Business' }
];

const ENTERPRISE_PLAN_OPTIONS: Array<{ value: AdminBillingInvoiceListParams['planType']; label: string }> = [
    { value: undefined, label: 'All Plans' },
    { value: 'ENTERPRISE', label: 'Enterprise' }
];

const formatCurrency = (amountCents: number, currency: string) => {
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'USD'
    }).format(amountCents / 100);
};

const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return '--';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleDateString();
};

const getMetadataNumber = (metadata: Record<string, unknown>, key: string) => {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    return 0;
};

const getLineItems = (invoice: AdminBillingInvoice) => {
    const metadataItems = invoice.metadata.lineItems;
    if (Array.isArray(metadataItems)) {
        const parsed = metadataItems
            .map((item) => {
                if (!item || typeof item !== 'object') return null;
                const record = item as Record<string, unknown>;
                const description = typeof record.description === 'string' ? record.description : null;
                if (!description) return null;
                const qty = typeof record.qty === 'number' && Number.isFinite(record.qty) ? record.qty : 1;
                const totalCents = typeof record.totalCents === 'number' && Number.isFinite(record.totalCents)
                    ? Math.max(0, Math.floor(record.totalCents))
                    : invoice.amountCents;
                const unitPriceCents = typeof record.unitPriceCents === 'number' && Number.isFinite(record.unitPriceCents)
                    ? Math.max(0, Math.floor(record.unitPriceCents))
                    : totalCents;
                return {
                    description,
                    qty,
                    unitPriceCents,
                    totalCents
                };
            })
            .filter(Boolean) as Array<{ description: string; qty: number; unitPriceCents: number; totalCents: number }>;

        if (parsed.length > 0) return parsed;
    }

    return [{
        description: `${invoice.planType} plan subscription`,
        qty: 1,
        unitPriceCents: invoice.amountCents,
        totalCents: invoice.amountCents
    }];
};

const getStatusBadgeClassName = (status: AdminBillingInvoice['status']) => {
    if (status === 'PAID') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    if (status === 'OPEN') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    if (status === 'VOID') return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
};

const billingFilterSelectClass = 'w-full px-3 py-2.5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg text-sm text-[var(--app-text-primary)] focus:outline-none focus:ring-2 focus:ring-[#187DE9]/40 transition-colors [color-scheme:light] dark:[color-scheme:dark]';
const billingFilterOptionClass = 'bg-[var(--app-surface)] text-[var(--app-text-primary)]';

export default function BillingSection() {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<BillingTab>('ORGANIZATION');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [statusFilter, setStatusFilter] = useState<AdminBillingInvoiceListParams['status']>(undefined);
    const [planTypeFilter, setPlanTypeFilter] = useState<AdminBillingInvoiceListParams['planType']>(undefined);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [data, setData] = useState<AdminBillingInvoiceListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<AdminBillingInvoice | null>(null);
    const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

    const planOptions = activeTab === 'ORGANIZATION' ? ORG_PLAN_OPTIONS : ENTERPRISE_PLAN_OPTIONS;

    const loadInvoices = useCallback(async () => {
        setLoading(true);
        setLoadingError(null);

        const parsedMin = minAmount.trim().length > 0 ? Number(minAmount) : NaN;
        const parsedMax = maxAmount.trim().length > 0 ? Number(maxAmount) : NaN;
        const minAmountCents = Number.isFinite(parsedMin) && parsedMin >= 0 ? Math.round(parsedMin * 100) : undefined;
        const maxAmountCents = Number.isFinite(parsedMax) && parsedMax >= 0 ? Math.round(parsedMax * 100) : undefined;

        const params: AdminBillingInvoiceListParams = {
            search: debouncedSearch || undefined,
            status: statusFilter,
            planType: planTypeFilter,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            minAmountCents,
            maxAmountCents,
            page,
            limit
        };

        try {
            const response = activeTab === 'ORGANIZATION'
                ? await fetchAdminOrganizationInvoices(params)
                : await fetchAdminEnterpriseInvoices(params);
            setData(response);
        } catch (error: any) {
            const message = error?.response?.data?.message || error?.message || 'Failed to load invoices';
            setLoadingError(message);
            setData(null);
            showToast(message, 'error');
        } finally {
            setLoading(false);
        }
    }, [
        activeTab,
        debouncedSearch,
        statusFilter,
        planTypeFilter,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        page,
        limit,
        showToast
    ]);

    useEffect(() => {
        loadInvoices();
    }, [loadInvoices]);

    const handleDownload = async (invoice: AdminBillingInvoice) => {
        setDownloadingInvoiceId(invoice.id);
        try {
            if (activeTab === 'ORGANIZATION') {
                await downloadAdminOrganizationInvoicePdf(invoice.id, {
                    organizationName: invoice.customer.name,
                    organizationId: invoice.customer.organizationId,
                    invoiceNumber: invoice.invoiceNumber,
                    invoiceDate: invoice.createdAt
                });
            } else {
                await downloadAdminEnterpriseInvoicePdf(invoice.id, {
                    organizationName: invoice.customer.name,
                    organizationId: invoice.customer.organizationId,
                    invoiceNumber: invoice.invoiceNumber,
                    invoiceDate: invoice.createdAt
                });
            }
            showToast('Invoice downloaded', 'success');
        } catch (error: any) {
            showToast(error?.message || 'Failed to download invoice', 'error');
        } finally {
            setDownloadingInvoiceId(null);
        }
    };

    const resetFilters = () => {
        setSearch('');
        setStatusFilter(undefined);
        setPlanTypeFilter(undefined);
        setStartDate('');
        setEndDate('');
        setMinAmount('');
        setMaxAmount('');
        setPage(1);
    };

    const invoices = data?.invoices || [];
    const pagination = data?.pagination;
    const hasRows = invoices.length > 0;

    const selectedLineItems = useMemo(() => {
        if (!selectedInvoice) return [];
        return getLineItems(selectedInvoice);
    }, [selectedInvoice]);

    const selectedDiscountCents = selectedInvoice ? getMetadataNumber(selectedInvoice.metadata, 'discountCents') : 0;
    const selectedTaxCents = selectedInvoice ? getMetadataNumber(selectedInvoice.metadata, 'taxCents') : 0;
    const selectedSubtotalCents = selectedInvoice
        ? Math.max(0, selectedInvoice.amountCents - selectedTaxCents + selectedDiscountCents)
        : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Landmark className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Billing</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Manage and download organization and enterprise invoices
                        </p>
                    </div>
                </div>
            </div>

            <div className="surface-card rounded-xl border border-[var(--app-border)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('ORGANIZATION');
                            setPage(1);
                            setSelectedInvoice(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === 'ORGANIZATION'
                                ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                        Organization Invoices
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('ENTERPRISE');
                            setPage(1);
                            setSelectedInvoice(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === 'ENTERPRISE'
                                ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                        Enterprise Invoices
                    </button>
                </div>
            </div>

            <div className="surface-card rounded-xl border border-[var(--app-border)] p-4 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder={`Search ${activeTab === 'ORGANIZATION' ? 'organization' : 'enterprise'} invoices...`}
                            className="w-full pl-9 pr-3 py-2.5 bg-[var(--app-surface-hover)] border border-[var(--app-border)] rounded-lg text-sm text-[var(--app-text-primary)] placeholder-[var(--app-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <select
                            value={statusFilter || ''}
                            onChange={(event) => {
                                setStatusFilter((event.target.value || undefined) as AdminBillingInvoiceListParams['status']);
                                setPage(1);
                            }}
                            className={billingFilterSelectClass}
                        >
                            {STATUS_OPTIONS.map((option) => (
                                <option key={option.label} value={option.value || ''} className={billingFilterOptionClass}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <select
                            value={planTypeFilter || ''}
                            onChange={(event) => {
                                setPlanTypeFilter((event.target.value || undefined) as AdminBillingInvoiceListParams['planType']);
                                setPage(1);
                            }}
                            className={billingFilterSelectClass}
                        >
                            {planOptions.map((option) => (
                                <option key={option.label} value={option.value || ''} className={billingFilterOptionClass}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--app-text-secondary)]">From</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(event) => {
                                setStartDate(event.target.value);
                                setPage(1);
                            }}
                            className="w-full px-3 py-2.5 bg-[var(--app-surface-hover)] border border-[var(--app-border)] rounded-lg text-sm text-[var(--app-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--app-text-secondary)]">To</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(event) => {
                                setEndDate(event.target.value);
                                setPage(1);
                            }}
                            className="w-full px-3 py-2.5 bg-[var(--app-surface-hover)] border border-[var(--app-border)] rounded-lg text-sm text-[var(--app-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--app-text-secondary)]">Min Amount (USD)</label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={minAmount}
                            onChange={(event) => {
                                setMinAmount(event.target.value);
                                setPage(1);
                            }}
                            placeholder="0.00"
                            className="w-full px-3 py-2.5 bg-[var(--app-surface-hover)] border border-[var(--app-border)] rounded-lg text-sm text-[var(--app-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--app-text-secondary)]">Max Amount (USD)</label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={maxAmount}
                            onChange={(event) => {
                                setMaxAmount(event.target.value);
                                setPage(1);
                            }}
                            placeholder="1000.00"
                            className="w-full px-3 py-2.5 bg-[var(--app-surface-hover)] border border-[var(--app-border)] rounded-lg text-sm text-[var(--app-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--app-text-secondary)]">Page Size</label>
                        <select
                            value={String(limit)}
                            onChange={(event) => {
                                setLimit(Number(event.target.value));
                                setPage(1);
                            }}
                            className="w-full px-3 py-2.5 bg-[var(--app-surface-hover)] border border-[var(--app-border)] rounded-lg text-sm text-[var(--app-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        >
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                        </select>
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] transition-colors"
                    >
                        Reset filters
                    </button>
                </div>
            </div>

            {loading ? (
                <TableSkeleton cols={7} rows={6} />
            ) : loadingError ? (
                <div className="surface-card rounded-xl border border-[var(--app-border)] p-4 flex items-center justify-between">
                    <p className="text-sm text-red-600 dark:text-red-400">{loadingError}</p>
                    <button
                        type="button"
                        onClick={loadInvoices}
                        className="px-3 py-1.5 rounded-lg text-xs border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] transition-colors"
                    >
                        Retry
                    </button>
                </div>
            ) : !hasRows ? (
                <div className="surface-card rounded-xl border border-[var(--app-border)] p-10 text-center text-slate-500 dark:text-slate-400">
                    {activeTab === 'ORGANIZATION' ? <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" /> : <Landmark className="w-10 h-10 mx-auto mb-3 opacity-40" />}
                    <p className="font-medium">No invoices found</p>
                    <p className="text-xs mt-1">Try adjusting filters or date range.</p>
                </div>
            ) : (
                <div className="surface-card rounded-xl border border-[var(--app-border)] overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-left">
                                <th className="px-4 py-3 font-semibold">Invoice #</th>
                                <th className="px-4 py-3 font-semibold">{activeTab === 'ORGANIZATION' ? 'Organization' : 'Enterprise'}</th>
                                <th className="px-4 py-3 font-semibold">Plan</th>
                                <th className="px-4 py-3 font-semibold">Amount</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 font-semibold">Date</th>
                                <th className="px-4 py-3 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--app-border)]">
                            {invoices.map((invoice) => (
                                <tr key={invoice.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                        {invoice.invoiceNumber}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-900 dark:text-white">{invoice.customer.name}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">{invoice.customer.email}</div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{invoice.planType}</td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                                        {formatCurrency(invoice.amountCents, invoice.currency)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${getStatusBadgeClassName(invoice.status)}`}>
                                            {invoice.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(invoice.createdAt)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedInvoice(invoice)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 border border-[var(--app-border)] hover:bg-[var(--app-surface-hover)]"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                Details
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDownload(invoice)}
                                                disabled={downloadingInvoiceId === invoice.id}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-blue-600 dark:text-blue-400 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-60"
                                            >
                                                {downloadingInvoiceId === invoice.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Download className="w-3.5 h-3.5" />
                                                )}
                                                Download PDF
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} invoices)
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            disabled={pagination.page <= 1}
                            className="px-3 py-1.5 rounded-lg text-xs border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                            disabled={pagination.page >= pagination.totalPages}
                            className="px-3 py-1.5 rounded-lg text-xs border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {selectedInvoice && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--app-border)] surface-card shadow-xl">
                        <div className="p-5 border-b border-[var(--app-border)] flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Invoice Details</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedInvoice.invoiceNumber}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedInvoice(null)}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
                                aria-label="Close invoice details"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div className="surface-card rounded-lg border border-[var(--app-border)] p-3">
                                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Customer</div>
                                    <div className="mt-2 font-medium text-slate-900 dark:text-white">{selectedInvoice.customer.name}</div>
                                    <div className="text-slate-600 dark:text-slate-300">{selectedInvoice.billing.billingEmail || selectedInvoice.customer.email}</div>
                                    {selectedInvoice.customer.website && (
                                        <div className="text-slate-500 dark:text-slate-400 text-xs mt-1">{selectedInvoice.customer.website}</div>
                                    )}
                                </div>
                                <div className="surface-card rounded-lg border border-[var(--app-border)] p-3">
                                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Meta</div>
                                    <div className="mt-2 text-slate-700 dark:text-slate-300">Plan: <span className="font-medium">{selectedInvoice.planType}</span></div>
                                    <div className="text-slate-700 dark:text-slate-300">Status: <span className="font-medium">{selectedInvoice.status}</span></div>
                                    <div className="text-slate-700 dark:text-slate-300">Issued: <span className="font-medium">{formatDate(selectedInvoice.createdAt)}</span></div>
                                    <div className="text-slate-700 dark:text-slate-300">
                                        Period: <span className="font-medium">{formatDate(selectedInvoice.periodStart)} - {formatDate(selectedInvoice.periodEnd)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="surface-card rounded-lg border border-[var(--app-border)] overflow-hidden">
                                <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60">
                                    Line Items
                                </div>
                                <div className="divide-y divide-[var(--app-border)]">
                                    {selectedLineItems.map((item, idx) => (
                                        <div key={`${item.description}-${idx}`} className="grid grid-cols-12 px-4 py-3 text-sm">
                                            <div className="col-span-6 text-slate-900 dark:text-white">{item.description}</div>
                                            <div className="col-span-2 text-slate-600 dark:text-slate-300 text-right">{item.qty}</div>
                                            <div className="col-span-2 text-slate-600 dark:text-slate-300 text-right">{formatCurrency(item.unitPriceCents, selectedInvoice.currency)}</div>
                                            <div className="col-span-2 text-slate-900 dark:text-white text-right font-medium">{formatCurrency(item.totalCents, selectedInvoice.currency)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="surface-card rounded-lg border border-[var(--app-border)] p-4">
                                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(selectedSubtotalCents, selectedInvoice.currency)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                                    <span>Discount</span>
                                    <span>-{formatCurrency(selectedDiscountCents, selectedInvoice.currency)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                                    <span>Tax</span>
                                    <span>{formatCurrency(selectedTaxCents, selectedInvoice.currency)}</span>
                                </div>
                                <div className="flex items-center justify-between text-base font-semibold text-slate-900 dark:text-white mt-3 pt-3 border-t border-[var(--app-border)]">
                                    <span>Total</span>
                                    <span>{formatCurrency(selectedInvoice.amountCents, selectedInvoice.currency)}</span>
                                </div>
                            </div>

                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                <CalendarDays className="w-3.5 h-3.5" />
                                Status updates are managed through existing billing operations.
                            </div>
                        </div>

                        <div className="p-4 border-t border-[var(--app-border)] flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setSelectedInvoice(null)}
                                className="px-3 py-1.5 rounded-lg text-sm border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDownload(selectedInvoice)}
                                disabled={downloadingInvoiceId === selectedInvoice.id}
                                className="btn-primary px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-60"
                            >
                                {downloadingInvoiceId === selectedInvoice.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                Download PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
