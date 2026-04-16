import { Request, Response, NextFunction } from 'express';
import { apiResponse } from '../lib/apiResponse';

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      apiResponse.error(res, 'Forbidden', 'FORBIDDEN', 403);
      return;
    }
    next();
  };
}
