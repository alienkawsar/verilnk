'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, FileDown, RefreshCw, ShieldCheck } from 'lucide-react';
import {
    downloadComplianceExport,
    fetchComplianceDashboard,
    fetchComplianceIncidents,
    fetchRetentionPolicies,
    runComplianceJobs,
    updateRetentionPolicy
} from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface ComplianceDashboard {
    totalLogs?: number;
    incidentsOpen?: number;
    failedOperations?: number;
    integrity?: {
        isValid?: boolean;
    };
}

interface IncidentItem {
    id: string;
    type: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    occurredAt?: string;
}

interface RetentionPolicyDraft {
    id: string;
    entityType: string;
    retentionDays: string;
    autoPurge: boolean;
    archiveBeforeDelete: boolean;
    legalHold: boolean;
}

interface RetentionPolicySnapshot {
    retentionDays: number;
    autoPurge: boolean;
    archiveBeforeDelete: boolean;
    legalHold: boolean;
}

const checkboxClassName =
    'h-4 w-4 rounded border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-slate-900';

const inputClassName =
    'h-10 bg-transparent border border-[var(--app-border)] rounded-lg px-3 text-sm text-[var(--app-text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/30';

const saveButtonClassName =
    'inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-[var(--app-border)] text-xs font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed';

const retentionDesktopGridClassName =
    'grid-cols-[minmax(0,1.5fr)_104px_repeat(3,56px)_72px]';

const toRetentionPolicyDraft = (policy: any): RetentionPolicyDraft => ({
    id: policy.id,
    entityType: policy.entityType,
    retentionDays: String(policy.retentionDays ?? ''),
    autoPurge: !!policy.autoPurge,
    archiveBeforeDelete: !!policy.archiveBeforeDelete,
    legalHold: !!policy.legalHold
});

const toRetentionPolicySnapshot = (policy: RetentionPolicyDraft): RetentionPolicySnapshot => ({
    retentionDays: Number(policy.retentionDays),
    autoPurge: !!policy.autoPurge,
    archiveBeforeDelete: !!policy.archiveBeforeDelete,
    legalHold: !!policy.legalHold
});

