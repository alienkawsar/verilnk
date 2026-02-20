"use strict";
/**
 * Enterprise API Routes (v1)
 *
 * Public API routes for enterprise customers.
 * All routes require API key authentication with appropriate scopes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const apikey_middleware_1 = require("../middleware/apikey.middleware");
const enterprise_api_controller_1 = require("../controllers/enterprise.api.controller");
const router = (0, express_1.Router)();
// All routes require API key authentication
router.use(apikey_middleware_1.authenticateApiKey);
// Verify URL
// GET /api/v1/verify?url=<url>
router.get('/verify', (0, apikey_middleware_1.requireScope)('read:verify'), enterprise_api_controller_1.verifyUrl);
// Browse directory
// GET /api/v1/directory?country=<code>&category=<slug>&search=<query>&page=<n>&limit=<n>
router.get('/directory', (0, apikey_middleware_1.requireScope)('read:directory'), enterprise_api_controller_1.getDirectory);
// Get organization profile
// GET /api/v1/org/:slug
router.get('/org/:slug', (0, apikey_middleware_1.requireScope)('read:org-profile'), enterprise_api_controller_1.getOrganizationProfile);
// List categories (read:directory scope)
// GET /api/v1/categories
router.get('/categories', (0, apikey_middleware_1.requireScope)('read:directory'), enterprise_api_controller_1.getCategories);
// List countries (read:directory scope)
// GET /api/v1/countries
router.get('/countries', (0, apikey_middleware_1.requireScope)('read:directory'), enterprise_api_controller_1.getCountries);
exports.default = router;
