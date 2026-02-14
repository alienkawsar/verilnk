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
exports.bulkDeleteSites = exports.changePassword = exports.updateProfile = exports.deleteAdmin = exports.updateAdmin = exports.createAdmin = exports.getAdmins = exports.reindexSearch = void 0;
const meilisearchService = __importStar(require("../services/meilisearch.service"));
const adminService = __importStar(require("../services/admin.service"));
const zod_1 = require("zod");
const passwordPolicy_1 = require("../utils/passwordPolicy");
// Schemas
const createAdminSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().regex(passwordPolicy_1.STRONG_PASSWORD_REGEX, passwordPolicy_1.STRONG_PASSWORD_MESSAGE),
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    role: zod_1.z.enum(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER'])
});
const updateAdminSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    firstName: zod_1.z.string().min(1).optional(),
    lastName: zod_1.z.string().min(1).optional(),
    role: zod_1.z.enum(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']).optional(),
    password: zod_1.z.string().regex(passwordPolicy_1.STRONG_PASSWORD_REGEX, passwordPolicy_1.STRONG_PASSWORD_MESSAGE).optional(),
});
const reindexSearch = async (req, res) => {
    try {
        const result = await meilisearchService.reindexAllSites();
        res.json({
            message: 'Re-indexing initiated successfully',
            details: result
        });
    }
    catch (error) {
        console.error('Re-index request failed:', error);
        res.status(500).json({ message: 'Failed to trigger re-indexing' });
    }
};
exports.reindexSearch = reindexSearch;
const getAdmins = async (req, res) => {
    try {
        const { role, search } = req.query;
        console.log('getAdmins Filters:', { role, search });
        const admins = await adminService.getAllAdmins({
            role: role,
            search: search
        });
        console.log(`Found ${admins.length} admins`);
        res.json(admins);
    }
    catch (error) {
        console.error('Error fetching admins:', error);
        res.status(500).json({ message: 'Error fetching admins' });
    }
};
exports.getAdmins = getAdmins;
const createAdmin = async (req, res) => {
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error creating admin' });
    }
};
exports.createAdmin = createAdmin;
const updateAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const data = updateAdminSchema.parse(req.body);
        // @ts-ignore
        const currentAdminId = req.user.id; // The one performing the update
        const admin = await adminService.updateAdmin(id, data, {
            adminId: currentAdminId,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
        res.json(admin);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating admin' });
    }
};
exports.updateAdmin = updateAdmin;
const deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        // @ts-ignore
        const currentAdminId = req.user.id;
        await adminService.deleteAdmin(id, currentAdminId, {
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
        res.json({ message: 'Admin deleted successfully' });
    }
    catch (error) {
        res.status(400).json({ message: error.message || 'Error deleting admin' });
    }
};
exports.deleteAdmin = deleteAdmin;
const updateProfile = async (req, res) => {
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ errors: error.issues });
            return;
        }
        res.status(400).json({ message: error.message || 'Error updating profile' });
    }
};
exports.updateProfile = updateProfile;
const changePassword = async (req, res) => {
    // Separate endpoint if strict validation needed (old password check)
    // admin.service's updateAdmin handles password hashing directly if passed.
    // For specific "Change Password" flow requiring old password, implement logic here.
    // For MVP, reused updateAdmin via updateProfile or direct update is fine.
    // Let's rely on updateProfile for self, updateAdmin for super admin.
    res.status(501).json({ message: 'Use update profile endpoint' });
};
exports.changePassword = changePassword;
// Site Management (Bulk)
const bulkDeleteSites = async (req, res) => {
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
    }
    catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({ message: error.message || 'Bulk delete failed' });
    }
};
exports.bulkDeleteSites = bulkDeleteSites;
