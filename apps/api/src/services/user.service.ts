import { Types } from 'mongoose';
import { AppError } from '../lib/errors';
import { User, UserDoc } from '../models';
import { audit, RequestContext } from './audit.service';

/** Mock KYC: any well-formed submission is auto-approved. A real provider would set PENDING first. */
export async function submitKyc(
  userId: Types.ObjectId,
  input: { fullName: string; idNumber: string; dateOfBirth: string },
  ctx: RequestContext,
): Promise<UserDoc> {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        kycStatus: 'VERIFIED',
        kyc: { fullName: input.fullName, idNumberLast4: input.idNumber.slice(-4), dateOfBirth: input.dateOfBirth, verifiedAt: new Date() },
      },
    },
    { new: true, lean: true },
  );
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  await audit({ actorType: 'user', actorId: userId, actorLabel: user.email, action: 'kyc.verified', details: { provider: 'mock' }, ctx });
  return user as UserDoc;
}

export async function saveBankAccount(
  userId: Types.ObjectId,
  input: { holderName: string; iban: string },
  ctx: RequestContext,
): Promise<UserDoc> {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { bankAccount: { holderName: input.holderName, iban: input.iban, addedAt: new Date() } } },
    { new: true, lean: true },
  );
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  await audit({ actorType: 'user', actorId: userId, actorLabel: user.email, action: 'bank_account.saved', details: { last4: input.iban.slice(-4) }, ctx });
  return user as UserDoc;
}
