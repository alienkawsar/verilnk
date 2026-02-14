"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScheduledComplianceJobs = exports.runRetentionJobs = exports.updateRetentionPolicy = exports.getRetentionPolicies = exports.updateIncident = exports.createIncident = exports.listIncidents = exports.createExport = exports.getComplianceDashboard = exports.validateAuditChain = void 0;
const client_1 = require("../db/client");
const crypto_1 = __importDefault(require("crypto"));
const client_2 = require("@prisma/client");
const auditService = __importStar(require("./audit.service"));
const hash = (input) => crypto_1.default.createHash('sha256').update(input).digest('hex');
const buildAuditHashPayload = (prevHash, log) => {
    const timestamp = (log.hashTimestamp || log.createdAt).toISOString();
    return `${prevHash}|${log.adminId}|${log.actorRole || ''}|${log.action}|${log.entity || ''}|${log.targetId || ''}|${timestamp}|${log.details || ''}`;
};
const validateAuditChain = async (limit = 1000) => {
    const logs = await client_1.prisma.adminLog.findMany({
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
exports.validateAuditChain = validateAuditChain;
const getComplianceDashboard = async () => {
    const [totalLogs, incidentsOpen, incidentsInvestigating, lastExport, alertsOpen] = await Promise.all([
        client_1.prisma.adminLog.count(),
        client_1.prisma.complianceIncident.count({ where: { status: client_2.ComplianceIncidentStatus.OPEN } }),
        client_1.prisma.complianceIncident.count({ where: { status: client_2.ComplianceIncidentStatus.INVESTIGATING } }),
        client_1.prisma.complianceExport.findFirst({ orderBy: { createdAt: 'desc' } }),
        client_1.prisma.alert.count({ where: { isRead: false } })
    ]);
    const integrity = await (0, exports.validateAuditChain)(1000);
    const retentionPolicies = await client_1.prisma.retentionPolicy.findMany();
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
exports.getComplianceDashboard = getComplianceDashboard;
const exportAuditLogs = async (filters, format) => {
    if (format === client_2.ComplianceExportFormat.JSON) {
        const json = await auditService.exportLogsJson(filters);
        return { data: JSON.stringify(json), count: json.length };
    }
    const csv = await auditService.exportLogs(filters);
    const count = csv.split('\n').length - 1;
    return { data: csv, count };
};
const exportIncidents = async (format) => {
    const incidents = await client_1.prisma.complianceIncident.findMany({ orderBy: { createdAt: 'desc' } });
    if (format === client_2.ComplianceExportFormat.JSON) {
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
const exportDeletionRecords = async (format) => {
    const orgs = await client_1.prisma.organization.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' }
    });
    if (format === client_2.ComplianceExportFormat.JSON) {
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
const exportUserActions = async (format) => {
    const logs = await client_1.prisma.adminLog.findMany({
        where: { entity: { contains: 'User', mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        take: 5000
    });
    if (format === client_2.ComplianceExportFormat.JSON) {
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
const exportOrgHistory = async (format) => {
    const orgs = await client_1.prisma.organization.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { changeRequests: true }
    });
    if (format === client_2.ComplianceExportFormat.JSON) {
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
const createExport = async (params) => {
    let payload;
    switch (params.type) {
        case client_2.ComplianceExportType.AUDIT_LOGS:
            payload = await exportAuditLogs(params.filters, params.format);
            break;
        case client_2.ComplianceExportType.INCIDENTS:
            payload = await exportIncidents(params.format);
            break;
        case client_2.ComplianceExportType.DELETION_RECORDS:
            payload = await exportDeletionRecords(params.format);
            break;
        case client_2.ComplianceExportType.USER_ACTIONS:
            payload = await exportUserActions(params.format);
            break;
        case client_2.ComplianceExportType.ORG_HISTORY:
        default:
            payload = await exportOrgHistory(params.format);
            break;
    }
    const checksum = hash(payload.data);
    const exportRecord = await client_1.prisma.complianceExport.create({
        data: {
            type: params.type,
            format: params.format,
            requestedBy: params.adminId,
            requestedByRole: params.adminRole,
            filters: params.filters || null,
            checksum,
            recordCount: payload.count,
            status: 'COMPLETED'
        }
    });
    await auditService.logAction({
        adminId: params.adminId,
        actorRole: params.adminRole,
        action: client_2.AuditActionType.OTHER,
        entity: 'ComplianceExport',
        targetId: exportRecord.id,
        details: `Exported ${params.type} as ${params.format}`,
        snapshot: { filters: params.filters, checksum, recordCount: payload.count }
    });
    return { exportRecord, payload };
};
exports.createExport = createExport;
const listIncidents = async () => {
    return client_1.prisma.complianceIncident.findMany({
        orderBy: { createdAt: 'desc' }
    });
};
exports.listIncidents = listIncidents;
const createIncident = async (params) => {
    const incident = await client_1.prisma.complianceIncident.create({
        data: {
            type: params.type,
            severity: params.severity || client_2.ComplianceIncidentSeverity.LOW,
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
        action: client_2.AuditActionType.CREATE,
        entity: 'ComplianceIncident',
        targetId: incident.id,
        details: `Created incident ${incident.type}`,
        snapshot: incident
    });
    return incident;
};
exports.createIncident = createIncident;
const updateIncident = async (id, updates, adminId, adminRole) => {
    const before = await client_1.prisma.complianceIncident.findUnique({ where: { id } });
    if (!before)
        throw new Error('Incident not found');
    const updated = await client_1.prisma.complianceIncident.update({
        where: { id },
        data: updates
    });
    await auditService.logAction({
        adminId,
        actorRole: adminRole,
        action: client_2.AuditActionType.UPDATE,
        entity: 'ComplianceIncident',
        targetId: id,
        details: `Updated incident ${id}`,
        snapshot: { before, after: updated }
    });
    return updated;
};
exports.updateIncident = updateIncident;
const getRetentionPolicies = async () => {
    const existing = await client_1.prisma.retentionPolicy.findMany();
    if (existing.length > 0)
        return existing;
    const defaults = Object.values(client_2.RetentionEntityType).map(entityType => ({
        entityType,
        retentionDays: entityType === client_2.RetentionEntityType.AUDIT_LOG ? 3650 : 365,
        autoPurge: false,
        archiveBeforeDelete: entityType === client_2.RetentionEntityType.AUDIT_LOG,
        legalHold: false
    }));
    await client_1.prisma.retentionPolicy.createMany({ data: defaults });
    return client_1.prisma.retentionPolicy.findMany();
};
exports.getRetentionPolicies = getRetentionPolicies;
const updateRetentionPolicy = async (entityType, updates, adminId, adminRole) => {
    const before = await client_1.prisma.retentionPolicy.findUnique({ where: { entityType } });
    const updated = await client_1.prisma.retentionPolicy.upsert({
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
        action: client_2.AuditActionType.UPDATE,
        entity: 'RetentionPolicy',
        targetId: updated.id,
        details: `Updated retention policy ${entityType}`,
        snapshot: { before, after: updated }
    });
    return updated;
};
exports.updateRetentionPolicy = updateRetentionPolicy;
const runRetentionJobs = async (adminId, adminRole) => {
    const policies = await client_1.prisma.retentionPolicy.findMany({
        where: { autoPurge: true, legalHold: false }
    });
    const now = new Date();
    const results = {};
    for (const policy of policies) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - policy.retentionDays);
        if (policy.entityType === client_2.RetentionEntityType.REPORT) {
            const res = await client_1.prisma.report.deleteMany({ where: { createdAt: { lt: cutoff } } });
            results.REPORT = (results.REPORT || 0) + res.count;
        }
        if (policy.entityType === client_2.RetentionEntityType.ANALYTICS) {
            const res = await client_1.prisma.orgAnalytics.deleteMany({ where: { date: { lt: cutoff } } });
            results.ANALYTICS = (results.ANALYTICS || 0) + res.count;
        }
        if (policy.entityType === client_2.RetentionEntityType.EXPORT) {
            const res = await client_1.prisma.complianceExport.deleteMany({ where: { createdAt: { lt: cutoff } } });
            results.EXPORT = (results.EXPORT || 0) + res.count;
        }
        if (policy.entityType === client_2.RetentionEntityType.AUDIT_LOG && !policy.archiveBeforeDelete) {
            const res = await client_1.prisma.adminLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
            results.AUDIT_LOG = (results.AUDIT_LOG || 0) + res.count;
        }
        if (policy.entityType === client_2.RetentionEntityType.ORGANIZATION) {
            const res = await client_1.prisma.organization.deleteMany({ where: { deletedAt: { lt: cutoff } } });
            results.ORGANIZATION = (results.ORGANIZATION || 0) + res.count;
        }
        if (policy.entityType === client_2.RetentionEntityType.USER) {
            const res = await client_1.prisma.user.deleteMany({ where: { createdAt: { lt: cutoff } } });
            results.USER = (results.USER || 0) + res.count;
        }
    }
    await auditService.logAction({
        adminId,
        actorRole: adminRole,
        action: client_2.AuditActionType.OTHER,
        entity: 'RetentionJob',
        targetId: undefined,
        details: `Retention job executed at ${now.toISOString()}`,
        snapshot: results
    });
    return results;
};
exports.runRetentionJobs = runRetentionJobs;
const runScheduledComplianceJobs = async (adminId, adminRole) => {
    const integrity = await (0, exports.validateAuditChain)(1000);
    const retention = await (0, exports.runRetentionJobs)(adminId, adminRole);
    return { integrity, retention };
};
exports.runScheduledComplianceJobs = runScheduledComplianceJobs;
