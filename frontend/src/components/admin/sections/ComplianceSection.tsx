'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, FileDown, RefreshCw } from 'lucide-react';
import { fetchComplianceDashboard, fetchComplianceIncidents, exportComplianceEvidence, runComplianceJobs, fetchRetentionPolicies, updateRetentionPolicy, downloadComplianceExport } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

export default function ComplianceSection() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [dashboard, setDashboard] = useState<any>(null);
    const [incidents, setIncidents] = useState<any[]>([]);
    const [policies, setPolicies] = useState<any[]>([]);
    const [exporting, setExporting] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const [dash, inc, pol] = await Promise.all([
                fetchComplianceDashboard(),
                fetchComplianceIncidents(),
                fetchRetentionPolicies()
            ]);
            setDashboard(dash);
            setIncidents(inc || []);
            setPolicies(pol || []);
        } catch (e: any) {
            showToast('Failed to load compliance data', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleExport = async () => {
        setExporting(true);
        try {
            const blob = await downloadComplianceExport({ type: 'AUDIT_LOGS', format: 'JSON' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            showToast('Audit log export created', 'success');
            loadData();
        } catch (e: any) {
            showToast('Export failed', 'error');
        } finally {
            setExporting(false);
        }
    };

    const handleRunJobs = async () => {
        try {
            await runComplianceJobs();
            showToast('Compliance jobs executed', 'success');
            loadData();
        } catch (e: any) {
            showToast('Failed to run compliance jobs', 'error');
        }
    };

    if (loading) {
        return <div className="text-slate-400">Loading compliance dashboard...</div>;
    }

    const handlePolicyUpdate = async (policy: any) => {
        try {
            await updateRetentionPolicy(policy.entityType, {
                retentionDays: Number(policy.retentionDays),
                autoPurge: !!policy.autoPurge,
                archiveBeforeDelete: !!policy.archiveBeforeDelete,
                legalHold: !!policy.legalHold
            });
            showToast('Retention policy updated', 'success');
        } catch (e: any) {
            showToast('Failed to update retention policy', 'error');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    Compliance Dashboard
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRunJobs}
                        className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Run Jobs
                    </button>
                    <button
                        onClick={handleExport}
                        className="btn-primary px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                        disabled={exporting}
                    >
                        <FileDown className="w-4 h-4" />
                        {exporting ? 'Exporting...' : 'Export Logs'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="surface-card rounded-lg p-4 shadow-sm">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Total Audit Logs</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{dashboard?.totalLogs ?? 0}</div>
                </div>
                <div className="surface-card rounded-lg p-4 shadow-sm">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Integrity Status</div>
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {dashboard?.integrity?.isValid ? 'VALID' : 'INVALID'}
                    </div>
                </div>
                <div className="surface-card rounded-lg p-4 shadow-sm">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Pending Incidents</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{dashboard?.incidentsOpen ?? 0}</div>
                </div>
                <div className="surface-card rounded-lg p-4 shadow-sm">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Failed Operations</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{dashboard?.failedOperations ?? 0}</div>
                </div>
            </div>

            <div className="surface-card rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Incidents</h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Total: {incidents.length}</span>
                </div>
                {incidents.length === 0 ? (
                    <div className="text-slate-500 dark:text-slate-400 text-sm">No incidents recorded.</div>
                ) : (
                    <div className="space-y-3">
                        {incidents.slice(0, 5).map((incident) => (
                            <div key={incident.id} className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                                    <span>{incident.type}</span>
                                </div>
                                <span className="text-xs text-slate-500">{incident.status}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="surface-card rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Retention Policies</h2>
                </div>
                {policies.length === 0 ? (
                    <div className="text-slate-500 dark:text-slate-400 text-sm">No retention policies configured.</div>
                ) : (
                    <div className="space-y-3">
                        {policies.map((policy) => (
                            <div key={policy.id} className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                                <div className="min-w-[160px] text-slate-900 dark:text-slate-200">{policy.entityType}</div>
                                <input
                                    type="number"
                                    value={policy.retentionDays}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setPolicies(prev => prev.map(p => p.id === policy.id ? { ...p, retentionDays: value } : p));
                                    }}
                                    className="w-24 bg-transparent border border-[var(--app-border)] rounded px-2 py-1 text-[var(--app-text-primary)]"
                                />
                                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                    <input
                                        type="checkbox"
                                        checked={policy.autoPurge}
                                        onChange={(e) => setPolicies(prev => prev.map(p => p.id === policy.id ? { ...p, autoPurge: e.target.checked } : p))}
                                    />
                                    Auto purge
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                    <input
                                        type="checkbox"
                                        checked={policy.archiveBeforeDelete}
                                        onChange={(e) => setPolicies(prev => prev.map(p => p.id === policy.id ? { ...p, archiveBeforeDelete: e.target.checked } : p))}
                                    />
                                    Archive first
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                    <input
                                        type="checkbox"
                                        checked={policy.legalHold}
                                        onChange={(e) => setPolicies(prev => prev.map(p => p.id === policy.id ? { ...p, legalHold: e.target.checked } : p))}
                                    />
                                    Legal hold
                                </label>
                                <button
                                    onClick={() => handlePolicyUpdate(policy)}
                                    className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1 rounded text-xs"
                                >
                                    Save
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