export default function ComplianceSection() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [dashboard, setDashboard] = useState<ComplianceDashboard | null>(null);
    const [incidents, setIncidents] = useState<IncidentItem[]>([]);
    const [policies, setPolicies] = useState<RetentionPolicyDraft[]>([]);
    const [policyBaseline, setPolicyBaseline] = useState<Record<string, RetentionPolicySnapshot>>({});
    const [exporting, setExporting] = useState(false);
    const [savingPolicyId, setSavingPolicyId] = useState<string | null>(null);

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
            const drafts: RetentionPolicyDraft[] = (pol || []).map((policy: any) => toRetentionPolicyDraft(policy));
            setPolicies(drafts);
            setPolicyBaseline(
                Object.fromEntries(
                    drafts.map((policy: RetentionPolicyDraft) => [policy.id, toRetentionPolicySnapshot(policy)])
                )
            );
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

    const isPolicyDaysValid = (retentionDays: string) => {
        if (retentionDays.trim() === '') return false;
        const value = Number(retentionDays);
        return Number.isFinite(value) && value >= 0;
    };

    const isPolicyDirty = (policy: RetentionPolicyDraft) => {
        const baseline = policyBaseline[policy.id];
        if (!baseline) return false;
        const currentDays = Number(policy.retentionDays);
        return (
            currentDays !== baseline.retentionDays ||
            !!policy.autoPurge !== baseline.autoPurge ||
            !!policy.archiveBeforeDelete !== baseline.archiveBeforeDelete ||
            !!policy.legalHold !== baseline.legalHold
        );
    };

    const handlePolicyUpdate = async (policy: RetentionPolicyDraft) => {
        if (!isPolicyDaysValid(policy.retentionDays)) {
            showToast('Retention days must be a valid non-negative number', 'error');
            return;
        }

        const retentionDays = Number(policy.retentionDays);
        setSavingPolicyId(policy.id);
        try {
            await updateRetentionPolicy(policy.entityType, {
                retentionDays,
                autoPurge: !!policy.autoPurge,
                archiveBeforeDelete: !!policy.archiveBeforeDelete,
                legalHold: !!policy.legalHold
            });
            setPolicies((prev) =>
                prev.map((item) =>
                    item.id === policy.id ? { ...item, retentionDays: String(retentionDays) } : item
                )
            );
            setPolicyBaseline((prev) => ({
                ...prev,
                [policy.id]: {
                    retentionDays,
                    autoPurge: !!policy.autoPurge,
                    archiveBeforeDelete: !!policy.archiveBeforeDelete,
                    legalHold: !!policy.legalHold
                }
            }));
            showToast('Retention policy updated', 'success');
        } catch (e: any) {
            showToast('Failed to update retention policy', 'error');
        } finally {
            setSavingPolicyId(null);
        }
    };

    const renderPolicyToggle = (
        label: string,
        checked: boolean,
        onChange: (value: boolean) => void
    ) => (
        <label className="inline-flex items-center justify-start lg:justify-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className={checkboxClassName}
            />
            <span className="lg:hidden">{label}</span>
        </label>
    );

    const getIncidentStatusClassName = (status: string) => {
        const normalized = status.toUpperCase();
        if (normalized === 'OPEN') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
        if (normalized === 'RESOLVED' || normalized === 'CLOSED') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
    };

    const formatIncidentDate = (incident: IncidentItem) => {
        const value = incident.createdAt || incident.updatedAt || incident.occurredAt;
        if (!value) return 'Timestamp unavailable';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Timestamp unavailable';
        return date.toLocaleString();
    };

    return (
        <div className="space-y-6 max-w-full">
            {/* Discovery note (frontend/src/components/admin/sections/ComplianceSection.tsx):
               Refined key UI blocks: KPI cards, Recent Incidents panel, and Retention Policies table rows.
               Existing handlers/endpoints remain unchanged; only layout/styling and per-row dirty-state UX were adjusted.
               Overflow root cause: desktop retention rows used a too-wide fixed grid template, which exceeded the right column width
               in the xl two-column split and pushed the Action/Save cell out of viewport. */}
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    Compliance Dashboard
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={handleRunJobs}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Run Jobs
                    </button>
                    <button
                        onClick={handleExport}
                        className="btn-primary px-4 py-2 rounded-lg text-sm transition-colors inline-flex items-center gap-2 disabled:opacity-60"
                        disabled={exporting}
                    >
                        <FileDown className="w-4 h-4" />
                        {exporting ? 'Exporting...' : 'Export Logs'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="surface-card rounded-xl border border-[var(--app-border)] p-4 shadow-sm min-h-[112px] flex flex-col justify-between">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total Audit Logs</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{dashboard?.totalLogs ?? 0}</div>
                </div>
                <div className="surface-card rounded-xl border border-[var(--app-border)] p-4 shadow-sm min-h-[112px] flex flex-col justify-between">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Integrity Status</div>
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {dashboard?.integrity?.isValid ? 'VALID' : 'INVALID'}
                    </div>
                </div>
                <div className="surface-card rounded-xl border border-[var(--app-border)] p-4 shadow-sm min-h-[112px] flex flex-col justify-between">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pending Incidents</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{dashboard?.incidentsOpen ?? 0}</div>
                </div>
                <div className="surface-card rounded-xl border border-[var(--app-border)] p-4 shadow-sm min-h-[112px] flex flex-col justify-between">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Failed Operations</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{dashboard?.failedOperations ?? 0}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start max-w-full">
                <div className="surface-card rounded-xl border border-[var(--app-border)] p-5 shadow-sm h-full min-w-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Incidents</h2>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Total: {incidents.length}</span>
                    </div>
                    {incidents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--app-border)] p-6 flex flex-col items-center justify-center text-center min-h-[260px]">
                            <ShieldCheck className="w-8 h-8 text-emerald-500/80 dark:text-emerald-400/80 mb-3" />
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No incidents recorded</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                                Compliance checks are healthy. New incidents will appear here when detected.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {incidents.slice(0, 5).map((incident) => (
                                <div
                                    key={incident.id}
                                    className="rounded-xl border border-[var(--app-border)] bg-white/30 dark:bg-slate-900/20 p-3 flex items-start justify-between gap-3"
                                >
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                            <AlertTriangle className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                                {incident.type}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                {formatIncidentDate(incident)}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`shrink-0 px-2 py-1 rounded-md border text-[11px] font-medium ${getIncidentStatusClassName(incident.status || 'OPEN')}`}>
                                        {(incident.status || 'OPEN').toUpperCase()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="surface-card rounded-xl border border-[var(--app-border)] p-5 shadow-sm min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Retention Policies</h2>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Per-policy controls</span>
                    </div>
                    {policies.length === 0 ? (
                        <div className="text-slate-500 dark:text-slate-400 text-sm">No retention policies configured.</div>
                    ) : (
                        <div className="space-y-3 min-w-0">
                            <div className={`hidden lg:grid ${retentionDesktopGridClassName} items-center gap-2 px-2 pb-2 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400`}>
                                <span>Type</span>
                                <span>Days</span>
                                <span className="text-center leading-tight">Auto purge</span>
                                <span className="text-center leading-tight">Archive first</span>
                                <span className="text-center leading-tight">Legal hold</span>
                                <span className="text-right">Action</span>
                            </div>

                            {policies.map((policy) => (
                                <div
                                    key={policy.id}
                                    className="rounded-xl border border-[var(--app-border)] bg-white/25 dark:bg-slate-900/20 p-3"
                                >
                                    <div className={`hidden lg:grid ${retentionDesktopGridClassName} items-center gap-2 min-w-0`}>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{policy.entityType}</p>
                                            {isPolicyDirty(policy) && (
                                                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Unsaved changes</p>
                                            )}
                                        </div>
                                        <input
                                            type="number"
                                            min={0}
                                            value={policy.retentionDays}
                                            onChange={(e) =>
                                                setPolicies((prev) =>
                                                    prev.map((item) =>
                                                        item.id === policy.id ? { ...item, retentionDays: e.target.value } : item
                                                    )
                                                )
                                            }
                                            className={`${inputClassName} w-[104px]`}
                                        />
                                        {renderPolicyToggle('Auto purge', policy.autoPurge, (checked) =>
                                            setPolicies((prev) =>
                                                prev.map((item) =>
                                                    item.id === policy.id ? { ...item, autoPurge: checked } : item
                                                )
                                            )
                                        )}
                                        {renderPolicyToggle('Archive first', policy.archiveBeforeDelete, (checked) =>
                                            setPolicies((prev) =>
                                                prev.map((item) =>
                                                    item.id === policy.id ? { ...item, archiveBeforeDelete: checked } : item
                                                )
                                            )
                                        )}
                                        {renderPolicyToggle('Legal hold', policy.legalHold, (checked) =>
                                            setPolicies((prev) =>
                                                prev.map((item) =>
                                                    item.id === policy.id ? { ...item, legalHold: checked } : item
                                                )
                                            )
                                        )}
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => handlePolicyUpdate(policy)}
                                                className={`${saveButtonClassName} w-[72px]`}
                                                disabled={!isPolicyDirty(policy) || !isPolicyDaysValid(policy.retentionDays) || savingPolicyId === policy.id}
                                            >
                                                {savingPolicyId === policy.id ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="lg:hidden space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{policy.entityType}</p>
                                                {isPolicyDirty(policy) && (
                                                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Unsaved changes</p>
                                                )}
                                            </div>
                                            <input
                                                type="number"
                                                min={0}
                                                value={policy.retentionDays}
                                                onChange={(e) =>
                                                    setPolicies((prev) =>
                                                        prev.map((item) =>
                                                            item.id === policy.id ? { ...item, retentionDays: e.target.value } : item
                                                        )
                                                )
                                            }
                                                className={`${inputClassName} w-24`}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={policy.autoPurge}
                                                    onChange={(e) =>
                                                        setPolicies((prev) =>
                                                            prev.map((item) =>
                                                                item.id === policy.id ? { ...item, autoPurge: e.target.checked } : item
                                                            )
                                                        )
                                                    }
                                                    className={checkboxClassName}
                                                />
                                                Auto purge
                                            </label>
                                            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={policy.archiveBeforeDelete}
                                                    onChange={(e) =>
                                                        setPolicies((prev) =>
                                                            prev.map((item) =>
                                                                item.id === policy.id ? { ...item, archiveBeforeDelete: e.target.checked } : item
                                                            )
                                                        )
                                                    }
                                                    className={checkboxClassName}
                                                />
                                                Archive first
                                            </label>
                                            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={policy.legalHold}
                                                    onChange={(e) =>
                                                        setPolicies((prev) =>
                                                            prev.map((item) =>
                                                                item.id === policy.id ? { ...item, legalHold: e.target.checked } : item
                                                            )
                                                        )
                                                    }
                                                    className={checkboxClassName}
                                                />
                                                Legal hold
                                            </label>
                                        </div>
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => handlePolicyUpdate(policy)}
                                                className={saveButtonClassName}
                                                disabled={!isPolicyDirty(policy) || !isPolicyDaysValid(policy.retentionDays) || savingPolicyId === policy.id}
                                            >
                                                {savingPolicyId === policy.id ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
