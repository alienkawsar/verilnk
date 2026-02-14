import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import { authenticateAdmin } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.guard';

const router = Router();

// Public routes: Get all categories
router.get('/', categoryController.getCategories);
router.get('/slug/:slug', categoryController.getCategoryBySlug);
router.get('/:id', categoryController.getCategory);

// Admin routes: Manage categories
router.post(
    '/',
    authenticateAdmin,
    authorizeRole(['SUPER_ADMIN', 'MODERATOR']),
    categoryController.createCategory
);

router.patch(
    '/:id',
    authenticateAdmin,
    authorizeRole(['SUPER_ADMIN', 'MODERATOR']),
    categoryController.updateCategory
);

router.delete(
    '/:id',
    authenticateAdmin,
    authorizeRole(['SUPER_ADMIN', 'MODERATOR']),
    categoryController.deleteCategory
);

export default router;
