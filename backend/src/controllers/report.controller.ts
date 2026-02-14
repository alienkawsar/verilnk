import { Request, Response } from 'express';
import * as reportService from '../services/report.service';

// Helper to get IP
const getIp = (req: Request): string => {
    return (
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || ''
    );
};

export const createReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { siteId, reason } = req.body;
        if (!siteId || !reason) {
            res.status(400).json({ message: 'Site ID and reason are required' });
            return;
        }

        const ip = getIp(req);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const user = (req as any).user;

        if (!user || !user.id) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        await reportService.createReport(siteId, user.id, reason, ip);
        res.status(201).json({ message: 'Report submitted successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Error submitting report' });
    }
};

export const getReports = async (req: Request, res: Response): Promise<void> => {
    try {
        const reports = await reportService.getAllReports();
        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching reports' });
    }
};
