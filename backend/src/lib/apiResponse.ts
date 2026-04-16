import { Response } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export const apiResponse = {
  success<T>(
    res: Response,
    data: T,
    message = 'Success',
    status = 200
  ): void {
    res.status(status).json({ success: true, message, data });
  },

  error(
    res: Response,
    message: string,
    code: ErrorCode,
    status?: number
  ): void {
    const httpStatus = status ?? ERROR_STATUS_MAP[code];
    res.status(httpStatus).json({ success: false, error: message, code });
  },
};
