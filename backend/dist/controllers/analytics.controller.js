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
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../db/client')));
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
        if (format === 'csv') {
            // Generate CSV
            let csv = 'Analytics Report\n\n';
            csv += 'Summary\n';
            csv += `Range,${data.summary.range}\n`;
            csv += `Total Views,${data.summary.totalViews}\n`;
            csv += `Total Clicks,${data.summary.totalClicks}\n`;
            csv += `Avg Daily Views,${data.summary.avgDailyViews}\n`;
            csv += `Avg Daily Clicks,${data.summary.avgDailyClicks}\n\n`;
            csv += 'Daily Stats\n';
            csv += 'Date,Views,Clicks\n';
            for (const stat of data.dailyStats) {
                csv += `${stat.date},${stat.views},${stat.clicks}\n`;
            }
            csv += '\n';
            csv += 'Top Categories\n';
            csv += 'Category,Views,Clicks\n';
            for (const cat of data.topCategories) {
                csv += `${cat.name},${cat.views},${cat.clicks}\n`;
            }
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-${orgId}-${validRange}.csv"`);
            res.send(csv);
        }
        else if (format === 'pdf') {
            // Generate actual PDF using PDFKit
            const PDFDocument = (await Promise.resolve().then(() => __importStar(require('pdfkit')))).default;
            const doc = new PDFDocument({ margin: 50 });
            // Collect PDF data in buffer
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                console.log(`PDF generated, size: ${pdfBuffer.length} bytes`);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="verilnk-analytics-${validRange}.pdf"`);
                res.setHeader('Content-Length', pdfBuffer.length);
                res.send(pdfBuffer);
            });
            // Title
            doc.fontSize(24).font('Helvetica-Bold').text('VeriLnk Analytics Report', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).font('Helvetica').fillColor('#666666').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
            doc.text(`Range: ${validRange}`, { align: 'center' });
            doc.moveDown(2);
            // Summary Section
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e293b').text('Summary');
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica').fillColor('#334155');
            doc.text(`Total Views: ${data.summary.totalViews.toLocaleString()}`);
            doc.text(`Total Clicks: ${data.summary.totalClicks.toLocaleString()}`);
            doc.text(`Average Daily Views: ${data.summary.avgDailyViews.toLocaleString()}`);
            doc.text(`Average Daily Clicks: ${data.summary.avgDailyClicks.toLocaleString()}`);
            doc.moveDown(1.5);
            // Daily Stats Table
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e293b').text('Daily Statistics');
            doc.moveDown(0.5);
            // Table headers
            const tableTop = doc.y;
            const col1 = 50, col2 = 200, col3 = 350;
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#475569');
            doc.text('Date', col1, tableTop);
            doc.text('Views', col2, tableTop);
            doc.text('Clicks', col3, tableTop);
            doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke('#e2e8f0');
            // Table rows (limit to 15 most recent days for readability)
            let y = tableTop + 25;
            doc.font('Helvetica').fillColor('#334155');
            const statsToShow = data.dailyStats.slice(-15);
            for (const stat of statsToShow) {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }
                doc.text(stat.date, col1, y);
                doc.text(stat.views.toString(), col2, y);
                doc.text(stat.clicks.toString(), col3, y);
                y += 18;
            }
            doc.moveDown(2);
            // Top Categories
            if (data.topCategories.length > 0) {
                doc.y = y + 20;
                doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e293b').text('Top Categories');
                doc.moveDown(0.5);
                doc.fontSize(10).font('Helvetica').fillColor('#334155');
                for (const cat of data.topCategories.slice(0, 10)) {
                    doc.text(`• ${cat.name}: ${cat.views.toLocaleString()} views, ${cat.clicks.toLocaleString()} clicks`);
                }
            }
            // Footer
            doc.fontSize(9).fillColor('#94a3b8');
            doc.text('Generated by VeriLnk - https://verilnk.com', 50, 750, { align: 'center' });
            // Finalize the PDF
            doc.end();
            return; // Response sent in doc.on('end')
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
