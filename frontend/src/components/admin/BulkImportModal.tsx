'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Upload, FileText, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { uploadBulkImport, getBulkImportStatus } from '@/lib/api';

interface BulkImportModalProps {
    onClose: () => void;
}

interface JobStatus {
    id: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    totalRows: number;
    processedRows: number;
    insertedCount: number;
    skippedCount: number;
    failedCount: number;
    fileName?: string;
    fileSize?: number;
    errors?: { row: number; reason: string }[];
}

export default function BulkImportModal({ onClose }: BulkImportModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [strictMode, setStrictMode] = useState(false);
    const [dryRun, setDryRun] = useState(false);
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Polling Ref
    const pollInterval = useRef<NodeJS.Timeout | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await uploadBulkImport(formData, { strictMode, dryRun });
            setJobId(res.jobId);
            setUploading(false);
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.message || 'Upload failed');
            setUploading(false);
        }
    };

    // Polling Effect
    useEffect(() => {
        if (jobId) {
            const checkStatus = async () => {
                try {
                    const status = await getBulkImportStatus(jobId);
                    setJobStatus(status);

                    if (status.status === 'COMPLETED' || status.status === 'FAILED') {
                        if (pollInterval.current) clearInterval(pollInterval.current);
                    }
                } catch (err) {
                    console.error('Polling failed', err);
                }
            };

            // Initial check
            checkStatus();

            // Interval
            pollInterval.current = setInterval(checkStatus, 1000);

            return () => {
                if (pollInterval.current) clearInterval(pollInterval.current);
            };
        }
    }, [jobId]);

    const reset = () => {
        setFile(null);
        setJobId(null);
        setJobStatus(null);
        setError(null);
        if (pollInterval.current) clearInterval(pollInterval.current);
    };

    const renderProgress = () => {
        if (!jobStatus) return null;

        const { totalRows, processedRows, status } = jobStatus;
        const percent = totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0;

        const isFinished = status === 'COMPLETED' || status === 'FAILED';

        return (
            <div className="space-y-4">
                <div className="flex justify-between text-sm text-[var(--app-text-secondary)]">
                    <span>Status: <span className="text-[var(--app-text-primary)] font-medium">{status}</span></span>
                    <span>{processedRows} / {totalRows === 0 ? '?' : totalRows} rows</span>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <div
                        className={`h-2.5 rounded-full transition-all duration-300 ${status === 'FAILED' ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.max(5, percent)}%` }}
                    ></div>
                </div>

                {isFinished && (
                    <div className="bg-[var(--app-surface-hover)] rounded-lg p-4 border border-[var(--app-border)] space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-[var(--app-text-secondary)]">Inserted (Sites Created):</span>
                            <span className="text-green-600 dark:text-green-400 font-bold">{jobStatus.insertedCount}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--app-text-secondary)]">Skipped (Dry Run / Invalid):</span>
                            <span className="text-yellow-600 dark:text-yellow-400 font-bold">{jobStatus.skippedCount}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--app-text-secondary)]">Failed Rows:</span>
                            <span className="text-red-500 dark:text-red-400 font-bold">{jobStatus.failedCount}</span>
                        </div>

                        {jobStatus.errors && jobStatus.errors.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[var(--app-border)]">
                                <p className="text-[var(--app-text-primary)] font-medium mb-2">Error Log:</p>
                                <div className="max-h-32 overflow-y-auto space-y-1 text-xs text-red-600 dark:text-red-300 font-mono bg-slate-100 dark:bg-slate-900 p-2 rounded">
                                    {jobStatus.errors.slice(0, 100).map((e, idx) => (
                                        <div key={idx}>Row {e.row}: {e.reason}</div>
                                    ))}
                                    {jobStatus.errors.length > 100 && <div>...and {jobStatus.errors.length - 100} more</div>}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="surface-card rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-[var(--app-border)] flex justify-between items-center">
                    <h3 className="text-xl font-bold text-[var(--app-text-primary)] flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-500" />
                        Bulk Site Import
                    </h3>
                    <button onClick={onClose} className="text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {!jobId ? (
                        <div className="space-y-6">
                            {/* File Input */}
                            <div className="border-2 border-dashed border-[var(--app-border)] rounded-xl p-8 text-center hover:border-slate-400 dark:hover:border-slate-500 transition-colors bg-[var(--app-surface-hover)]">
                                <input
                                    type="file"
                                    accept=".csv,.json"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    id="bulk-file-upload"
                                />
                                <label htmlFor="bulk-file-upload" className="cursor-pointer flex flex-col items-center gap-3">
                                    <div className="p-4 surface-card rounded-full text-blue-500 dark:text-blue-400 border border-[var(--app-border)]">
                                        <Upload className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[var(--app-text-primary)] font-medium">Click to upload or drag and drop</p>
                                        <p className="text-[var(--app-text-secondary)] text-sm">CSV or JSON (Max 10MB)</p>
                                    </div>
                                    {file && (
                                        <div className="bg-blue-500/10 text-blue-500 dark:text-blue-400 px-3 py-1 rounded-full text-sm font-medium mt-2 border border-blue-500/20">
                                            {file.name}
                                        </div>
                                    )}
                                </label>
                            </div>

                            {/* Options */}
                            <div className="space-y-4 bg-[var(--app-surface-hover)] p-4 rounded-lg border border-[var(--app-border)]">
                                <div className="flex items-start gap-4">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className="relative inline-block w-10 h-6 align-middle select-none transition duration-200 ease-in">
                                            <input
                                                type="checkbox"
                                                checked={dryRun}
                                                onChange={(e) => setDryRun(e.target.checked)}
                                                className="absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer top-1 transition-all duration-200"
                                                style={{ left: dryRun ? '1.5rem' : '0.25rem', borderColor: dryRun ? '#3b82f6' : '#cbd5e1' }}
                                            />
                                            <div className={`block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-200 ${dryRun ? 'btn-primary' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                                        </div>
                                        <span className="text-[var(--app-text-primary)] text-sm font-medium">Dry Run Mode</span>
                                    </label>
                                    <p className="text-xs text-[var(--app-text-secondary)] pt-1.5">- Simulate the import without inserting data.</p>
                                </div>

                                <div className="h-px bg-[var(--app-border)]"></div>

                                <div className="flex items-start gap-4">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className="relative inline-block w-10 h-6 align-middle select-none transition duration-200 ease-in">
                                            <input
                                                type="checkbox"
                                                checked={strictMode}
                                                onChange={(e) => setStrictMode(e.target.checked)}
                                                className="absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer top-1 transition-all duration-200"
                                                style={{ left: strictMode ? '1.5rem' : '0.25rem', borderColor: strictMode ? '#3b82f6' : '#cbd5e1' }}
                                            />
                                            <div className={`block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-200 ${strictMode ? 'btn-primary' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                                        </div>
                                        <span className="text-[var(--app-text-primary)] text-sm font-medium">Strict Mode</span>
                                    </label>
                                    <p className="text-xs text-[var(--app-text-secondary)] pt-1.5">- Cancel entire import if any error occurs.</p>
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-500/10 text-red-500 dark:text-red-400 p-3 rounded-lg text-sm flex items-start gap-2 border border-red-500/20">
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                        </div>
                    ) : (
                        renderProgress()
                    )}
                </div>

                <div className="p-6 border-t border-[var(--app-border)] bg-[var(--app-surface-hover)] flex justify-end gap-3 rounded-b-xl">
                    {!jobId ? (
                        <>
                            <button onClick={onClose} className="px-4 py-2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={!file || uploading}
                                className="px-6 py-2 btn-primary rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {uploading ? 'Start Import...' : 'Start Import'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={reset}
                                disabled={!jobStatus || (jobStatus.status !== 'COMPLETED' && jobStatus.status !== 'FAILED')}
                                className="px-4 py-2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition-colors disabled:opacity-0"
                            >
                                Import Another
                            </button>
                            <button onClick={onClose} className="px-6 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-lg font-medium transition-colors">
                                Close
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
