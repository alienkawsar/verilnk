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
Object.defineProperty(exports, "__esModule", { value: true });
exports.runComplianceJobs = exports.updateRetentionPolicy = exports.listRetentionPolicies = exports.downloadExport = exports.exportEvidence = exports.updateIncident = exports.createIncident = exports.listIncidents = exports.validateIntegrity = exports.getDashboard = void 0;
const complianceService = __importStar(require("../services/compliance.service"));
const getDashboard = async (req, res) => {
    try {
        const data = await complianceService.getComplianceDashboard();
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to load compliance dashboard' });
    }
};
exports.getDashboard = getDashboard;
const validateIntegrity = async (req, res) => {
    try {
        const result = await complianceService.validateAuditChain(1000);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to validate audit chain' });
    }
};
exports.validateIntegrity = validateIntegrity;
const listIncidents = async (req, res) => {
    try {
        const incidents = await complianceService.listIncidents();
        res.json(incidents);
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to load incidents' });
    }
};
exports.listIncidents = listIncidents;
const createIncident = async (req, res) => {
    try {
        // @ts-ignore
        const user = req.user;
        const payload = req.body || {};
        const incident = await complianceService.createIncident({
            type: payload.type,
            severity: payload.severity,
            relatedEntity: payload.relatedEntity,
            relatedId: payload.relatedId,
            reportedBy: payload.reportedBy,
            assignedTo: payload.assignedTo,
            timeline: payload.timeline,
            evidenceLinks: payload.evidenceLinks,
            adminId: user.id,
            adminRole: user.role
        });
        res.json(incident);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to create incident' });
    }
};
exports.createIncident = createIncident;
const updateIncident = async (req, res) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const incidentId = Array.isArray(id) ? id[0] : id;
        const updated = await complianceService.updateIncident(incidentId, req.body, user.id, user.role);
        res.json(updated);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to update incident' });
    }
};
exports.updateIncident = updateIncident;
const exportEvidence = async (req, res) => {
    try {
        const { type, format, filters } = req.body || {};
        // @ts-ignore
        const user = req.user;
        const exportType = (type || 'AUDIT_LOGS');
        const exportFormat = (format || 'JSON');
        const { exportRecord, payload } = await complianceService.createExport({
            type: exportType,
            format: exportFormat,
            filters,
            adminId: user.id,
            adminRole: user.role
        });
        res.json({
            export: exportRecord,
            checksum: exportRecord.checksum,
            recordCount: exportRecord.recordCount,
            data: payload.data,
            watermark: `Exported by ${user.email} at ${new Date().toISOString()}`
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Failed to export evidence' });
    }
};
exports.exportEvidence = exportEvidence;
const downloadExport = async (req, res) => {
    try {
        // @ts-ignore
        const user = req.user;
        const { type, format, startDate, endDate } = req.query;
        const exportType = (type || 'AUDIT_LOGS');
        const exportFormat = (format || 'JSON');
        const filters = {
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        };
        const { exportRecord, payload } = await complianceService.createExport({
            type: exportType,
            format: exportFormat,
            filters,
            adminId: user.id,
            adminRole: user.role
        });
        const filename = `compliance_${exportType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.${exportFormat === 'CSV' ? 'csv' : 'json'}`;
        res.setHeader('X-Export-Checksum', exportRecord.checksum || '');
        res.setHeader('X-Export-Record-Id', exportRecord.id);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', exportFormat === 'CSV' ? 'text/csv' : 'application/json');
        res.send(payload.data);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Failed to download export' });
    }
};
exports.downloadExport = downloadExport;
const listRetentionPolicies = async (req, res) => {
    try {
        const policies = await complianceService.getRetentionPolicies();
        res.json(policies);
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to load retention policies' });
    }
};
exports.listRetentionPolicies = listRetentionPolicies;
const updateRetentionPolicy = async (req, res) => {
    try {
        const { entityType } = req.params;
        // @ts-ignore
        const user = req.user;
        const updated = await complianceService.updateRetentionPolicy(entityType, req.body, user.id, user.role);
        res.json(updated);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Failed to update retention policy' });
    }
};
exports.updateRetentionPolicy = updateRetentionPolicy;
const runComplianceJobs = async (req, res) => {
    try {
        // @ts-ignore
        const user = req.user;
        const results = await complianceService.runRetentionJobs(user.id, user.role);
        res.json({ message: 'Compliance jobs executed', results });
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Failed to run compliance jobs' });
    }
};
exports.runComplianceJobs = runComplianceJobs;
