import React, { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    siteId: string;
    siteUrl: string;
}

export default function ReportModal({ isOpen, onClose, siteId, siteUrl }: ReportModalProps) {
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const { user } = useAuth();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedReason = reason.trim();
        if (!trimmedReason) {
            setError('Please enter a reason for reporting.');
            return;
        }
        setLoading(true);
        setError('');

        try {
            await axios.post('http://localhost:8000/api/reports', { siteId, reason: trimmedReason }, { withCredentials: true });
            setSuccess(true);
            setTimeout(() => {
                onClose();
                setSuccess(false);
                setReason('');
            }, 2000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to submit report');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-8 overflow-hidden">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="mb-6 text-center">
                    <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Report Site</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm break-all">{siteUrl}</p>
                </div>

                {success ? (
                    <div className="text-center py-8">
                        <div className="text-green-500 text-lg font-medium mb-2">Report Submitted!</div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Thank you for helping keep VeriLnk safe.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-1">Reason for reporting</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                required
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all font-sans min-h-[100px] resize-none"
                                placeholder="e.g., Phishing, Malware, Incorrect Information..."
                            />
                            {!reason.trim() && error && (
                                <p className="text-xs text-red-400 ml-1">Please enter a reason for reporting.</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !reason.trim()}
                            className="w-full bg-red-600 hover:bg-red-500 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Report'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
