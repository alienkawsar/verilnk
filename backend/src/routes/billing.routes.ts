import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware';
import * as billingController from '../controllers/billing.controller';

const router = Router();

router.post('/checkout', authenticateUser, billingController.checkout);
router.post('/webhooks/stripe', billingController.stripeWebhook);
router.get('/sslcommerz/success', billingController.sslcommerzSuccess);
router.post('/sslcommerz/success', billingController.sslcommerzSuccess);
router.get('/sslcommerz/fail', billingController.sslcommerzFail);
router.post('/sslcommerz/fail', billingController.sslcommerzFail);
router.get('/sslcommerz/cancel', billingController.sslcommerzCancel);
router.post('/sslcommerz/cancel', billingController.sslcommerzCancel);

router.post('/mock/checkout', authenticateUser, billingController.mockCheckout);
router.post('/mock/callback', authenticateUser, billingController.mockCallback);
router.post('/trial/start', authenticateUser, billingController.startTrial);
router.get('/trial/status', authenticateUser, billingController.getTrialStatus);

export default router;
