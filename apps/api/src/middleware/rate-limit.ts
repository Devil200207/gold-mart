import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const handler = (_req: unknown, res: { status(n: number): { json(b: unknown): void } }) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests; slow down' } });

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.RATE_LIMIT_AUTH_PER_15MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

export const tradeLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_TRADE_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `u:${req.user._id.toHexString()}` : `ip:${req.ip}`),
  handler,
});
