import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// Public Tracking (accepts optional siteId in body)
router.post('/:orgId/view', analyticsController.trackView);
router.post('/:orgId/click', analyticsController.trackClick);

// Protected Stats (Basic+ plans)
router.get('/:orgId', authenticateUser, analyticsController.getOrgStats);

// PRO+ Features
router.get('/:orgId/heatmap', authenticateUser, analyticsController.getTrafficHeatmap);
router.get('/:orgId/categories', authenticateUser, analyticsController.getCategoryPerformance);
router.get('/:orgId/export', authenticateUser, analyticsController.exportAnalytics);

// BUSINESS only Features
router.get('/:orgId/insights', authenticateUser, analyticsController.getBusinessInsights);

export default router;
