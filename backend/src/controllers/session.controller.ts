import { Request, Response } from 'express';
import { listActiveAdminSessions, revokeSession } from '../services/session.service';

export const getAdminSessions = async (req: Request, res: Response): Promise<void> => {
    try {
        const sessions = await listActiveAdminSessions();
        res.json(sessions);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to load sessions' });
    }
};

export const revokeAdminSession = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const session = await revokeSession(id as string);
        res.json({ message: 'Session revoked', session });
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Failed to revoke session' });
    }
};
