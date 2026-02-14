import express from 'express';
import * as auditController from '../controllers/audit.controller';
import { authenticateAdmin, authorizeRole } from '../middleware/auth.middleware';

const router = express.Router();

// All Audit routes require SUPER_ADMIN privileges
router.use(authenticateAdmin, authorizeRole(['SUPER_ADMIN']));

router.get('/logs', auditController.getAuditLogs);
router.get('/analytics', auditController.getAuditAnalytics);
router.get('/export', auditController.exportAuditLogs);

export default router;
