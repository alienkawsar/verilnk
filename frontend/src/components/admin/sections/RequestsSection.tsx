'use client';

import { useState, useEffect } from 'react';
import { fetchAdminRequests, approveRequest, rejectRequest, approveRequestsBulk, rejectRequestsBulk } from '@/lib/api';
import { CheckCircle, XCircle, FileText, User, Globe, RefreshCw, CheckSquare, Square } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Loading';

interface ChangeRequest {
    id: string;
    type: 'ORG_EDIT' | 'USER_UPDATE' | 'SITE_ADD';
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    payload: any;
    requester: { name: string; email: string };
    createdAt: string;
    adminNotes?: string;
}

export default function RequestsSection() {
    const [requests, setRequests] = useState<ChangeRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    // Reject Modal State
    const [rejectId, setRejectId] = useState<string | null>(null);
    const [rejectNote, setRejectNote] = useState('');

    // Bulk Actions
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isBulkReject, setIsBulkReject] = useState(false); // Reuse modal logic

    // Search
    const [searchId, setSearchId] = useState('');

    const loadData = async (overrideId?: string) => {
        setLoading(true);
        try {
            const filters: any = { status: 'PENDING', type: 'USER_UPDATE,ORG_EDIT' };

            // If searching by ID, override filters to find exactly that request (even if approved/rejected)
            if (overrideId) {
                // We clear status/type to allow finding ANY request by ID
                delete filters.status;
                delete filters.type;
                filters.requestId = overrideId;
            }

            const data = await fetchAdminRequests(filters);
            setRequests(data);
        } catch (error) {
            console.error(error);
            showToast('Failed to load requests', 'error');
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

    const handleApprove = async (id: string) => {
        try {
            await approveRequest(id);
            setRequests(prev => prev.filter(r => r.id !== id));
            showToast('Request approved', 'success');
        } catch (error) {
            showToast('Failed to approve request', 'error');
        }
    };

    const handleReject = async () => {
        // Handle Single Reject
        if (rejectId) {
            try {
                await rejectRequest(rejectId, rejectNote);
                setRequests(prev => prev.filter(r => r.id !== rejectId));
                showToast('Request rejected', 'success');
                setRejectId(null);
                setRejectNote('');
            } catch (error) {
                showToast('Failed to reject request', 'error');
            }
            return;
        }

        // Handle Bulk Reject
        if (isBulkReject && selectedIds.length > 0) {
            setIsBulkProcessing(true);
            try {
                const res = await rejectRequestsBulk(selectedIds, rejectNote);
                showToast(`Processed ${res.processed} requests (${res.rejected} rejected, ${res.failed} failed)`, 'success');
                setRequests(prev => prev.filter(r => !selectedIds.includes(r.id)));
                setSelectedIds([]);
                setIsBulkReject(false);
                setRejectNote('');
            } catch (error) {
                showToast('Failed to bulk reject requests', 'error');
            } finally {
                setIsBulkProcessing(false);
            }
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === requests.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(requests.map(r => r.id));
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
        );
    };

    const handleBulkApprove = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Approve ${selectedIds.length} requests?`)) return;

        setIsBulkProcessing(true);
        try {
            const res = await approveRequestsBulk(selectedIds);
            showToast(`Processed ${res.processed} requests (${res.approved} approved, ${res.failed} failed)`, 'success');
            setRequests(prev => prev.filter(r => !selectedIds.includes(r.id)));
            setSelectedIds([]);
        } catch (error) {
            showToast('Failed to bulk approve', 'error');
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const renderPayload = (req: ChangeRequest) => {
        if (req.type === 'SITE_ADD') {
            return (
                <div className="text-sm">
                    <p><span className="font-semibold text-slate-600 dark:text-slate-400">Site:</span> {req.payload.name}</p>
                    <p><span className="font-semibold text-slate-600 dark:text-slate-400">URL:</span> <a href={req.payload.url} target="_blank" className="text-blue-500 dark:text-blue-400 hover:underline">{req.payload.url}</a></p>
                    <p><span className="font-semibold text-slate-600 dark:text-slate-400">Country ID:</span> {req.payload.countryId}</p>
                    {req.payload.stateId && <p><span className="font-semibold text-slate-600 dark:text-slate-400">State ID:</span> {req.payload.stateId}</p>}
                </div>
            );
        } else if (req.type === 'ORG_EDIT') {
            return (
                <div className="text-sm">
                    {Object.entries(req.payload).map(([key, val]) => (
                        <p key={key}><span className="font-semibold text-slate-600 dark:text-slate-400 capitalize">{key}:</span> {String(val)}</p>
                    ))}
                </div>
            );
        } else {
            return (
                <div className="text-sm">
                    {Object.entries(req.payload).map(([key, val]) => (
                        <p key={key}><span className="font-semibold text-slate-600 dark:text-slate-400 capitalize">{key}:</span> {String(val)}</p>
                    ))}
                </div>
            );
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center surface-card p-4 rounded-xl shadow-sm">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-8 h-8 text-purple-600 dark:text-purple-500" />
                    Change Requests
                </h1>

                <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Search by Request ID..."
                        value={searchId}
                        onChange={e => setSearchId(e.target.value)}
                        className="bg-transparent border border-[var(--app-border)] rounded-lg px-4 py-2 text-[var(--app-text-primary)] placeholder-[var(--app-text-secondary)] focus:ring-2 focus:ring-purple-500 outline-none w-64"
                    />
                    <button type="submit" className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-white transition-colors">
                        <User className="w-5 h-5 hidden" /> {/* Dummy icon force reload layout? No */}
                        Search
                    </button>
                    <button type="button" onClick={() => { setSearchId(''); loadData(); }} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-white transition-colors" title="Refresh">
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
                            onClick={() => setIsBulkReject(true)}
                            disabled={isBulkProcessing}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <XCircle className="w-4 h-4" />
                            Bulk Reject
                        </button>
                    </div>
                </div>
            )}

            {loading ? <TableSkeleton cols={4} rows={5} /> : (
                <div className="surface-card rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                        <thead className="bg-app-secondary/50 text-xs uppercase font-medium text-[var(--app-text-secondary)]">
                            <tr>
                                <th className="px-6 py-4 w-12">
                                    <input
                                        type="checkbox"
                                        checked={requests.length > 0 && selectedIds.length === requests.length}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                                    />
                                </th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Requester</th>
                                <th className="px-6 py-4">Details</th>
                                <th className="px-6 py-4">Created</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {requests.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-500">No pending requests.</td></tr>
                            ) : (
                                requests.map(req => (
                                    <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(req.id)}
                                                onChange={() => toggleSelection(req.id)}
                                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                            <span className={`px-2 py-1 rounded text-xs ${req.type === 'SITE_ADD' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' :
                                                req.type === 'ORG_EDIT' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' :
                                                    'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                                                }`}>
                                                {req.type.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-slate-400" />
                                                <div>
                                                    <p className="text-slate-900 dark:text-white">{req.requester.name}</p>
                                                    <p className="text-xs text-slate-500">{req.requester.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">{renderPayload(req)}</td>
                                        <td className="px-6 py-4">{new Date(req.createdAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button onClick={() => handleApprove(req.id)} className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 bg-green-100 dark:bg-green-900/20 p-2 rounded hover:bg-green-200 dark:hover:bg-green-900/40" title="Approve">
                                                <CheckCircle className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => setRejectId(req.id)} className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-100 dark:bg-red-900/20 p-2 rounded hover:bg-red-200 dark:hover:bg-red-900/40" title="Reject">
                                                <XCircle className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {(rejectId || isBulkReject) && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="surface-card rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                            {isBulkReject ? `Reject ${selectedIds.length} Requests` : 'Reject Request'}
                        </h3>
                        <textarea
                            autoFocus
                            placeholder="Reason for rejection..."
                            value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            className="w-full bg-transparent border border-[var(--app-border)] rounded-lg p-3 text-[var(--app-text-primary)] h-24 mb-4 focus:ring-2 focus:ring-red-500 outline-none placeholder-[var(--app-text-secondary)]"
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => { setRejectId(null); setIsBulkReject(false); setRejectNote(''); }}
                                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={isBulkProcessing}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg disabled:opacity-50"
                            >
                                {isBulkProcessing ? 'Processing...' : 'Confirm Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
