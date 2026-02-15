import { Router } from 'express';
import { authenticateAdmin, authorizeRole } from '../middleware/auth.middleware';
import * as billingAdminController from '../controllers/billing.admin.controller';

const router = Router();

router.use(authenticateAdmin, authorizeRole(['SUPER_ADMIN']));

router.get('/org-invoices', billingAdminController.listOrganizationInvoices);
router.get('/enterprise-invoices', billingAdminController.listEnterpriseInvoices);
router.get('/org-invoices/:id/pdf', billingAdminController.downloadOrganizationInvoicePdf);
router.get('/enterprise-invoices/:id/pdf', billingAdminController.downloadEnterpriseInvoicePdf);

router.post('/invoices', billingAdminController.createManualInvoice);
router.post('/invoices/:id/offline-payment', billingAdminController.applyOfflinePayment);
router.post('/invoices/:id/flag-refund', billingAdminController.flagRefund);
router.post('/subscriptions/:id/cancel', billingAdminController.cancelSubscription);
router.post('/trials/:organizationId/extend', billingAdminController.extendTrial);

export default router;
