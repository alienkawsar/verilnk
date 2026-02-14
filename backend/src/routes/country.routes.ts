import { Router } from 'express';
import * as countryController from '../controllers/country.controller';
import { authenticateAdmin } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.guard';

const router = Router();

// Public route: Get all active countries
router.get('/', countryController.getCountries);

// Admin routes: Manage countries
router.post(
    '/',
    authenticateAdmin,
    authorizeRole(['SUPER_ADMIN', 'MODERATOR']),
    countryController.createCountry
);

router.patch(
    '/:id',
    authenticateAdmin,
    authorizeRole(['SUPER_ADMIN', 'MODERATOR']),
    countryController.updateCountry
);

router.delete(
    '/:id',
    authenticateAdmin,
    authorizeRole(['SUPER_ADMIN', 'MODERATOR']),
    countryController.deleteCountry
);

export default router;
