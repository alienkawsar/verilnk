import express from 'express';
import * as adminController from '../controllers/admin.controller';
import * as sessionController from '../controllers/session.controller';
import * as orgController from '../controllers/organization.controller';
import * as categoryController from '../controllers/category.controller';
import { authenticateAdmin, authorizeRole } from '../middleware/auth.middleware';

const router = express.Router();

// Trigger full search re-indexing (Super Admin & Moderator only)
router.post('/reindex', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), adminController.reindexSearch);

// Admin Management (Super Admin Only)
router.get('/', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminController.getAdmins);
router.post('/', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminController.createAdmin);
router.patch('/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminController.updateAdmin);
router.delete('/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminController.deleteAdmin);
router.get('/sessions', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), sessionController.getAdminSessions);
router.post('/sessions/:id/revoke', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), sessionController.revokeAdminSession);

// Bulk Import Routes (Super Admin Only)
router.delete('/sites/bulk-delete', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminController.bulkDeleteSites);

// Organization Recovery (Super Admin Only)
router.post('/org/:id/restore', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), orgController.restoreOrganization);
router.post('/org/:id/permanent-delete', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), orgController.permanentlyDeleteOrganization);

// Bulk Import Routes (Super Admin Only)
import multer from 'multer';
import * as bulkImportController from '../controllers/bulk-import.controller';
import * as adminCredController from '../controllers/admin.credentials.controller';

const upload = multer({ dest: 'uploads/' });

router.post('/bulk-import/upload', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), upload.single('file'), bulkImportController.uploadImport);
router.get('/bulk-import/status/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), bulkImportController.getJobStatus);

// Organization Credential Management (Super Admin Only)
router.patch('/organizations/:id/credentials/email', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminCredController.updateOrgLoginEmail);
router.post('/organizations/:id/credentials/reset-password', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminCredController.resetOrgPassword);

// Categories & Tags (Super Admin + Moderator)
router.get('/categories', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), categoryController.getAdminCategories);
router.post('/categories', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), categoryController.createCategory);
router.put('/categories/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), categoryController.updateCategory);
router.delete('/categories/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), categoryController.deleteCategory);

router.get('/tags', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), categoryController.getTags);
router.post('/tags', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), categoryController.createTag);
router.put('/categories/:id/tags', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), categoryController.setCategoryTags);

// Self Management (All Admins)
router.patch('/me/profile', authenticateAdmin, adminController.updateProfile);

// Enterprise Management (Super Admin Only)
import * as adminEnterpriseController from '../controllers/admin.enterprise.controller';
router.get('/enterprise', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.listEnterprisesAdmin);
router.get('/enterprise/workspaces', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.listEnterpriseWorkspaces);
router.post('/enterprise/workspaces', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.createEnterpriseWorkspaceAdmin);
router.get('/enterprise/workspaces/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.getWorkspaceDetails);
router.patch('/enterprise/workspaces/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.updateEnterpriseWorkspaceAdmin);
router.delete('/enterprise/workspaces/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.deleteEnterpriseWorkspaceAdmin);
router.get('/enterprise/workspaces/:id/api-keys', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.listWorkspaceApiKeys);
router.delete('/enterprise/workspaces/:id/api-keys/:keyId', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.revokeWorkspaceApiKey);
router.post('/enterprise/workspaces/:id/api-keys/:keyId/rotate', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.rotateWorkspaceApiKeyAdmin);
router.patch('/enterprise/workspaces/:id/api-keys/:keyId/rate-limit', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.updateWorkspaceApiKeyRateLimitAdmin);
router.post('/enterprise/workspaces/:id/api-keys', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.createWorkspaceApiKeyAdmin);
router.patch('/enterprise/workspaces/:id/rate-limits', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.updateWorkspaceRateLimits);
router.get('/enterprise/workspaces/:id/usage-logs', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.getWorkspaceUsageLogsAdmin);
router.get('/enterprise/usage-logs', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.getGlobalUsageLogsAdmin);
router.get('/enterprise/:orgId', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.getEnterpriseDetailAdmin);
router.patch('/enterprise/:orgId/status', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.setEnterpriseAccessStatusAdmin);
router.get('/enterprise/:orgId/workspaces', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.listEnterpriseWorkspacesAdmin);
router.post('/enterprise/:orgId/workspaces', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.createEnterpriseWorkspaceForOrganizationAdmin);
router.get('/enterprise/:orgId/workspaces/:workspaceId', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.getEnterpriseWorkspaceDetailAdmin);
router.post('/enterprise/:orgId/workspaces/:workspaceId/members', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.addEnterpriseWorkspaceMemberAdmin);
router.post('/enterprise/:orgId/api-keys', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.createEnterpriseApiKeyAdmin);
router.patch('/enterprise/:orgId/rate-limits', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.updateEnterpriseRateLimitsAdmin);
router.get('/enterprise/:orgId/usage', authenticateAdmin, authorizeRole(['SUPER_ADMIN']), adminEnterpriseController.getEnterpriseUsageAdmin);

export default router;
