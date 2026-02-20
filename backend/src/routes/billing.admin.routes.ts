import { Router } from 'express';
import { authenticateAdmin, authorizeRole } from '../middleware/auth.middleware';
import * as billingAdminController from '../controllers/billing.admin.controller';

const router = Router();

// Discovery notes (Phase 1):
// A) Admin role source/guard path: prisma Admin.role (AdminRole), JWT role claim from /api/auth/admin/login, server guards via authenticateAdmin + authorizeRole.
// B) Billing domain source: prisma Subscription/Invoice/PaymentAttempt (planType, amountCents, period dates), existing PDF + invoice listing endpoints here.
// C) Logging/realtime source: prisma AdminLog via audit.service, near-realtime updates via realtime.service SSE + AuditLogsSection polling.
// D) Admin management source: /api/admin routes + admin.controller/admin.service with Super Admin-only lifecycle actions.
router.use(authenticateAdmin);

const SUPER_ADMIN_ONLY = ['SUPER_ADMIN'] as const;
const BILLING_DASHBOARD_ROLES = ['SUPER_ADMIN', 'ACCOUNTS'] as const;

router.get('/overview', authorizeRole([...BILLING_DASHBOARD_ROLES]), billingAdminController.getBillingOverview);
router.get('/subscriptions', authorizeRole([...BILLING_DASHBOARD_ROLES]), billingAdminController.listBillingSubscriptions);
router.get('/invoices', authorizeRole([...BILLING_DASHBOARD_ROLES]), billingAdminController.listBillingInvoices);
router.patch('/invoices/:id', authorizeRole([...BILLING_DASHBOARD_ROLES]), billingAdminController.updateBillingInvoice);
router.get('/invoices/:id/pdf', authorizeRole([...BILLING_DASHBOARD_ROLES]), billingAdminController.downloadBillingInvoicePdf);
router.get('/exports/invoices.csv', authorizeRole([...BILLING_DASHBOARD_ROLES]), billingAdminController.exportBillingInvoicesCsv);
router.get('/exports/subscriptions.csv', authorizeRole([...BILLING_DASHBOARD_ROLES]), billingAdminController.exportBillingSubscriptionsCsv);

router.get('/org-invoices', authorizeRole([...SUPER_ADMIN_ONLY]), billingAdminController.listOrganizationInvoices);
router.get('/enterprise-invoices', authorizeRole([...SUPER_ADMIN_ONLY]), billingAdminController.listEnterpriseInvoices);
router.get('/org-invoices/:id/pdf', authorizeRole([...SUPER_ADMIN_ONLY]), billingAdminController.downloadOrganizationInvoicePdf);
router.get('/enterprise-invoices/:id/pdf', authorizeRole([...SUPER_ADMIN_ONLY]), billingAdminController.downloadEnterpriseInvoicePdf);

router.post('/invoices', authorizeRole([...SUPER_ADMIN_ONLY]), billingAdminController.createManualInvoice);
router.post('/invoices/:id/offline-payment', authorizeRole([...SUPER_ADMIN_ONLY]), billingAdminController.applyOfflinePayment);
router.post('/invoices/:id/flag-refund', authorizeRole([...SUPER_ADMIN_ONLY]), billingAdminController.flagRefund);
router.post('/subscriptions/:id/cancel', authorizeRole([...SUPER_ADMIN_ONLY]), billingAdminController.cancelSubscription);
router.post('/trials/:organizationId/extend', authorizeRole([...SUPER_ADMIN_ONLY]), billingAdminController.extendTrial);

export default router;
