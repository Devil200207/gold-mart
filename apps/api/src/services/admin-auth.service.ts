import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { env } from '../config/env';
import { randomId } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { Admin, AdminDoc, AdminSession } from '../models';
import { audit, RequestContext } from './audit.service';

authenticator.options = { window: 1 };

export async function adminLogin(username: string, password: string, totp: string, ctx: RequestContext) {
  const admin = await Admin.findOne({ username, active: true }).lean();
  const passwordOk = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
  const totpOk = admin && passwordOk ? authenticator.check(totp, admin.totpSecret) : false;
  if (!admin || !passwordOk || !totpOk) {
    await audit({
      actorType: 'anonymous',
      actorLabel: username,
      action: 'admin.login_failed',
      details: { reason: !admin || !passwordOk ? 'bad_password' : 'bad_totp' },
      ctx,
    });
    throw new AppError('UNAUTHENTICATED', 'Invalid username, password or authenticator code');
  }
  const sid = randomId('as');
  await AdminSession.create({ _id: sid, adminId: admin._id, lastSeenAt: new Date(), createdAt: new Date() });
  const token = jwt.sign({ sub: admin._id.toHexString(), sid, typ: 'admin' }, env.JWT_SECRET, { expiresIn: '12h' });
  await audit({ actorType: 'admin', actorId: admin._id, actorLabel: admin.username, action: 'admin.login', ctx });
  return { token, admin: admin as AdminDoc };
}

/** Validates an admin token and slides the 30-minute idle window. */
export async function authenticateAdmin(token: string): Promise<{ admin: AdminDoc; sid: string }> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid admin token');
  }
  if (payload.typ !== 'admin' || typeof payload.sid !== 'string') throw new AppError('UNAUTHENTICATED', 'Invalid admin token');
  const idleCutoff = new Date(Date.now() - env.ADMIN_IDLE_TIMEOUT_MINUTES * 60_000);
  const session = await AdminSession.findOneAndUpdate(
    { _id: payload.sid, revokedAt: null, lastSeenAt: { $gt: idleCutoff } },
    { $set: { lastSeenAt: new Date() } },
    { new: true, lean: true },
  );
  if (!session) throw new AppError('SESSION_EXPIRED', 'Admin session expired; sign in again');
  const admin = await Admin.findOne({ _id: session.adminId, active: true }).lean();
  if (!admin) throw new AppError('UNAUTHENTICATED', 'Admin disabled');
  return { admin: admin as AdminDoc, sid: payload.sid };
}

export async function adminLogout(sid: string): Promise<void> {
  await AdminSession.updateOne({ _id: sid }, { $set: { revokedAt: new Date() } });
}
