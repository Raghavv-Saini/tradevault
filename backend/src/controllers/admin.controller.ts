import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import Trade from '../models/Trade';
import { apiResponse } from '../lib/apiResponse';

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await User.aggregate([
      {
        $lookup: {
          from: 'trades',
          localField: '_id',
          foreignField: 'userId',
          as: 'trades',
        },
      },
      {
        $project: {
          id: '$_id',
          name: 1,
          email: 1,
          role: 1,
          createdAt: 1,
          tradeCount: { $size: '$trades' },
        },
      },
    ]);

    apiResponse.success(res, users);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      apiResponse.error(res, 'User not found', 'NOT_FOUND', 404);
      return;
    }

    await Trade.deleteMany({ userId: req.params.id });

    apiResponse.success(res, { id: user._id }, 'User deleted');
  } catch (err) {
    next(err);
  }
}
