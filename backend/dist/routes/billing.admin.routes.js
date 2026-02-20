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
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const billingAdminController = __importStar(require("../controllers/billing.admin.controller"));
const router = (0, express_1.Router)();
// Discovery notes (Phase 1):
// A) Admin role source/guard path: prisma Admin.role (AdminRole), JWT role claim from /api/auth/admin/login, server guards via authenticateAdmin + authorizeRole.
// B) Billing domain source: prisma Subscription/Invoice/PaymentAttempt (planType, amountCents, period dates), existing PDF + invoice listing endpoints here.
// C) Logging/realtime source: prisma AdminLog via audit.service, near-realtime updates via realtime.service SSE + AuditLogsSection polling.
// D) Admin management source: /api/admin routes + admin.controller/admin.service with Super Admin-only lifecycle actions.
router.use(auth_middleware_1.authenticateAdmin);
const SUPER_ADMIN_ONLY = ['SUPER_ADMIN'];
const BILLING_DASHBOARD_ROLES = ['SUPER_ADMIN', 'ACCOUNTS'];
router.get('/overview', (0, auth_middleware_1.authorizeRole)([...BILLING_DASHBOARD_ROLES]), billingAdminController.getBillingOverview);
router.get('/subscriptions', (0, auth_middleware_1.authorizeRole)([...BILLING_DASHBOARD_ROLES]), billingAdminController.listBillingSubscriptions);
router.get('/invoices', (0, auth_middleware_1.authorizeRole)([...BILLING_DASHBOARD_ROLES]), billingAdminController.listBillingInvoices);
router.patch('/invoices/:id', (0, auth_middleware_1.authorizeRole)([...BILLING_DASHBOARD_ROLES]), billingAdminController.updateBillingInvoice);
router.get('/invoices/:id/pdf', (0, auth_middleware_1.authorizeRole)([...BILLING_DASHBOARD_ROLES]), billingAdminController.downloadBillingInvoicePdf);
router.get('/exports/invoices.csv', (0, auth_middleware_1.authorizeRole)([...BILLING_DASHBOARD_ROLES]), billingAdminController.exportBillingInvoicesCsv);
router.get('/exports/subscriptions.csv', (0, auth_middleware_1.authorizeRole)([...BILLING_DASHBOARD_ROLES]), billingAdminController.exportBillingSubscriptionsCsv);
router.get('/org-invoices', (0, auth_middleware_1.authorizeRole)([...SUPER_ADMIN_ONLY]), billingAdminController.listOrganizationInvoices);
router.get('/enterprise-invoices', (0, auth_middleware_1.authorizeRole)([...SUPER_ADMIN_ONLY]), billingAdminController.listEnterpriseInvoices);
router.get('/org-invoices/:id/pdf', (0, auth_middleware_1.authorizeRole)([...SUPER_ADMIN_ONLY]), billingAdminController.downloadOrganizationInvoicePdf);
router.get('/enterprise-invoices/:id/pdf', (0, auth_middleware_1.authorizeRole)([...SUPER_ADMIN_ONLY]), billingAdminController.downloadEnterpriseInvoicePdf);
router.post('/invoices', (0, auth_middleware_1.authorizeRole)([...SUPER_ADMIN_ONLY]), billingAdminController.createManualInvoice);
router.post('/invoices/:id/offline-payment', (0, auth_middleware_1.authorizeRole)([...SUPER_ADMIN_ONLY]), billingAdminController.applyOfflinePayment);
router.post('/invoices/:id/flag-refund', (0, auth_middleware_1.authorizeRole)([...SUPER_ADMIN_ONLY]), billingAdminController.flagRefund);
router.post('/subscriptions/:id/cancel', (0, auth_middleware_1.authorizeRole)([...SUPER_ADMIN_ONLY]), billingAdminController.cancelSubscription);
router.post('/trials/:organizationId/extend', (0, auth_middleware_1.authorizeRole)([...SUPER_ADMIN_ONLY]), billingAdminController.extendTrial);
exports.default = router;
