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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const adminController = __importStar(require("../controllers/admin.controller"));
const sessionController = __importStar(require("../controllers/session.controller"));
const orgController = __importStar(require("../controllers/organization.controller"));
const categoryController = __importStar(require("../controllers/category.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Trigger full search re-indexing (Super Admin & Moderator only)
router.post('/reindex', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR']), adminController.reindexSearch);
// Admin Management (Super Admin Only)
router.get('/', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminController.getAdmins);
router.post('/', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminController.createAdmin);
router.patch('/:id', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminController.updateAdmin);
router.delete('/:id', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminController.deleteAdmin);
router.get('/sessions', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), sessionController.getAdminSessions);
router.post('/sessions/:id/revoke', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), sessionController.revokeAdminSession);
// Bulk Import Routes (Super Admin Only)
router.delete('/sites/bulk-delete', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminController.bulkDeleteSites);
// Organization Recovery (Super Admin Only)
router.post('/org/:id/restore', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), orgController.restoreOrganization);
router.post('/org/:id/permanent-delete', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), orgController.permanentlyDeleteOrganization);
// Bulk Import Routes (Super Admin Only)
const multer_1 = __importDefault(require("multer"));
const bulkImportController = __importStar(require("../controllers/bulk-import.controller"));
const adminCredController = __importStar(require("../controllers/admin.credentials.controller"));
const upload = (0, multer_1.default)({ dest: 'uploads/' });
router.post('/bulk-import/upload', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), upload.single('file'), bulkImportController.uploadImport);
router.get('/bulk-import/status/:id', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), bulkImportController.getJobStatus);
// Organization Credential Management (Super Admin Only)
router.patch('/organizations/:id/credentials/email', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminCredController.updateOrgLoginEmail);
router.post('/organizations/:id/credentials/reset-password', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminCredController.resetOrgPassword);
// Categories & Tags (Super Admin + Moderator)
router.get('/categories', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR']), categoryController.getAdminCategories);
router.post('/categories', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR']), categoryController.createCategory);
router.put('/categories/:id', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR']), categoryController.updateCategory);
router.delete('/categories/:id', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR']), categoryController.deleteCategory);
router.get('/tags', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR']), categoryController.getTags);
router.post('/tags', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR']), categoryController.createTag);
router.put('/categories/:id/tags', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN', 'MODERATOR']), categoryController.setCategoryTags);
// Self Management (All Admins)
router.patch('/me/profile', auth_middleware_1.authenticateAdmin, adminController.updateProfile);
// Enterprise Management (Super Admin Only)
const adminEnterpriseController = __importStar(require("../controllers/admin.enterprise.controller"));
router.get('/enterprise', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.listEnterprisesAdmin);
router.get('/enterprise/workspaces', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.listEnterpriseWorkspaces);
router.post('/enterprise/workspaces', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.createEnterpriseWorkspaceAdmin);
router.get('/enterprise/workspaces/:id', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.getWorkspaceDetails);
router.patch('/enterprise/workspaces/:id', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.updateEnterpriseWorkspaceAdmin);
router.delete('/enterprise/workspaces/:id', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.deleteEnterpriseWorkspaceAdmin);
router.get('/enterprise/workspaces/:id/api-keys', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.listWorkspaceApiKeys);
router.delete('/enterprise/workspaces/:id/api-keys/:keyId', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.revokeWorkspaceApiKey);
router.post('/enterprise/workspaces/:id/api-keys/:keyId/rotate', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.rotateWorkspaceApiKeyAdmin);
router.patch('/enterprise/workspaces/:id/api-keys/:keyId/rate-limit', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.updateWorkspaceApiKeyRateLimitAdmin);
router.post('/enterprise/workspaces/:id/api-keys', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.createWorkspaceApiKeyAdmin);
router.patch('/enterprise/workspaces/:id/rate-limits', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.updateWorkspaceRateLimits);
router.get('/enterprise/workspaces/:id/usage-logs', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.getWorkspaceUsageLogsAdmin);
router.get('/enterprise/usage-logs', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.getGlobalUsageLogsAdmin);
router.get('/enterprise/:orgId', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.getEnterpriseDetailAdmin);
router.patch('/enterprise/:orgId/status', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.setEnterpriseAccessStatusAdmin);
router.get('/enterprise/:orgId/workspaces', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.listEnterpriseWorkspacesAdmin);
router.post('/enterprise/:orgId/workspaces', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.createEnterpriseWorkspaceForOrganizationAdmin);
router.get('/enterprise/:orgId/workspaces/:workspaceId', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.getEnterpriseWorkspaceDetailAdmin);
router.post('/enterprise/:orgId/workspaces/:workspaceId/members', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.addEnterpriseWorkspaceMemberAdmin);
router.post('/enterprise/:orgId/api-keys', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.createEnterpriseApiKeyAdmin);
router.patch('/enterprise/:orgId/rate-limits', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.updateEnterpriseRateLimitsAdmin);
router.get('/enterprise/:orgId/usage', auth_middleware_1.authenticateAdmin, (0, auth_middleware_1.authorizeRole)(['SUPER_ADMIN']), adminEnterpriseController.getEnterpriseUsageAdmin);
exports.default = router;
