import { Request, Response } from 'express';
import * as auditService from '../services/audit.service';
import { AuditActionType } from '@prisma/client';

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page, limit, adminId, action, entity, startDate, endDate } = req.query;

        const filters = {
            adminId: adminId as string,
            action: action as AuditActionType,
            entity: entity as string,
            startDate: startDate ? new Date(startDate as string) : undefined,
            endDate: endDate ? new Date(endDate as string) : undefined
        };

        const result = await auditService.getLogs(
            Number(page) || 1,
            Number(limit) || 20,
            filters
        );

        res.json(result);
    } catch (error: any) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ message: 'Error fetching audit logs' });
    }
};

export const getAuditAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await auditService.getAnalytics();
        res.json(result);
    } catch (error: any) {
        console.error('Error fetching audit analytics:', error);
        res.status(500).json({ message: 'Error fetching audit analytics' });
    }
};

export const exportAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
        const { startDate, endDate, format } = req.query;

        const filters = {
            startDate: startDate ? new Date(startDate as string) : undefined,
            endDate: endDate ? new Date(endDate as string) : undefined
        };

        if ((format as string) === 'json') {
            const data = await auditService.exportLogsJson(filters);
            res.header('Content-Type', 'application/json');
            res.send(data);
            return;
        }

        const csvData = await auditService.exportLogs(filters);
        res.header('Content-Type', 'text/csv');
        res.attachment(`audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvData);

    } catch (error: any) {
        console.error('Error exporting audit logs:', error);
        res.status(500).json({ message: 'Error exporting logs' });
    }
};
