import { Router } from 'express';
import { authenticator } from 'otplib';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { Admin } from '../models';
import { ah } from '../middleware/async';

// Local-demo helpers only. Every route 404s unless DEV_EXPOSE_OTP=true.
export const devRouter = Router();

devRouter.get(
  '/admin-totp',
  ah(async (req, res) => {
    if (!env.DEV_EXPOSE_OTP) throw new AppError('NOT_FOUND', 'Route not found');
    const username = String(req.query.username ?? '');
    const admin = await Admin.findOne({ username }).lean();
    if (!admin) throw new AppError('NOT_FOUND', 'Unknown admin');
    res.json({ username, code: authenticator.generate(admin.totpSecret) });
  }),
);
