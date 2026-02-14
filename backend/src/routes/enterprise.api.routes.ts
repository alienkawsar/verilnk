/**
 * Enterprise API Routes (v1)
 * 
 * Public API routes for enterprise customers.
 * All routes require API key authentication with appropriate scopes.
 */

import { Router } from 'express';
import { authenticateApiKey, requireScope } from '../middleware/apikey.middleware';
import {
    verifyUrl,
    getDirectory,
    getOrganizationProfile,
    getCategories,
    getCountries
} from '../controllers/enterprise.api.controller';

const router = Router();

// All routes require API key authentication
router.use(authenticateApiKey);

// Verify URL
// GET /api/v1/verify?url=<url>
router.get('/verify', requireScope('read:verify'), verifyUrl);

// Browse directory
// GET /api/v1/directory?country=<code>&category=<slug>&search=<query>&page=<n>&limit=<n>
router.get('/directory', requireScope('read:directory'), getDirectory);

// Get organization profile
// GET /api/v1/org/:slug
router.get('/org/:slug', requireScope('read:org-profile'), getOrganizationProfile);

// List categories (read:directory scope)
// GET /api/v1/categories
router.get('/categories', requireScope('read:directory'), getCategories);

// List countries (read:directory scope)
// GET /api/v1/countries
router.get('/countries', requireScope('read:directory'), getCountries);

export default router;
