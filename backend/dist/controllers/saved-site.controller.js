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
exports.unsaveMySite = exports.saveMySite = exports.listMySavedSiteIds = exports.listMySavedSites = void 0;
const zod_1 = require("zod");
const savedSiteService = __importStar(require("../services/saved-site.service"));
const siteIdSchema = zod_1.z.string().uuid();
const listQuerySchema = zod_1.z.object({
    cursor: zod_1.z.string().uuid().optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(30).optional()
});
const getRequestUserId = (req) => {
    const userId = req.user?.id;
    return typeof userId === 'string' ? userId : null;
};
const listMySavedSites = async (req, res) => {
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
    }
    catch (error) {
        console.error('Failed to list saved sites:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.listMySavedSites = listMySavedSites;
const listMySavedSiteIds = async (req, res) => {
    const userId = getRequestUserId(req);
    if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const siteIds = await savedSiteService.getSavedSiteIdsForUser(userId);
        res.json({ siteIds });
    }
    catch (error) {
        console.error('Failed to fetch saved site ids:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.listMySavedSiteIds = listMySavedSiteIds;
const saveMySite = async (req, res) => {
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
    }
    catch (error) {
        console.error('Failed to save site:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.saveMySite = saveMySite;
const unsaveMySite = async (req, res) => {
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
    }
    catch (error) {
        console.error('Failed to unsave site:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.unsaveMySite = unsaveMySite;
