import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import { hashPassword, comparePassword } from '../lib/bcrypt';
import { signToken } from '../lib/jwt';
import { apiResponse } from '../lib/apiResponse';
import { RegisterSchema, LoginSchema } from '../lib/validate';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      apiResponse.error(res, parsed.error.errors[0].message, 'VALIDATION_ERROR', 400);
      return;
    }

    const { name, email, password } = parsed.data;
    const hashed = await hashPassword(password);
    const user = await User.create({ name, email, password: hashed });

    apiResponse.success(
      res,
      { id: user._id, name: user.name, email: user.email, role: user.role },
      'Registered successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      apiResponse.error(res, parsed.error.errors[0].message, 'VALIDATION_ERROR', 400);
      return;
    }

    const { email, password } = parsed.data;
    const user = await User.findOne({ email });
    if (!user) {
      apiResponse.error(res, 'Invalid email or password', 'INVALID_CREDENTIALS', 401);
      return;
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      apiResponse.error(res, 'Invalid email or password', 'INVALID_CREDENTIALS', 401);
      return;
    }

    const token = signToken({ userId: user._id.toString(), role: user.role });
    res.cookie('token', token, { httpOnly: true });

    apiResponse.success(res, { id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('token');
  apiResponse.success(res, null, 'Logged out successfully');
}

export async function me(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const user = await User.findById(userId).select('-password');
  if (!user) {
    apiResponse.error(res, 'User not found', 'UNAUTHORIZED', 401);
    return;
  }
  apiResponse.success(res, { id: user._id, name: user.name, email: user.email, role });
}
