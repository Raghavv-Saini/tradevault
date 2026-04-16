import { Router } from 'express';
import {
  getAllTrades,
  createTrade,
  getOneTrade,
  updateTrade,
  deleteTrade,
} from '../../controllers/trade.controller';
import { verifyJWT } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { TradeSchema } from '../../lib/validate';

const router = Router();

// All trade routes require authentication
router.use(verifyJWT);

router.get('/', getAllTrades);
router.post('/', validate(TradeSchema), createTrade);
router.get('/:id', getOneTrade);
router.put('/:id', validate(TradeSchema), updateTrade);
router.delete('/:id', deleteTrade);

export default router;
