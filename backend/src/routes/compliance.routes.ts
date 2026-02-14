import express from 'express';
import { authenticateAdmin, authorizeRole } from '../middleware/auth.middleware';
import * as complianceController from '../controllers/compliance.controller';

const router = express.Router();

router.use(authenticateAdmin);
router.use(authorizeRole(['SUPER_ADMIN']));

router.get('/dashboard', complianceController.getDashboard);
router.get('/integrity', complianceController.validateIntegrity);
router.get('/incidents', complianceController.listIncidents);
router.post('/incidents', complianceController.createIncident);
router.patch('/incidents/:id', complianceController.updateIncident);
router.post('/exports', complianceController.exportEvidence);
router.get('/exports/download', complianceController.downloadExport);
router.get('/retention', complianceController.listRetentionPolicies);
router.patch('/retention/:entityType', complianceController.updateRetentionPolicy);
router.post('/run-jobs', complianceController.runComplianceJobs);

export default router;
