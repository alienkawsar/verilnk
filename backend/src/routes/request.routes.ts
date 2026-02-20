import { Router } from 'express';
import * as requestController from '../controllers/request.controller';
import { authenticateAdmin, authenticateUser, authorizeRole } from '../middleware/auth.middleware';

const router = Router();

import { checkRestriction } from '../middleware/restriction.middleware';

// Create Request (Authenticated Users/Orgs)
router.post('/', authenticateUser, checkRestriction, requestController.createRequest);

// User/Org Requests (self)
router.get('/my', authenticateUser, requestController.getRequests);

// Admin Routes
router.get('/', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), requestController.getRequests);
router.post('/:id/approve', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), requestController.approveRequest);
router.post('/:id/reject', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), requestController.rejectRequest);

// Bulk Actions
router.post('/bulk-approve', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), requestController.bulkApprove);
router.post('/bulk-reject', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), requestController.bulkReject);

export default router;
