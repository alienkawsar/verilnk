import { prisma } from '../db/client';
import crypto from 'crypto';
import { AuditActionType, ComplianceExportFormat, ComplianceExportType, ComplianceIncidentStatus, ComplianceIncidentSeverity, RetentionEntityType } from '@prisma/client';
import * as auditService from './audit.service';

const hash = (input: string) => crypto.createHash('sha256').update(input).digest('hex');

const buildAuditHashPayload = (prevHash: string, log: { adminId: string; actorRole?: string | null; action: string; entity?: string | null; targetId?: string | null; details?: string | null; createdAt: Date; hashTimestamp?: Date | null }) => {
    const timestamp = (log.hashTimestamp || log.createdAt).toISOString();
    return `${prevHash}|${log.adminId}|${log.actorRole || ''}|${log.action}|${log.entity || ''}|${log.targetId || ''}|${timestamp}|${log.details || ''}`;
};

export const validateAuditChain = async (limit = 1000) => {
    const logs = await prisma.adminLog.findMany({
        orderBy: { createdAt: 'asc' },
        take: limit
    });

    let linkMismatch = 0;
    let hashMismatch = 0;
    let legacyCount = 0;
    let prevHash = 'GENESIS_HASH';

    for (const log of logs) {
        if (log.previousHash && log.previousHash !== prevHash) {
            linkMismatch += 1;
        }
        if (!log.hashTimestamp) {
            legacyCount += 1;
        }
        const expected = hash(buildAuditHashPayload(prevHash, log));
        if (log.currentHash && expected !== log.currentHash) {
            hashMismatch += 1;
        }
        prevHash = log.currentHash || prevHash;
    }

    const isValid = linkMismatch === 0 && hashMismatch === 0;
    return {
        isValid,
        checked: logs.length,
        linkMismatch,
        hashMismatch,
        legacyCount
    };
};

export const getComplianceDashboard = async () => {
    const [
        totalLogs,
        incidentsOpen,
        incidentsInvestigating,
        lastExport,
        alertsOpen
    ] = await Promise.all([
        prisma.adminLog.count(),
        prisma.complianceIncident.count({ where: { status: ComplianceIncidentStatus.OPEN } }),
        prisma.complianceIncident.count({ where: { status: ComplianceIncidentStatus.INVESTIGATING } }),
        prisma.complianceExport.findFirst({ orderBy: { createdAt: 'desc' } }),
        prisma.alert.count({ where: { isRead: false } })
    ]);

    const integrity = await validateAuditChain(1000);
    const retentionPolicies = await prisma.retentionPolicy.findMany();

    return {
        totalLogs,
        integrity,
        incidentsOpen,
        incidentsInvestigating,
        failedOperations: alertsOpen,
        retentionPolicies,
        lastExportAt: lastExport?.createdAt || null
    };
};

const exportAuditLogs = async (filters: any, format: ComplianceExportFormat) => {
    if (format === ComplianceExportFormat.JSON) {
        const json = await auditService.exportLogsJson(filters);
        return { data: JSON.stringify(json), count: json.length };
    }
    const csv = await auditService.exportLogs(filters);
    const count = csv.split('\n').length - 1;
    return { data: csv, count };
};

const exportIncidents = async (format: ComplianceExportFormat) => {
    const incidents = await prisma.complianceIncident.findMany({ orderBy: { createdAt: 'desc' } });
    if (format === ComplianceExportFormat.JSON) {
        return { data: JSON.stringify(incidents), count: incidents.length };
    }
    const headers = ['ID', 'Type', 'Severity', 'Status', 'Related Entity', 'Related ID', 'Reported By', 'Assigned To', 'Created At'];
    const rows = incidents.map(i => [
        i.id,
        i.type,
        i.severity,
        i.status,
        i.relatedEntity || '',
        i.relatedId || '',
        i.reportedBy || '',
        i.assignedTo || '',
        i.createdAt.toISOString()
    ].join(','));
    return { data: [headers.join(','), ...rows].join('\n'), count: incidents.length };
};

const exportDeletionRecords = async (format: ComplianceExportFormat) => {
    const orgs = await prisma.organization.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' }
    });
    if (format === ComplianceExportFormat.JSON) {
        return { data: JSON.stringify(orgs), count: orgs.length };
    }
    const headers = ['ID', 'Name', 'Deleted At', 'Deleted By', 'Reason'];
    const rows = orgs.map(o => [
        o.id,
        `"${o.name.replace(/"/g, '""')}"`,
        o.deletedAt?.toISOString() || '',
        o.deletedBy || '',
        `"${(o.deleteReason || '').replace(/"/g, '""')}"`
    ].join(','));
    return { data: [headers.join(','), ...rows].join('\n'), count: orgs.length };
};

