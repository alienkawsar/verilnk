'use client';

import { useState, useEffect } from 'react';
import { fetchPendingSites, fetchAdminRequests, updateSiteStatus, approveRequest, rejectRequest, approveRequestsBulk, rejectRequestsBulk } from '@/lib/api';
import { CheckCircle, XCircle, ExternalLink, RefreshCw, Shield, Globe, User, CheckSquare, Square } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';

interface ReviewItem {
    id: string;
    source: 'SITE' | 'REQUEST';
    type: 'CRAWLED_SITE' | 'SITE_ADD' | 'ORG_WEBSITE_UPDATE';
    name: string;
    url: string;
    info: string; // Country / details
    submittedBy: string;
    createdAt: string;
}

export default function SitesSection() {
    const [items, setItems] = useState<ReviewItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    // Reject Modal
    // Reject Modal
    const [rejectId, setRejectId] = useState<string | null>(null);
    const [rejectNote, setRejectNote] = useState('');

    // Bulk Selection
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    // Search
    const [searchId, setSearchId] = useState('');

    const loadData = async (overrideId?: string) => {
        setLoading(true);
        try {
            if (overrideId) {
                // If searching by ID, we prioritize finding a Request with this ID.
                const requests = await fetchAdminRequests({ requestId: overrideId });
                // We could also try to find a Site by this ID if we wanted, but scope says "Search requests by Request ID"
                // Let's search requests first.

                const normalizedItems: ReviewItem[] = [];
                requests.forEach((req: any) => {
                    let name = 'Unknown';
                    let url = '';
                    let info = '';

                    if (req.type === 'SITE_ADD') {
                        name = req.payload.name || 'New Site';
                        url = req.payload.url;
                        info = `Country ID: ${req.payload.countryId}`;
                    } else if (req.type === 'ORG_WEBSITE_UPDATE') {
                        name = req.organization?.name || 'Organization Update';
                        url = req.payload.website;
                        info = 'Website Change Request';
                    }

                    normalizedItems.push({
                        id: req.id,
                        source: 'REQUEST',
                        type: req.type,
                        name: name,
                        url: url,
                        info: info,
                        submittedBy: req.requester?.name || req.requester?.email || 'Unknown User',
                        createdAt: req.createdAt
                    });
                });
                setItems(normalizedItems);
                setLoading(false);
                return;
            }

            // Normal Load
            // Fetch concurrently with error isolation
            const [sitesResult, requestsResult] = await Promise.allSettled([
                fetchPendingSites(),
                fetchAdminRequests({ status: 'PENDING', type: 'SITE_ADD,ORG_WEBSITE_UPDATE' })
            ]);

            const normalizedItems: ReviewItem[] = [];

            // 1. Crawled Sites
            if (sitesResult.status === 'fulfilled') {

                sitesResult.value.forEach((site: any) => {
                    normalizedItems.push({
                        id: site.id,
                        source: 'SITE',
                        type: 'CRAWLED_SITE',
                        name: site.name,
                        url: site.url,
                        info: `${site.country?.name || 'Unknown Country'} • ${site.category?.name || 'No Category'}`,
                        submittedBy: 'System (Crawler)',
                        createdAt: site.createdAt
                    });
                });
            } else {
                console.error('Failed to load sites:', sitesResult.reason);
                showToast('Warning: Could not load crawled sites', 'error');
            }

            // 2. Change Requests (User/Org)
            if (requestsResult.status === 'fulfilled') {

                requestsResult.value.forEach((req: any) => {
                    // Determine details based on type
                    let name = 'Unknown';
                    let url = '';
                    let info = '';

                    if (req.type === 'SITE_ADD') {
                        name = req.payload.name || 'New Site';
                        url = req.payload.url;
                        info = `Country ID: ${req.payload.countryId}`;
                    } else if (req.type === 'ORG_WEBSITE_UPDATE') {
                        name = req.organization?.name || 'Organization Update';
                        url = req.payload.website;
                        info = 'Website Change Request';
                    }

                    normalizedItems.push({
                        id: req.id,
                        source: 'REQUEST',
                        type: req.type,
                        name: name,
                        url: url,
                        info: info,
                        submittedBy: req.requester?.name || req.requester?.email || 'Unknown User',
                        createdAt: req.createdAt
                    });
                });
            } else {
                console.error('Failed to load requests:', requestsResult.reason);
                showToast('Warning: Could not load request queue', 'error');
            }

            // Sort by date desc
            normalizedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            setItems(normalizedItems);
        } catch (e) {
            console.error(e);
            showToast('Critical error loading review queue', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        loadData(searchId || undefined);
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleApprove = async (item: ReviewItem) => {
        try {
            if (item.source === 'SITE') {
                await updateSiteStatus(item.id, 'SUCCESS');
            } else {
                await approveRequest(item.id);
            }
            setItems(prev => prev.filter(i => i.id !== item.id));
            showToast('Item approved successfully', 'success');
        } catch (e) {
            showToast('Failed to approve', 'error');
        }
    };

    const confirmReject = async () => {
        if (!rejectId) return;
        const item = items.find(i => i.id === rejectId);
        if (!item) return;

        try {
            if (item.source === 'SITE') {
                await updateSiteStatus(item.id, 'FAILED');
            } else {
                await rejectRequest(item.id, rejectNote);
            }
            setItems(prev => prev.filter(i => i.id !== rejectId));
            showToast('Item rejected', 'success');
            setRejectId(null);
            setRejectNote('');
        } catch (e) {
            showToast('Failed to reject', 'error');
        }
    };

    // Bulk Actions
    const toggleSelectAll = () => {
        if (selectedIds.length === items.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(items.map(i => i.id));
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
    };

    const handleBulkApprove = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Approve ${selectedIds.length} items?`)) return;

        setIsBulkProcessing(true);
        let successCount = 0;
        let failCount = 0;

        try {
            const selectedItems = items.filter(i => selectedIds.includes(i.id));
            const requests = selectedItems.filter(i => i.source === 'REQUEST');
            const sites = selectedItems.filter(i => i.source === 'SITE');

            // 1. Process Requests via Bulk API
            if (requests.length > 0) {
                try {
                    const res = await approveRequestsBulk(requests.map(r => r.id));
                    successCount += res.approved;
                    failCount += res.failed;
                } catch (e) {
                    failCount += requests.length;
                }
            }

            // 2. Process Sites via Loop
            if (sites.length > 0) {
                await Promise.all(sites.map(async (site) => {
                    try {
                        await updateSiteStatus(site.id, 'SUCCESS');
                        successCount++;
                    } catch (e) {
                        failCount++;
                    }
                }));
            }

            showToast(`Approved ${successCount} items`, 'success');
            setItems(prev => prev.filter(i => !selectedIds.includes(i.id))); // Optimistic
            setSelectedIds([]);
            loadData();
        } catch (error) {
            showToast('Bulk action failed', 'error');
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleBulkReject = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Reject ${selectedIds.length} items?`)) return;

        setIsBulkProcessing(true);
        let successCount = 0;

        try {
            const selectedItems = items.filter(i => selectedIds.includes(i.id));
            const requests = selectedItems.filter(i => i.source === 'REQUEST');
            const sites = selectedItems.filter(i => i.source === 'SITE');

            if (requests.length > 0) {
                try {
                    const res = await rejectRequestsBulk(requests.map(r => r.id), 'Bulk Rejection');
                    successCount += res.rejected;
                } catch (e) {
                    // Ignore
                }
            }

            if (sites.length > 0) {
                await Promise.all(sites.map(async (site) => {
                    try {
                        await updateSiteStatus(site.id, 'FAILED');
                        successCount++;
                    } catch (e) { }
                }));
            }
            showToast(`Rejected ${successCount} items`, 'success');
            loadData();
            setSelectedIds([]);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-col sm:flex-row gap-4 surface-card p-4 rounded-xl shadow-sm">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Shield className="w-8 h-8 text-blue-500" />
                    Review Queue
                </h1>

                <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
                    <input
                        type="text"
                        placeholder="Search Request ID..."
                        value={searchId}
                        onChange={e => setSearchId(e.target.value)}
                        className="bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] placeholder-[var(--app-text-secondary)] focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64"
                    />
                    <button type="submit" className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300">
                        Search
                    </button>

                    <button type="button" onClick={() => { setSearchId(''); loadData(); }} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300" title="Refresh">
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </form>
            </div>

            {selectedIds.length > 0 && (
                <div className="surface-card p-4 rounded-xl flex justify-between items-center animate-in fade-in slide-in-from-top-2 shadow-sm">
                    <span className="text-slate-900 dark:text-white font-medium">{selectedIds.length} selected</span>
                    <div className="flex gap-3">
                        <button
                            onClick={handleBulkApprove}
                            disabled={isBulkProcessing}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <CheckCircle className="w-4 h-4" />
                            Bulk Approve
                        </button>
                        <button
                            onClick={handleBulkReject}
                            disabled={isBulkProcessing}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <XCircle className="w-4 h-4" />
                            Bulk Reject
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <TableSkeleton cols={6} rows={5} />
            ) : (
                <div className="surface-card rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                        <thead className="bg-app-secondary/50 text-xs uppercase font-medium text-[var(--app-text-secondary)]">
                            <tr>
                                <th className="px-6 py-4 w-12">
                                    <input
                                        type="checkbox"
                                        checked={items.length > 0 && selectedIds.length === items.length}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-[var(--app-border)] bg-transparent text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                                    />
                                </th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Name / Entity</th>
                                <th className="px-6 py-4">URL</th>
                                <th className="px-6 py-4">Details</th>
                                <th className="px-6 py-4">Submitted By</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        Review queue is empty.
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => toggleSelection(item.id)}
                                                className="w-4 h-4 rounded border-[var(--app-border)] bg-transparent text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs whitespace-nowrap ${item.type === 'CRAWLED_SITE' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' :
                                                item.type === 'ORG_WEBSITE_UPDATE' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' :
                                                    'bg-green-500/10 text-green-600 dark:text-green-400'
                                                }`}>
                                                {item.type.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{item.name}</td>
                                        <td className="px-6 py-4">
                                            {item.url ? (
                                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 flex items-center gap-1 hover:underline truncate max-w-[200px]">
                                                    {(() => {
                                                        try { return new URL(item.url).hostname; } catch { return item.url; }
                                                    })()}
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            ) : <span className="text-slate-500 dark:text-slate-600">-</span>}
                                        </td>
                                        <td className="px-6 py-4 text-xs">{item.info}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <User className="w-3 h-3" />
                                                <span>{item.submittedBy}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2 flex justify-end">
                                            <button
                                                onClick={() => handleApprove(item)}
                                                className="p-1.5 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 rounded-md transition-colors border border-green-500/20"
                                                title="Approve"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setRejectId(item.id)}
                                                className="p-1.5 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 rounded-md transition-colors border border-red-500/20"
                                                title="Reject"
                                            >
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {rejectId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="surface-card rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Reject Link</h3>
                        <textarea
                            autoFocus
                            placeholder="Reason for rejection (optional)..."
                            value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            className="w-full bg-transparent border border-[var(--app-border)] rounded-lg p-3 text-[var(--app-text-primary)] h-24 mb-4 focus:ring-2 focus:ring-red-500 outline-none placeholder-[var(--app-text-secondary)]"
                        />
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setRejectId(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">Cancel</button>
                            <button onClick={confirmReject} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors">Confirm Reject</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
