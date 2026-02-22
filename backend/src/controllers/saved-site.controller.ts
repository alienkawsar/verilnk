import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import * as savedSiteService from '../services/saved-site.service';

const siteIdSchema = z.string().uuid();
const listQuerySchema = z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(30).optional()
});

const getRequestUserId = (req: AuthRequest) => {
    const userId = req.user?.id;
    return typeof userId === 'string' ? userId : null;
};

export const listMySavedSites = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = getRequestUserId(req);
    if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const parsedQuery = listQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
        res.status(400).json({ message: 'Invalid pagination parameters' });
        return;
    }

    try {
        const result = await savedSiteService.listSavedSitesForUser(userId, parsedQuery.data);
        res.json(result);
    } catch (error) {
        console.error('Failed to list saved sites:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const listMySavedSiteIds = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = getRequestUserId(req);
    if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    try {
        const siteIds = await savedSiteService.getSavedSiteIdsForUser(userId);
        res.json({ siteIds });
    } catch (error) {
        console.error('Failed to fetch saved site ids:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const saveMySite = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = getRequestUserId(req);
    if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const parsedSiteId = siteIdSchema.safeParse(req.params.siteId);
    if (!parsedSiteId.success) {
        res.status(400).json({ message: 'Invalid siteId' });
        return;
    }

    try {
        const result = await savedSiteService.saveSiteForUser(userId, parsedSiteId.data);
        if (!result.ok && result.reason === 'NOT_FOUND') {
            res.status(404).json({ message: 'Site not found' });
            return;
        }
        res.json({ ok: true });
    } catch (error) {
        console.error('Failed to save site:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const unsaveMySite = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = getRequestUserId(req);
    if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const parsedSiteId = siteIdSchema.safeParse(req.params.siteId);
    if (!parsedSiteId.success) {
        res.status(400).json({ message: 'Invalid siteId' });
        return;
    }

    try {
        await savedSiteService.unsaveSiteForUser(userId, parsedSiteId.data);
        res.json({ ok: true });
    } catch (error) {
        console.error('Failed to unsave site:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
