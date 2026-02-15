import express from 'express';
import { authenticateAdmin, authenticateUser, authorizeRole } from '../middleware/auth.middleware';
import { checkRestriction } from '../middleware/restriction.middleware';
import * as orgController from '../controllers/organization.controller';

const router = express.Router();

// Public Routes
router.post('/signup', orgController.signupOrganization);
router.get('/public-sitemap', orgController.getPublicSitemap);
router.get('/:id/public', orgController.getPublicProfile);

// Organization User Routes (Authenticated)
router.get('/me', authenticateUser, orgController.getMyOrganization);
router.patch('/me', authenticateUser, checkRestriction, orgController.updateMyOrganization);
router.get('/invoices/:invoiceId/pdf', authenticateUser, orgController.downloadMyOrganizationInvoicePdf);

// Management Routes
router.use(authenticateAdmin);

router.get('/', authorizeRole(['SUPER_ADMIN', 'VERIFIER', 'MODERATOR']), orgController.getOrganizations);

router.use(authorizeRole(['SUPER_ADMIN']));

router.post('/', orgController.adminCreateOrganization);
router.patch('/:id', orgController.updateOrganization);
router.delete('/:id', orgController.deleteOrganization);
router.post('/delete-bulk', orgController.deleteOrganizationsBulk);
router.patch('/:id/restrict', orgController.restrictOrganization);
router.patch('/:id/plan', orgController.updateOrganizationPlan);
router.post('/bulk-plan', orgController.bulkUpdateOrganizationPlan);

// Priority Management
router.patch('/:id/priority', orgController.updateOrganizationPriority);
router.post('/bulk-priority', orgController.bulkUpdateOrganizationPriority);

export default router;
