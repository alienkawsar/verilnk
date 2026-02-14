import { Request, Response } from 'express';
import * as stateService from '../services/state.service';

export const getStates = async (req: Request, res: Response): Promise<void> => {
    try {
        const countryId = req.query.countryId as string;
        const states = await stateService.getAllStates(countryId);
        res.json(states);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createState = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, code, countryId } = req.body;
        if (!name || !countryId) {
            res.status(400).json({ message: 'Name and Country ID are required' });
            return;
        }

        // @ts-ignore
        const user = (req as any).user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        const state = await stateService.createState({ name, code, countryId }, auditContext);
        res.status(201).json(state);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const updateState = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = (req as any).user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        const state = await stateService.updateState(id as string, req.body, auditContext);
        res.json(state);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const deleteState = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = (req as any).user;
        const auditContext = user ? { adminId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] } : undefined;

        await stateService.deleteState(id as string, auditContext);
        res.json({ message: 'State deleted successfully' });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};
