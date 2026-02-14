import { Request, Response } from 'express';
import * as meilisearchService from '../services/meilisearch.service';
import * as adminService from '../services/admin.service';
import { z } from 'zod';
import { STRONG_PASSWORD_MESSAGE, STRONG_PASSWORD_REGEX } from '../utils/passwordPolicy';

// Schemas
const createAdminSchema = z.object({
    email: z.string().email(),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.enum(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER'])
});

const updateAdminSchema = z.object({
    email: z.string().email().optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    role: z.enum(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']).optional(),
    password: z.string().regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE).optional(),
});

export const reindexSearch = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await meilisearchService.reindexAllSites();
        res.json({
            message: 'Re-indexing initiated successfully',
            details: result
        });
    } catch (error: any) {
        console.error('Re-index request failed:', error);
        res.status(500).json({ message: 'Failed to trigger re-indexing' });
    }
};

export const getAdmins = async (req: Request, res: Response): Promise<void> => {
    try {
        const { role, search } = req.query;
        console.log('getAdmins Filters:', { role, search });
        const admins = await adminService.getAllAdmins({
            role: role as any,
            search: search as string
        });
        console.log(`Found ${admins.length} admins`);
        res.json(admins);
    } catch (error: any) {
        console.error('Error fetching admins:', error);
        res.status(500).json({ message: 'Error fetching admins' });
    }
};

export const createAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = createAdminSchema.parse(req.body);
        // @ts-ignore
        const creatorId = req.user.id;

        const admin = await adminService.createAdmin(data, {
            adminId: creatorId,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
        res.status(201).json(admin);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error creating admin' });
    }
};

export const updateAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = updateAdminSchema.parse(req.body);
        // @ts-ignore
        const currentAdminId = req.user.id; // The one performing the update

        const admin = await adminService.updateAdmin(id as string, data, {
            adminId: currentAdminId,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
        res.json(admin);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating admin' });
    }
};

export const deleteAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const currentAdminId = req.user.id;
        await adminService.deleteAdmin(id as string, currentAdminId, {
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
        res.json({ message: 'Admin deleted successfully' });
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error deleting admin' });
    }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        // @ts-ignore
        const id = req.user.id;
        const data = updateAdminSchema.parse(req.body);

        const admin = await adminService.updateAdmin(id, data, {
            adminId: id, // Self update
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
        res.json(admin);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating profile' });
    }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
    // Separate endpoint if strict validation needed (old password check)
    // admin.service's updateAdmin handles password hashing directly if passed.
    // For specific "Change Password" flow requiring old password, implement logic here.
    // For MVP, reused updateAdmin via updateProfile or direct update is fine.
    // Let's rely on updateProfile for self, updateAdmin for super admin.
    res.status(501).json({ message: 'Use update profile endpoint' });
};

// Site Management (Bulk)
export const bulkDeleteSites = async (req: Request, res: Response): Promise<void> => {
    try {
        const { siteIds } = req.body;

        if (!Array.isArray(siteIds) || siteIds.length === 0) {
            res.status(400).json({ message: 'Invalid payload: siteIds array required' });
            return;
        }

        // Service call
        const { deleteSites } = require('../services/site.service'); // Import
        const result = await deleteSites(siteIds);

        res.json({
            message: `Successfully deleted ${result.count} sites`,
            deletedCount: result.count
        });
    } catch (error: any) {
        console.error('Bulk delete error:', error);
        res.status(500).json({ message: error.message || 'Bulk delete failed' });
    }
};
