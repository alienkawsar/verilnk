import { Request, Response } from 'express';
import * as siteService from '../services/site.service';
import { getOrganizationEntitlements } from '../services/entitlement.service';
import {
    createSiteSchema,
    updateSiteSchema,
    updateSiteStatusSchema,
} from '../validations/site.validation';

export const getSites = async (req: Request, res: Response): Promise<void> => {
    try {
        const { countryId, stateId, categoryId, status, search, organizationId, type, page, limit } = req.query;
        const sites = await siteService.getAllSites(
            countryId as string,
            stateId as string,
            categoryId as string,
            status as any, // TODO: better type check
            search as string,
            organizationId as string,
            type as any // 'independent' | 'organization'
        );

        const shouldPaginate = page !== undefined || limit !== undefined;
        if (shouldPaginate) {
            const DEFAULT_LIMIT = 15;
            const MAX_LIMIT = 15;
            const pageNum = Math.max(parseInt(page as string) || 1, 1);
            const limitNum = Math.min(Math.max(parseInt(limit as string) || DEFAULT_LIMIT, 1), MAX_LIMIT);
            const total = sites.length;
            const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
            const safePage = totalPages === 0 ? 1 : Math.min(pageNum, totalPages);
            const start = (safePage - 1) * limitNum;
            const pageItems = sites.slice(start, start + limitNum);
            const payload = pageItems.map((site) => ({
                ...site,
                organizationPublic: site.organization && !(site.organization as any).deletedAt
                    ? getOrganizationEntitlements(site.organization).canAccessOrgPage
                    : false
            }));

            res.json({
                items: payload,
                page: safePage,
                limit: limitNum,
                total,
                totalPages
            });
            return;
        }

        const payload = sites.map((site) => ({
            ...site,
            organizationPublic: site.organization && !(site.organization as any).deletedAt
                ? getOrganizationEntitlements(site.organization).canAccessOrgPage
                : false
        }));
        res.json(payload);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sites' });
    }
};

export const getSite = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const site = await siteService.getSiteById(id as string);
        if (!site) {
            res.status(404).json({ message: 'Site not found' });
            return;
        }
        res.json(site);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching site' });
    }
};

export const createSite = async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = createSiteSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }

        const siteData = { ...validation.data };

        // Auto-approve if Super Admin or Moderator
        // req.user is set by authMiddleware
        const user = (req as any).user;
        if (user && (user.role === 'SUPER_ADMIN' || user.role === 'MODERATOR')) {
            siteData.status = 'SUCCESS'; // Enum value for APPROVED/VERIFIED
        }

        const auditContext = user ? {
            adminId: user.id,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        } : undefined;

        const site = await siteService.createSite(siteData, auditContext);
        res.status(201).json(site);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error creating site' });
    }
};

export const updateSite = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const validation = updateSiteSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }

        // Justification for using `validation.data` as is:
        // Zod validation returns safe parsed data which matches the expected Partial structure for update.
        // We need to cast or rely on service handling. Service expects {name?, url?, ...}
        // which Zod schema provides.
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? {
            adminId: user.id,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        } : undefined;

        const site = await siteService.updateSite(id as string, validation.data, auditContext);
        res.json(site);
    } catch (error: any) {
        if (error.message === 'Site not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating site' });
    }
};

export const updateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const validation = updateSiteStatusSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: validation.error.issues
            });
            return;
        }

        // @ts-ignore
        const user = req.user;
        const auditContext = user ? {
            adminId: user.id,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        } : undefined;

        const site = await siteService.updateSiteStatus(
            id as string,
            validation.data.status,
            auditContext
        );
        res.json(site);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Error updating site status' });
    }
};

export const deleteSite = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // @ts-ignore
        const user = req.user;
        const auditContext = user ? {
            adminId: user.id,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        } : undefined;

        await siteService.deleteSite(id as string, auditContext);
        res.json({ message: 'Site deleted successfully' });
    } catch (error: any) {
        if (error.message === 'Site not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(500).json({ message: 'Error deleting site' });
    }
};
