import { Router } from 'express';
import authRoutes from './auth.routes';
import tradeRoutes from './trade.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/trades', tradeRoutes);
router.use('/admin', adminRoutes);

export default router;
