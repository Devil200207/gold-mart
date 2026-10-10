import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { AdminDoc, AdminRole, User, UserDoc } from '../models';
import { authenticateAdmin } from '../services/admin-auth.service';
import { verifyToken } from '../services/auth.service';
import { ah } from './async';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserDoc;
      admin?: AdminDoc;
      adminSid?: string;
    }
  }
}

const bearer = (req: Request) => {
  const h = req.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

export const requireUser = ah(async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw new AppError('UNAUTHENTICATED', 'Sign in required');
  const userId = verifyToken(token, 'access');
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError('UNAUTHENTICATED', 'User not found');
  req.user = user as UserDoc;
  next();
});

export const requireAdmin = ah(async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw new AppError('UNAUTHENTICATED', 'Admin sign in required');
  const { admin, sid } = await authenticateAdmin(token);
  req.admin = admin;
  req.adminSid = sid;
  next();
});

export const requireRole =
  (...roles: AdminRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin || !req.admin.roles.some((r) => roles.includes(r))) {
      return next(new AppError('FORBIDDEN', `Requires role: ${roles.join(' or ')}`));
    }
    next();
  };

export const currentUser = (req: Request): UserDoc => {
  if (!req.user) throw new AppError('UNAUTHENTICATED');
  return req.user;
};

export const currentAdmin = (req: Request): AdminDoc => {
  if (!req.admin) throw new AppError('UNAUTHENTICATED');
  return req.admin;
};
