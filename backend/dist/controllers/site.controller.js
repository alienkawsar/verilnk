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
exports.deleteSite = exports.updateStatus = exports.updateSite = exports.createSite = exports.getSite = exports.getSites = void 0;
const siteService = __importStar(require("../services/site.service"));
const entitlement_service_1 = require("../services/entitlement.service");
const site_validation_1 = require("../validations/site.validation");
const getSites = async (req, res) => {
    try {
        const { countryId, stateId, categoryId, status, search, organizationId, type, page, limit } = req.query;
        const sites = await siteService.getAllSites(countryId, stateId, categoryId, status, // TODO: better type check
        search, organizationId, type // 'independent' | 'organization'
        );
        const shouldPaginate = page !== undefined || limit !== undefined;
        if (shouldPaginate) {
            const DEFAULT_LIMIT = 15;
            const MAX_LIMIT = 15;
            const pageNum = Math.max(parseInt(page) || 1, 1);
            const limitNum = Math.min(Math.max(parseInt(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
            const total = sites.length;
            const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
            const safePage = totalPages === 0 ? 1 : Math.min(pageNum, totalPages);
            const start = (safePage - 1) * limitNum;
            const pageItems = sites.slice(start, start + limitNum);
            const payload = pageItems.map((site) => ({
                ...site,
                organizationPublic: site.organization && !site.organization.deletedAt
                    ? (0, entitlement_service_1.getOrganizationEntitlements)(site.organization).canAccessOrgPage
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
            organizationPublic: site.organization && !site.organization.deletedAt
                ? (0, entitlement_service_1.getOrganizationEntitlements)(site.organization).canAccessOrgPage
                : false
        }));
        res.json(payload);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching sites' });
    }
};
exports.getSites = getSites;
const getSite = async (req, res) => {
    try {
        const { id } = req.params;
        const site = await siteService.getSiteById(id);
        if (!site) {
            res.status(404).json({ message: 'Site not found' });
            return;
        }
        res.json(site);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching site' });
    }
};
exports.getSite = getSite;
const createSite = async (req, res) => {
    try {
        const validation = site_validation_1.createSiteSchema.safeParse(req.body);
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
        const user = req.user;
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
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error creating site' });
    }
};
exports.createSite = createSite;
const updateSite = async (req, res) => {
    try {
        const { id } = req.params;
        const validation = site_validation_1.updateSiteSchema.safeParse(req.body);
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
        const site = await siteService.updateSite(id, validation.data, auditContext);
        res.json(site);
    }
    catch (error) {
        if (error.message === 'Site not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating site' });
    }
};
exports.updateSite = updateSite;
const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const validation = site_validation_1.updateSiteStatusSchema.safeParse(req.body);
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
        const site = await siteService.updateSiteStatus(id, validation.data.status, auditContext);
        res.json(site);
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error updating site status' });
    }
};
exports.updateStatus = updateStatus;
const deleteSite = async (req, res) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const user = req.user;
        const auditContext = user ? {
            adminId: user.id,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        } : undefined;
        await siteService.deleteSite(id, auditContext);
        res.json({ message: 'Site deleted successfully' });
    }
    catch (error) {
        if (error.message === 'Site not found') {
            res.status(404).json({ message: error.message });
            return;
        }
        res.status(500).json({ message: 'Error deleting site' });
    }
};
exports.deleteSite = deleteSite;
