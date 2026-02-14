import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware';
import * as billingController from '../controllers/billing.controller';

const router = Router();

router.post('/mock/checkout', authenticateUser, billingController.mockCheckout);
router.post('/mock/callback', authenticateUser, billingController.mockCallback);
router.post('/trial/start', authenticateUser, billingController.startTrial);
router.get('/trial/status', authenticateUser, billingController.getTrialStatus);

export default router;
