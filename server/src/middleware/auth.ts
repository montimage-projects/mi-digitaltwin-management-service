import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const requireRole = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError('Insufficient permissions', 403));
      return;
    }
    next();
  };
};

export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
    req.user = decoded;

    next();
  } catch (error) {
    // TokenExpiredError must be checked before JsonWebTokenError — it extends it.
    if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401));
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
      return;
    }
    next(error);
  }
};
