import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { randomDigits, safeEqual, sha256 } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { OtpCode, User, UserDoc } from '../models';
import { audit, RequestContext } from './audit.service';
import { ensureAccount } from './ledger.service';
import { mailer } from './mailer';

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const codeHash = (email: string, code: string) => sha256(`${email}:${code}`);

export async function requestOtp(emailRaw: string, ctx: RequestContext): Promise<{ devOtp?: string }> {
  const email = emailRaw.trim().toLowerCase();
  const recent = await OtpCode.countDocuments({ email, createdAt: { $gt: new Date(Date.now() - 3600_000) } });
  if (recent >= env.OTP_REQUESTS_PER_HOUR) {
    await audit({ actorType: 'anonymous', actorLabel: email, action: 'auth.otp_rate_limited', ctx });
    throw new AppError('RATE_LIMITED', 'Too many codes requested; try again later');
  }
  const code = randomDigits(6);
  await OtpCode.create({ email, codeHash: codeHash(email, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  await mailer.send(email, 'Your Gold Wallet login code', `Your login code is ${code}. It expires in 10 minutes.`);
  await audit({ actorType: 'anonymous', actorLabel: email, action: 'auth.otp_requested', ctx });
  return env.DEV_EXPOSE_OTP ? { devOtp: code } : {};
}

export async function verifyOtp(emailRaw: string, otp: string, ctx: RequestContext): Promise<UserDoc> {
  const email = emailRaw.trim().toLowerCase();
  const rec = await OtpCode.findOne({ email, consumedAt: null }).sort({ createdAt: -1 });
  const fail = async (msg: string) => {
    await audit({ actorType: 'anonymous', actorLabel: email, action: 'auth.login_failed', details: { reason: msg }, ctx });
    return new AppError('INVALID_OTP', msg);
  };
  if (!rec) throw await fail('No active code; request a new one');
  if (rec.expiresAt.getTime() < Date.now()) throw await fail('Code expired; request a new one');
  if (rec.attempts >= OTP_MAX_ATTEMPTS) throw await fail('Too many attempts; request a new code');
  if (!safeEqual(codeHash(email, otp), rec.codeHash)) {
    await OtpCode.updateOne({ _id: rec._id }, { $inc: { attempts: 1 } });
    throw await fail('Incorrect code');
  }
  const consumed = await OtpCode.updateOne({ _id: rec._id, consumedAt: null }, { $set: { consumedAt: new Date() } });
  if (consumed.modifiedCount !== 1) throw await fail('Code already used');

  const user = (await User.findOneAndUpdate(
    { email },
    { $setOnInsert: { email, role: 'USER', kycStatus: 'NONE', kyc: null, bankAccount: null } },
    { upsert: true, new: true, lean: true },
  )) as UserDoc;
  await ensureAccount(user._id);
  await audit({ actorType: 'user', actorId: user._id, actorLabel: email, action: 'auth.login', ctx });
  return user;
}

export const REFRESH_COOKIE = 'gw_refresh';

export function issueAccessToken(userId: Types.ObjectId): string {
  return jwt.sign({ sub: userId.toHexString(), typ: 'access' }, env.JWT_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS });
}

export function issueRefreshToken(userId: Types.ObjectId): string {
  return jwt.sign({ sub: userId.toHexString(), typ: 'refresh' }, env.JWT_SECRET, { expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` });
}

export function verifyToken(token: string, typ: 'access' | 'refresh'): Types.ObjectId {
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (p.typ !== typ || typeof p.sub !== 'string') throw new Error('wrong token type');
    return new Types.ObjectId(p.sub);
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired token');
  }
}