const exportUserActions = async (format: ComplianceExportFormat) => {
    const logs = await prisma.adminLog.findMany({
        where: { entity: { contains: 'User', mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        take: 5000
    });
    if (format === ComplianceExportFormat.JSON) {
        return { data: JSON.stringify(logs), count: logs.length };
    }
    const headers = ['ID', 'Action', 'Entity', 'Target ID', 'Admin ID', 'Created At'];
    const rows = logs.map(l => [
        l.id,
        l.action,
        l.entity || '',
        l.targetId || '',
        l.adminId,
        l.createdAt.toISOString()
    ].join(','));
    return { data: [headers.join(','), ...rows].join('\n'), count: logs.length };
};

const exportOrgHistory = async (format: ComplianceExportFormat) => {
    const orgs = await prisma.organization.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { changeRequests: true }
    });
    if (format === ComplianceExportFormat.JSON) {
        return { data: JSON.stringify(orgs), count: orgs.length };
    }
    const headers = ['ID', 'Name', 'Status', 'Updated At', 'Change Requests'];
    const rows = orgs.map(o => [
        o.id,
        `"${o.name.replace(/"/g, '""')}"`,
        o.status,
        o.updatedAt.toISOString(),
        o.changeRequests.length
    ].join(','));
    return { data: [headers.join(','), ...rows].join('\n'), count: orgs.length };
};

export const createExport = async (params: {
    type: ComplianceExportType;
    format: ComplianceExportFormat;
    filters?: any;
    adminId: string;
    adminRole?: string;
}) => {
    let payload: { data: string; count: number };
    switch (params.type) {
        case ComplianceExportType.AUDIT_LOGS:
            payload = await exportAuditLogs(params.filters, params.format);
            break;
        case ComplianceExportType.INCIDENTS:
            payload = await exportIncidents(params.format);
            break;
        case ComplianceExportType.DELETION_RECORDS:
            payload = await exportDeletionRecords(params.format);
            break;
        case ComplianceExportType.USER_ACTIONS:
            payload = await exportUserActions(params.format);
            break;
        case ComplianceExportType.ORG_HISTORY:
        default:
            payload = await exportOrgHistory(params.format);
            break;
    }

    const checksum = hash(payload.data);
    const exportRecord = await prisma.complianceExport.create({
        data: {
            type: params.type,
            format: params.format,
            requestedBy: params.adminId,
            requestedByRole: params.adminRole as any,
            filters: params.filters || null,
            checksum,
            recordCount: payload.count,
            status: 'COMPLETED'
        }
    });

    await auditService.logAction({
        adminId: params.adminId,
        actorRole: params.adminRole,
        action: AuditActionType.OTHER,
        entity: 'ComplianceExport',
        targetId: exportRecord.id,
        details: `Exported ${params.type} as ${params.format}`,
        snapshot: { filters: params.filters, checksum, recordCount: payload.count }
    });

    return { exportRecord, payload };
};

export const listIncidents = async () => {
    return prisma.complianceIncident.findMany({
        orderBy: { createdAt: 'desc' }
    });
};

export const createIncident = async (params: {
    type: string;
    severity?: ComplianceIncidentSeverity;
    relatedEntity?: string;
    relatedId?: string;
    reportedBy?: string;
    assignedTo?: string;
    timeline?: any;
    evidenceLinks?: any;
    adminId: string;
    adminRole?: string;
}) => {
    const incident = await prisma.complianceIncident.create({
        data: {
            type: params.type,
            severity: params.severity || ComplianceIncidentSeverity.LOW,
            relatedEntity: params.relatedEntity,
            relatedId: params.relatedId,
            reportedBy: params.reportedBy,
            assignedTo: params.assignedTo,
            timeline: params.timeline || [],
            evidenceLinks: params.evidenceLinks || []
        }
    });

    await auditService.logAction({
        adminId: params.adminId,
        actorRole: params.adminRole,
        action: AuditActionType.CREATE,
        entity: 'ComplianceIncident',
        targetId: incident.id,
        details: `Created incident ${incident.type}`,
        snapshot: incident
    });

    return incident;
};

