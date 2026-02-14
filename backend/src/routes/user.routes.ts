import express from 'express';
import * as userController from '../controllers/user.controller';
import { authenticateAdmin, authorizeRole } from '../middleware/auth.middleware';

const router = express.Router();

// All routes protected by SUPER_ADMIN role
router.use(authenticateAdmin);
router.use(authorizeRole(['SUPER_ADMIN']));

router.get('/', userController.getUsers);
router.post('/', userController.createUser);
router.patch('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);
router.post('/delete-bulk', userController.deleteUsersBulk);
router.post('/update-bulk', userController.updateUsersBulk);
router.patch('/:id/restrict', userController.restrictUser);

export default router;
