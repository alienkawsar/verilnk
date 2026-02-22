import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware';
import * as savedSiteController from '../controllers/saved-site.controller';

const router = Router();

router.use(authenticateUser);

router.get('/', savedSiteController.listMySavedSites);
router.get('/ids', savedSiteController.listMySavedSiteIds);
router.post('/:siteId', savedSiteController.saveMySite);
router.delete('/:siteId', savedSiteController.unsaveMySite);

export default router;
