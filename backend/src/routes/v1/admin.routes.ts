import { Router } from 'express';
import { getUsers, deleteUser } from '../../controllers/admin.controller';
import { verifyJWT } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(verifyJWT);
router.use(requireRole('ADMIN'));

router.get('/users', getUsers);
router.delete('/users/:id', deleteUser);

export default router;
