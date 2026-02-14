'use client';

import { useState } from 'react';
import { Download, FileText, FileSpreadsheet, Loader2, ChevronDown } from 'lucide-react';

interface ExportDropdownProps {
    orgId: string;
    onExport: (format: 'csv' | 'pdf', range: string) => Promise<void>;
    disabled?: boolean;
}

export default function ExportDropdown({ orgId, onExport, disabled = false }: ExportDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportType, setExportType] = useState<'csv' | 'pdf' | null>(null);
    const [selectedRange, setSelectedRange] = useState('30d');

    const handleExport = async (format: 'csv' | 'pdf') => {
        setIsExporting(true);
        setExportType(format);
        try {
            await onExport(format, selectedRange);
        } finally {
            setIsExporting(false);
            setExportType(null);
            setIsOpen(false);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled || isExporting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Download className="w-4 h-4" />
                )}
                Export
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && !isExporting && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

                    {/* Dropdown Menu */}
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                        {/* Range Selector */}
                        <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                                Date Range
                            </label>
                            <select
                                value={selectedRange}
                                onChange={(e) => setSelectedRange(e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                            >
                                <option value="7d">Last 7 Days</option>
                                <option value="30d">Last 30 Days</option>
                                <option value="90d">Last 90 Days</option>
                            </select>
                        </div>

                        {/* Export Options */}
                        <div className="p-2">
                            <button
                                onClick={() => handleExport('csv')}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                                <div className="text-left">
                                    <div>Export as CSV</div>
                                    <div className="text-xs text-slate-400">Spreadsheet format</div>
                                </div>
                            </button>

                            <button
                                onClick={() => handleExport('pdf')}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <FileText className="w-5 h-5 text-red-500" />
                                <div className="text-left">
                                    <div>Export as PDF</div>
                                    <div className="text-xs text-slate-400">Printable report</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
