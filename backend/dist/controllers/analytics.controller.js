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
exports.getBusinessInsights = exports.exportAnalytics = exports.getCategoryPerformance = exports.getTrafficHeatmap = exports.getOrgStats = exports.trackClick = exports.trackView = void 0;
const analyticsService = __importStar(require("../services/analytics.service"));
const entitlement_service_1 = require("../services/entitlement.service");
const client_1 = require("../db/client");
const analytics_report_export_service_1 = require("../services/analytics-report-export.service");
// Helper to get string from query param (handles Express query types)
const getQueryString = (param, defaultValue) => {
    if (param === undefined || param === null)
        return defaultValue;
    if (typeof param === 'string')
        return param;
    if (Array.isArray(param) && typeof param[0] === 'string')
        return param[0];
    return defaultValue;
};
// Helper to get orgId from params (Express route params are always strings)
const getOrgId = (req) => {
    const orgId = req.params.orgId;
    return typeof orgId === 'string' ? orgId : Array.isArray(orgId) ? orgId[0] : '';
};
// Helper to check authorization
const checkOrgAuthorization = async (req, orgId) => {
    const user = req.user;
    let isAuthorized = false;
    if (user.role === 'SUPER_ADMIN') {
        isAuthorized = true;
    }
    else if (user.organizationId === orgId) {
        isAuthorized = true;
    }
    else {
        const dbUser = await client_1.prisma.user.findUnique({
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
    const entitlementResult = await (0, entitlement_service_1.resolveOrganizationEntitlementsById)(orgId);
    if (!entitlementResult) {
        return { authorized: false };
    }
    return { authorized: true, entitlements: entitlementResult.entitlements };
};
const trackView = async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const { siteId } = req.body;
        const entitlementResult = await (0, entitlement_service_1.resolveOrganizationEntitlementsById)(orgId);
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
    }
    catch (error) {
        res.status(500).send({ error: 'Failed to track view' });
    }
};
exports.trackView = trackView;
const trackClick = async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const { siteId } = req.body;
        const entitlementResult = await (0, entitlement_service_1.resolveOrganizationEntitlementsById)(orgId);
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
    }
    catch (error) {
        res.status(500).send({ error: 'Failed to track click' });
    }
};
exports.trackClick = trackClick;
const getOrgStats = async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getOrgStats = getOrgStats;
// ===== NEW ENDPOINTS (PRO+ plans) =====
const getTrafficHeatmap = async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getTrafficHeatmap = getTrafficHeatmap;
const getCategoryPerformance = async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getCategoryPerformance = getCategoryPerformance;
const exportAnalytics = async (req, res) => {
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
        const organization = await client_1.prisma.organization.findUnique({
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
            const filename = (0, analytics_report_export_service_1.buildAnalyticsReportFilename)(entityName, 'organization', orgId, 'csv', generatedAt);
            const csv = (0, analytics_report_export_service_1.buildAnalyticsReportCsv)(rows);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csv);
        }
        else if (format === 'pdf') {
            const filename = (0, analytics_report_export_service_1.buildAnalyticsReportFilename)(entityName, 'organization', orgId, 'pdf', generatedAt);
            const totalCtr = data.summary.totalViews > 0
                ? (data.summary.totalClicks / data.summary.totalViews) * 100
                : 0;
            const pdfBuffer = await (0, analytics_report_export_service_1.buildAnalyticsReportPdfBuffer)({
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
        }
        else {
            res.json(data);
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.exportAnalytics = exportAnalytics;
const getBusinessInsights = async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getBusinessInsights = getBusinessInsights;
