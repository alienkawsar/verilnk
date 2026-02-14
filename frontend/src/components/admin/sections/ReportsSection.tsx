import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ShieldAlert, ExternalLink, Calendar, User, Trash2 } from 'lucide-react';
import { deleteReport } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Report {
    id: string;
    reason: string | null;
    createdAt: string;
    site: {
        name: string;
        url: string;
    };
    user: {
        name: string;
        email: string;
    };
}

export default function ReportsSection() {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const res = await axios.get('http://localhost:8000/api/reports', { withCredentials: true });
                setReports(res.data);
            } catch (error) {
                console.error('Failed to fetch reports', error);
                showToast('Failed to load reports', 'error');
            } finally {
                setLoading(false);
            }
        };

        fetchReports();
    }, [showToast]);

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to remove this report? This action cannot be undone.')) {
            return;
        }

        setDeletingId(id);
        try {
            await deleteReport(id);
            setReports((prev) => prev.filter((r) => r.id !== id));
            showToast('Report removed successfully', 'success');
        } catch (error) {
            console.error('Failed to delete report', error);
            showToast('Failed to remove report', 'error');
        } finally {
            setDeletingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Detailed Reports</h1>
                    <p className="text-slate-500 dark:text-slate-400">Review user-submitted reports for websites.</p>
                </div>
                <div className="bg-red-500/10 text-red-400 px-4 py-2 rounded-lg border border-red-500/20 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" />
                    <span className="font-semibold">{reports.length} Reports Pending</span>
                </div>
            </div>

            <div className="grid gap-4">
                {reports.map((report) => (
                    <div key={report.id} className="surface-card rounded-xl p-6 hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{report.site.name}</h3>
                                    <a
                                        href={report.site.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>
                                <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg p-3 inline-block mb-3 border border-slate-200 dark:border-slate-700/50">
                                    <span className="text-sm font-mono text-slate-600 dark:text-slate-300">{report.site.url}</span>
                                </div>

                                {report.reason && (
                                    <div className="mt-2">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason</span>
                                        <p className="text-slate-600 dark:text-slate-300 mt-1">{report.reason}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-4 min-w-[200px] border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700 pt-4 md:pt-0 md:pl-6">
                                <div className="flex flex-col gap-2 text-sm text-slate-500 dark:text-slate-400">
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-slate-500" />
                                        <span>{report.user.name}</span>
                                    </div>
                                    <div className="ml-6 text-xs text-slate-500">{report.user.email}</div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Calendar className="w-4 h-4 text-slate-500" />
                                        <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleDelete(report.id)}
                                    disabled={deletingId === report.id}
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-colors border border-red-500/20 hover:border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {deletingId === report.id ? (
                                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Trash2 className="w-4 h-4" />
                                    )}
                                    <span className="font-medium">Remove Report</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {reports.length === 0 && (
                    <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 border-dashed">
                        <p className="text-slate-500 dark:text-slate-400">No reports found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