export const updateIncident = async (id: string, updates: Partial<any>, adminId: string, adminRole?: string) => {
    const before = await prisma.complianceIncident.findUnique({ where: { id } });
    if (!before) throw new Error('Incident not found');

    const updated = await prisma.complianceIncident.update({
        where: { id },
        data: updates
    });

    await auditService.logAction({
        adminId,
        actorRole: adminRole,
        action: AuditActionType.UPDATE,
        entity: 'ComplianceIncident',
        targetId: id,
        details: `Updated incident ${id}`,
        snapshot: { before, after: updated }
    });

    return updated;
};

export const getRetentionPolicies = async () => {
    const existing = await prisma.retentionPolicy.findMany();
    if (existing.length > 0) return existing;

    const defaults = Object.values(RetentionEntityType).map(entityType => ({
        entityType,
        retentionDays: entityType === RetentionEntityType.AUDIT_LOG ? 3650 : 365,
        autoPurge: false,
        archiveBeforeDelete: entityType === RetentionEntityType.AUDIT_LOG,
        legalHold: false
    }));

    await prisma.retentionPolicy.createMany({ data: defaults });
    return prisma.retentionPolicy.findMany();
};

export const updateRetentionPolicy = async (entityType: RetentionEntityType, updates: Partial<any>, adminId: string, adminRole?: string) => {
    const before = await prisma.retentionPolicy.findUnique({ where: { entityType } });
    const updated = await prisma.retentionPolicy.upsert({
        where: { entityType },
        update: {
            ...updates,
            updatedBy: adminId
        },
        create: {
            entityType,
            retentionDays: updates.retentionDays ?? 365,
            autoPurge: updates.autoPurge ?? false,
            archiveBeforeDelete: updates.archiveBeforeDelete ?? false,
            legalHold: updates.legalHold ?? false,
            updatedBy: adminId
        }
    });

    await auditService.logAction({
        adminId,
        actorRole: adminRole,
        action: AuditActionType.UPDATE,
        entity: 'RetentionPolicy',
        targetId: updated.id,
        details: `Updated retention policy ${entityType}`,
        snapshot: { before, after: updated }
    });

    return updated;
};

export const runRetentionJobs = async (adminId: string, adminRole?: string) => {
    const policies = await prisma.retentionPolicy.findMany({
        where: { autoPurge: true, legalHold: false }
    });

    const now = new Date();
    const results: Record<string, number> = {};

    for (const policy of policies) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - policy.retentionDays);

        if (policy.entityType === RetentionEntityType.REPORT) {
            const res = await prisma.report.deleteMany({ where: { createdAt: { lt: cutoff } } });
            results.REPORT = (results.REPORT || 0) + res.count;
        }
        if (policy.entityType === RetentionEntityType.ANALYTICS) {
            const res = await prisma.orgAnalytics.deleteMany({ where: { date: { lt: cutoff } } });
            results.ANALYTICS = (results.ANALYTICS || 0) + res.count;
        }
        if (policy.entityType === RetentionEntityType.EXPORT) {
            const res = await prisma.complianceExport.deleteMany({ where: { createdAt: { lt: cutoff } } });
            results.EXPORT = (results.EXPORT || 0) + res.count;
        }
        if (policy.entityType === RetentionEntityType.AUDIT_LOG && !policy.archiveBeforeDelete) {
            const res = await prisma.adminLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
            results.AUDIT_LOG = (results.AUDIT_LOG || 0) + res.count;
        }
        if (policy.entityType === RetentionEntityType.ORGANIZATION) {
            const res = await prisma.organization.deleteMany({ where: { deletedAt: { lt: cutoff } } });
            results.ORGANIZATION = (results.ORGANIZATION || 0) + res.count;
        }
        if (policy.entityType === RetentionEntityType.USER) {
            const res = await prisma.user.deleteMany({ where: { createdAt: { lt: cutoff } } });
            results.USER = (results.USER || 0) + res.count;
        }
    }

    await auditService.logAction({
        adminId,
        actorRole: adminRole,
        action: AuditActionType.OTHER,
        entity: 'RetentionJob',
        targetId: undefined,
        details: `Retention job executed at ${now.toISOString()}`,
        snapshot: results
    });

    return results;
};

export const runScheduledComplianceJobs = async (adminId: string, adminRole?: string) => {
    const integrity = await validateAuditChain(1000);
    const retention = await runRetentionJobs(adminId, adminRole);
    return { integrity, retention };
};
