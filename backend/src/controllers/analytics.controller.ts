import { Request, Response } from 'express';
import * as analyticsService from '../services/analytics.service';
import { resolveOrganizationEntitlementsById } from '../services/entitlement.service';
import { prisma } from '../db/client';
import {
    buildAnalyticsReportCsv,
    buildAnalyticsReportFilename,
    buildAnalyticsReportPdfBuffer
} from '../services/analytics-report-export.service';

// Helper to get string from query param (handles Express query types)
const getQueryString = (param: unknown, defaultValue: string): string => {
    if (param === undefined || param === null) return defaultValue;
    if (typeof param === 'string') return param;
    if (Array.isArray(param) && typeof param[0] === 'string') return param[0];
    return defaultValue;
};

// Helper to get orgId from params (Express route params are always strings)
const getOrgId = (req: Request): string => {
    const orgId = req.params.orgId;
    return typeof orgId === 'string' ? orgId : Array.isArray(orgId) ? orgId[0] : '';
};

// Helper to check authorization
const checkOrgAuthorization = async (req: Request, orgId: string): Promise<{ authorized: boolean; entitlements?: any }> => {
    const user = (req as any).user;
    let isAuthorized = false;

    if (user.role === 'SUPER_ADMIN') {
        isAuthorized = true;
    } else if (user.organizationId === orgId) {
        isAuthorized = true;
    } else {
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { organizationId: true }
        });
        if (dbUser && dbUser.organizationId === orgId) {
            isAuthorized = true;
        }
    }

    if (!isAuthorized) {
        return { authorized: false };
    }

    const entitlementResult = await resolveOrganizationEntitlementsById(orgId);
    if (!entitlementResult) {
        return { authorized: false };
    }

    return { authorized: true, entitlements: entitlementResult.entitlements };
};

export const trackView = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { siteId } = req.body;

        const entitlementResult = await resolveOrganizationEntitlementsById(orgId);
        if (!entitlementResult) {
            res.status(404).send({ error: 'Organization not found' });
            return;
        }

        if (entitlementResult.entitlements.analyticsLevel === 'NONE') {
            res.status(200).send({ success: true, skipped: true });
            return;
        }

        await analyticsService.trackView(orgId, siteId);
        res.status(200).send({ success: true });
    } catch (error) {
        res.status(500).send({ error: 'Failed to track view' });
    }
};

export const trackClick = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { siteId } = req.body;

        const entitlementResult = await resolveOrganizationEntitlementsById(orgId);
        if (!entitlementResult) {
            res.status(404).send({ error: 'Organization not found' });
            return;
        }

        if (entitlementResult.entitlements.analyticsLevel === 'NONE') {
            res.status(200).send({ success: true, skipped: true });
            return;
        }

        await analyticsService.trackClick(orgId, siteId);
        res.status(200).send({ success: true });
    } catch (error) {
        res.status(500).send({ error: 'Failed to track click' });
    }
};

export const getOrgStats = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const authResult = await checkOrgAuthorization(req, orgId);

        if (!authResult.authorized) {
            res.status(403).json({ message: 'Forbidden' });
            return;
        }

        if (authResult.entitlements.analyticsLevel === 'NONE') {
            res.status(403).json({ message: 'Analytics not available for current plan' });
            return;
        }

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        const stats = await analyticsService.getAnalytics(orgId);
        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// ===== NEW ENDPOINTS (PRO+ plans) =====

export const getTrafficHeatmap = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);

        const authResult = await checkOrgAuthorization(req, orgId);
        if (!authResult.authorized) {
            res.status(403).json({ message: 'Forbidden' });
            return;
        }

        // PRO+ only (ADVANCED or BUSINESS)
        if (authResult.entitlements.analyticsLevel !== 'ADVANCED' && authResult.entitlements.analyticsLevel !== 'BUSINESS') {
            res.status(403).json({ message: 'Upgrade to Pro to access Traffic Heatmap' });
            return;
        }

        const rangeParam = getQueryString(req.query.range, '7d');
        const validRanges = ['7d', '30d', '90d'];
        const validRange = validRanges.includes(rangeParam) ? rangeParam : '7d';

        const data = await analyticsService.getTrafficHeatmap(orgId, validRange);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getCategoryPerformance = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);

        const authResult = await checkOrgAuthorization(req, orgId);
        if (!authResult.authorized) {
            res.status(403).json({ message: 'Forbidden' });
            return;
        }

        // PRO+ only
        if (authResult.entitlements.analyticsLevel !== 'ADVANCED' && authResult.entitlements.analyticsLevel !== 'BUSINESS') {
            res.status(403).json({ message: 'Upgrade to Pro to access Category Performance' });
            return;
        }

        const rangeParam = getQueryString(req.query.range, '30d');
        const validRanges = ['7d', '30d', '90d'];
        const validRange = validRanges.includes(rangeParam) ? rangeParam : '30d';

        const data = await analyticsService.getCategoryPerformance(orgId, validRange);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const exportAnalytics = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);

        const authResult = await checkOrgAuthorization(req, orgId);
        if (!authResult.authorized) {
            res.status(403).json({ message: 'Forbidden' });
            return;
        }

        // PRO+ only with canExportReports
        if (!authResult.entitlements.canExportReports) {
            res.status(403).json({ message: 'Upgrade to Pro to export reports' });
            return;
        }

        const format = getQueryString(req.query.format, 'csv');
        const rangeParam = getQueryString(req.query.range, '30d');
        const validRanges = ['7d', '30d', '90d'];
        const validRange = validRanges.includes(rangeParam) ? rangeParam : '30d';

        const data = await analyticsService.getExportData(orgId, validRange);
        const rangeDays = Number.parseInt(validRange.replace(/[^0-9]/g, ''), 10) || 30;
        const generatedAt = new Date();
        const organization = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { name: true }
        });
        const entityName = organization?.name?.trim() || 'Organization';
        const rows = data.dailyStats.map((stat) => ({
            date: stat.date,
            views: stat.views,
            clicks: stat.clicks,
            ctr: stat.views > 0 ? (stat.clicks / stat.views) * 100 : 0
        }));

        if (format === 'csv') {
            const filename = buildAnalyticsReportFilename(entityName, 'organization', orgId, 'csv', generatedAt);
            const csv = buildAnalyticsReportCsv(rows);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csv);
        } else if (format === 'pdf') {
            const filename = buildAnalyticsReportFilename(entityName, 'organization', orgId, 'pdf', generatedAt);
            const totalCtr = data.summary.totalViews > 0
                ? (data.summary.totalClicks / data.summary.totalViews) * 100
                : 0;
            const pdfBuffer = await buildAnalyticsReportPdfBuffer({
                entityName,
                rangeLabel: `Last ${rangeDays} days`,
                generatedAt,
                totalViews: data.summary.totalViews,
                totalClicks: data.summary.totalClicks,
                totalCtr,
                rows
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
            return;
        } else {
            res.json(data);
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getBusinessInsights = async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);

        const authResult = await checkOrgAuthorization(req, orgId);
        if (!authResult.authorized) {
            res.status(403).json({ message: 'Forbidden' });
            return;
        }

        // BUSINESS only
        if (authResult.entitlements.analyticsLevel !== 'BUSINESS') {
            res.status(403).json({ message: 'Upgrade to Business to access Business Insights' });
            return;
        }

        const data = await analyticsService.getBusinessInsights(orgId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
