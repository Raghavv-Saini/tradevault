export interface PnLResult {
  pnl: number;
  pnlPercent: number;
}

export function calculatePnL(
  type: 'BUY' | 'SELL',
  entryPrice: number,
  exitPrice: number,
  quantity: number
): PnLResult {
  if (type === 'BUY') {
    return {
      pnl: (exitPrice - entryPrice) * quantity,
      pnlPercent: ((exitPrice - entryPrice) / entryPrice) * 100,
    };
  } else {
    return {
      pnl: (entryPrice - exitPrice) * quantity,
      pnlPercent: ((entryPrice - exitPrice) / entryPrice) * 100,
    };
  }
}
