import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { apiResponse } from '../lib/apiResponse';

interface MongoError extends Error {
  code?: number;
}

export function errorMiddleware(
  err: MongoError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof MongooseError.ValidationError) {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
    apiResponse.error(res, message, 'VALIDATION_ERROR');
    return;
  }

  if (err instanceof MongooseError.CastError) {
    apiResponse.error(res, 'Resource not found', 'NOT_FOUND');
    return;
  }

  if (err.code === 11000) {
    apiResponse.error(res, 'Resource already exists', 'CONFLICT');
    return;
  }

  apiResponse.error(res, 'Internal server error', 'INTERNAL_ERROR');
}
