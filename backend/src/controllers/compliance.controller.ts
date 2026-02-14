import { Request, Response } from 'express';
import { ComplianceExportFormat, ComplianceExportType, ComplianceIncidentSeverity } from '@prisma/client';
import * as complianceService from '../services/compliance.service';

export const getDashboard = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = await complianceService.getComplianceDashboard();
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to load compliance dashboard' });
    }
};

export const validateIntegrity = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await complianceService.validateAuditChain(1000);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to validate audit chain' });
    }
};

export const listIncidents = async (req: Request, res: Response): Promise<void> => {
    try {
        const incidents = await complianceService.listIncidents();
        res.json(incidents);
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to load incidents' });
    }
};

export const createIncident = async (req: Request, res: Response): Promise<void> => {
    try {
        // @ts-ignore
        const user = req.user;
        const payload = req.body || {};
        const incident = await complianceService.createIncident({
            type: payload.type,
            severity: payload.severity as ComplianceIncidentSeverity,
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
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Failed to create incident' });
    }
};

export const updateIncident = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const incidentId = Array.isArray(id) ? id[0] : id;
        const updated = await complianceService.updateIncident(incidentId, req.body, user.id, user.role);
        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Failed to update incident' });
    }
};

export const exportEvidence = async (req: Request, res: Response): Promise<void> => {
    try {
        const { type, format, filters } = req.body || {};
        // @ts-ignore
        const user = req.user;
        const exportType = (type || 'AUDIT_LOGS') as ComplianceExportType;
        const exportFormat = (format || 'JSON') as ComplianceExportFormat;

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
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to export evidence' });
    }
};

export const downloadExport = async (req: Request, res: Response): Promise<void> => {
    try {
        // @ts-ignore
        const user = req.user;
        const { type, format, startDate, endDate } = req.query;
        const exportType = (type || 'AUDIT_LOGS') as ComplianceExportType;
        const exportFormat = (format || 'JSON') as ComplianceExportFormat;
        const filters = {
            startDate: startDate ? new Date(startDate as string) : undefined,
            endDate: endDate ? new Date(endDate as string) : undefined
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
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to download export' });
    }
};

export const listRetentionPolicies = async (req: Request, res: Response): Promise<void> => {
    try {
        const policies = await complianceService.getRetentionPolicies();
        res.json(policies);
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to load retention policies' });
    }
};

export const updateRetentionPolicy = async (req: Request, res: Response): Promise<void> => {
    try {
        const { entityType } = req.params;
        // @ts-ignore
        const user = req.user;
        const updated = await complianceService.updateRetentionPolicy(entityType as any, req.body, user.id, user.role);
        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Failed to update retention policy' });
    }
};

export const runComplianceJobs = async (req: Request, res: Response): Promise<void> => {
    try {
        // @ts-ignore
        const user = req.user;
        const results = await complianceService.runRetentionJobs(user.id, user.role);
        res.json({ message: 'Compliance jobs executed', results });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to run compliance jobs' });
    }
};
