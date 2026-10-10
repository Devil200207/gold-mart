import { CookieOptions, Router } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { toMe } from '../lib/serialize';
import { otpRequestBody, otpVerifyBody } from '../lib/validation';
import { User, UserDoc } from '../models';
import { ah, ctxOf } from '../middleware/async';
import { authLimiter } from '../middleware/rate-limit';
import { issueAccessToken, issueRefreshToken, REFRESH_COOKIE, requestOtp, verifyOtp, verifyToken } from '../services/auth.service';

const cookieOpts = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.PUBLIC_BASE_URL.startsWith('https://'),
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
});

export const authRouter = Router();
authRouter.use(authLimiter);

authRouter.post(
  '/otp/request',
  ah(async (req, res) => {
    const { email } = otpRequestBody.parse(req.body);
    const r = await requestOtp(email, ctxOf(req));
    res.json({ ok: true, ...r });
  }),
);

authRouter.post(
  '/otp/verify',
  ah(async (req, res) => {
    const { email, otp } = otpVerifyBody.parse(req.body);
    const user = await verifyOtp(email, otp, ctxOf(req));
    res.cookie(REFRESH_COOKIE, issueRefreshToken(user._id), cookieOpts());
    res.json({ accessToken: issueAccessToken(user._id), user: toMe(user) });
  }),
);

authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new AppError('UNAUTHENTICATED', 'No session');
    const userId = verifyToken(token, 'refresh');
    const user = (await User.findById(userId).lean()) as UserDoc | null;
    if (!user) throw new AppError('UNAUTHENTICATED', 'User not found');
    res.cookie(REFRESH_COOKIE, issueRefreshToken(user._id), cookieOpts());
    res.json({ accessToken: issueAccessToken(user._id), user: toMe(user) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
  res.json({ ok: true });
});
