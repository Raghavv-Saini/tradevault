import { Schema, model, Types } from 'mongoose';
import { ITrade } from '../types';

const tradeSchema = new Schema<ITrade>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    coin: { type: String, required: true, minlength: 1, maxlength: 10, uppercase: true, trim: true },
    type: { type: String, enum: ['BUY', 'SELL'], required: true },
    entryPrice: { type: Number, required: true },
    exitPrice: { type: Number, default: null },
    quantity: { type: Number, required: true },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    pnl: { type: Number, default: null },
    pnlPercent: { type: Number, default: null },
    notes: { type: String, maxlength: 500, default: '' },
    tradeDate: { type: Date, required: true },
  },
  { timestamps: true }
);

export { tradeSchema };
export default model<ITrade>('Trade', tradeSchema);
