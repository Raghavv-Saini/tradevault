import { Request, Response, NextFunction } from 'express';
import Trade from '../models/Trade';
import { calculatePnL } from '../lib/pnl';
import { apiResponse } from '../lib/apiResponse';

export async function getAllTrades(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const trades = await Trade.find({ userId: req.user!.userId });
    apiResponse.success(res, trades);
  } catch (err) {
    next(err);
  }
}

export async function createTrade(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { coin, type, entryPrice, exitPrice, quantity, status, notes, tradeDate } = req.body;

    let pnl: number | null = null;
    let pnlPercent: number | null = null;

    if (status === 'CLOSED' && exitPrice != null) {
      const result = calculatePnL(type, entryPrice, exitPrice, quantity);
      pnl = result.pnl;
      pnlPercent = result.pnlPercent;
    }

    const trade = await Trade.create({
      userId: req.user!.userId,
      coin,
      type,
      entryPrice,
      exitPrice: status === 'CLOSED' ? exitPrice ?? null : null,
      quantity,
      status,
      pnl,
      pnlPercent,
      notes,
      tradeDate,
    });

    apiResponse.success(res, trade, 'Trade created', 201);
  } catch (err) {
    next(err);
  }
}

export async function getOneTrade(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.userId });
    if (!trade) {
      apiResponse.error(res, 'Trade not found', 'NOT_FOUND', 404);
      return;
    }
    apiResponse.success(res, trade);
  } catch (err) {
    next(err);
  }
}

export async function updateTrade(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user!.userId });
    if (!trade) {
      apiResponse.error(res, 'Trade not found', 'NOT_FOUND', 404);
      return;
    }

    const { coin, type, entryPrice, exitPrice, quantity, status, notes, tradeDate } = req.body;

    let pnl = trade.pnl ?? null;
    let pnlPercent = trade.pnlPercent ?? null;

    const transitioningToClosed = status === 'CLOSED' && trade.status !== 'CLOSED';
    if (transitioningToClosed && exitPrice != null) {
      const resolvedEntry = entryPrice ?? trade.entryPrice;
      const resolvedQty = quantity ?? trade.quantity;
      const resolvedType = type ?? trade.type;
      const result = calculatePnL(resolvedType, resolvedEntry, exitPrice, resolvedQty);
      pnl = result.pnl;
      pnlPercent = result.pnlPercent;
    }

    const updated = await Trade.findByIdAndUpdate(
      req.params.id,
      {
        ...(coin !== undefined && { coin }),
        ...(type !== undefined && { type }),
        ...(entryPrice !== undefined && { entryPrice }),
        ...(exitPrice !== undefined && { exitPrice }),
        ...(quantity !== undefined && { quantity }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        ...(tradeDate !== undefined && { tradeDate }),
        pnl,
        pnlPercent,
      },
      { new: true, runValidators: true }
    );

    apiResponse.success(res, updated, 'Trade updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteTrade(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const trade = await Trade.findOneAndDelete({ _id: req.params.id, userId: req.user!.userId });
    if (!trade) {
      apiResponse.error(res, 'Trade not found', 'NOT_FOUND', 404);
      return;
    }
    apiResponse.success(res, { id: trade._id }, 'Trade deleted');
  } catch (err) {
    next(err);
  }
}
