import express from 'express';
import * as stateController from '../controllers/state.controller';
import { authenticateAdmin, authorizeRole } from '../middleware/auth.middleware';

const router = express.Router();

// Get all states (Public/Admin - filtered by countryId)
router.get('/', stateController.getStates);

// Create state (Admin only)
router.post('/', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), stateController.createState);

// Update state
router.put('/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), stateController.updateState);

// Delete state
router.delete('/:id', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR']), stateController.deleteState);

export default router;
