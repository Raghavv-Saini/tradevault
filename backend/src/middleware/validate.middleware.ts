import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema } from 'zod';
import { apiResponse } from '../lib/apiResponse';

export function validate(schema: ZodSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.errors.map((e) => e.message).join(', ');
      apiResponse.error(res, message, 'VALIDATION_ERROR');
      return;
    }
    req.body = result.data;
    next();
  };
}
