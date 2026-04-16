import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { apiResponse } from '../lib/apiResponse';

export function verifyJWT(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token;

  if (!token) {
    apiResponse.error(res, 'Unauthorized', 'UNAUTHORIZED', 401);
    return;
  }

  try {
    const decoded = verifyToken(token);
    req.user = { userId: decoded.userId, role: decoded.role };
    next();
  } catch {
    apiResponse.error(res, 'Unauthorized', 'UNAUTHORIZED', 401);
  }
}
