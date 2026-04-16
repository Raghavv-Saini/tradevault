import { Router } from 'express';
import { register, login, logout, me } from '../../controllers/auth.controller';
import { verifyJWT } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { RegisterSchema, LoginSchema } from '../../lib/validate';

const router = Router();

router.post('/register', validate(RegisterSchema), register);
router.post('/login', validate(LoginSchema), login);
router.post('/logout', verifyJWT, logout);
router.get('/me', verifyJWT, me);

export default router;
