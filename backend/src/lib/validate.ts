import { z } from 'zod';

export const RegisterSchema = z.object({
  name:     z.string().min(2).max(50),
  email:    z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export const TradeSchema = z.object({
  coin:       z.string().min(1).max(10),
  type:       z.enum(['BUY', 'SELL']),
  entryPrice: z.number().positive(),
  quantity:   z.number().positive(),
  exitPrice:  z.number().positive().optional(),
  status:     z.enum(['OPEN', 'CLOSED']),
  notes:      z.string().max(500).optional(),
  tradeDate:  z.coerce.date(),
});
