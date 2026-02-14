import express from 'express';
import * as realtimeController from '../controllers/realtime.controller';
import { authenticateAdmin, authorizeRole } from '../middleware/auth.middleware';

const router = express.Router();

// Only Admins can subscribe to the feed
router.get('/stream', authenticateAdmin, authorizeRole(['SUPER_ADMIN', 'MODERATOR', 'VERIFIER']), realtimeController.streamUpdates);

export default router;
