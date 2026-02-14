import { Router } from 'express';
import * as searchController from '../controllers/search.controller';
import { searchRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Public search endpoint
router.get('/search', searchRateLimiter, searchController.searchSites);

export default router;
