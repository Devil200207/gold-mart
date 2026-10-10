import { Types } from 'mongoose';
import { AppError } from '../lib/errors';
import { withTransaction } from '../lib/tx';
import { AdminDoc, ReversalRequest, ReversalRequestDoc } from '../models';
import { audit, RequestContext } from './audit.service';
import { findEntryBySeq, postInSession } from './ledger.service';

const adminActor = (a: AdminDoc) => ({ actorType: 'admin' as const, actorId: a._id, actorLabel: a.username });

export async function requestReversal(
  admin: AdminDoc,
  input: { targetSeq: number; availableDeltaMg: number; lockedDeltaMg: number; reason: string },
  ctx: RequestContext,
): Promise<ReversalRequestDoc> {
  if (input.availableDeltaMg === 0 && input.lockedDeltaMg === 0) {
    throw new AppError('VALIDATION_ERROR', 'A reversal must move some gold');
  }
  const target = await findEntryBySeq(input.targetSeq);
  if (!target) throw new AppError('NOT_FOUND', `Ledger entry ${input.targetSeq} not found`);

  const req = await ReversalRequest.create({
    targetSeq: input.targetSeq,
    userId: target.userId,
    availableDeltaMg: input.availableDeltaMg,
    lockedDeltaMg: input.lockedDeltaMg,
    reason: input.reason,
    requestedBy: admin._id,
    status: 'PENDING',
  });
  await audit({ ...adminActor(admin), action: 'reversal.requested', targetType: 'reversal', targetId: req._id.toHexString(), details: { ...input }, ctx });
  return req.toObject() as ReversalRequestDoc;
}

export async function approveReversal(admin: AdminDoc, id: Types.ObjectId, ctx: RequestContext): Promise<ReversalRequestDoc> {
  const req = await ReversalRequest.findById(id).lean();
  if (!req) throw new AppError('NOT_FOUND', 'Reversal request not found');
  // Two-person rule, enforced here (the UI hiding the button is not enough).
  if (req.requestedBy.equals(admin._id)) {
    await audit({ ...adminActor(admin), action: 'reversal.self_approval_blocked', targetType: 'reversal', targetId: id.toHexString(), ctx });
    throw new AppError('SELF_APPROVAL_FORBIDDEN', 'A reversal must be approved by a different admin');
  }
  if (req.status !== 'PENDING') throw new AppError('INVALID_TRANSITION', `Reversal is already ${req.status}`);

  return withTransaction(async (session) => {
    const updated = await ReversalRequest.findOneAndUpdate(
      { _id: id, status: 'PENDING', requestedBy: { $ne: admin._id } },
      { $set: { status: 'APPROVED', approvedBy: admin._id, decidedAt: new Date() } },
      { new: true, session, lean: true },
    );
    if (!updated) throw new AppError('INVALID_TRANSITION', 'Reversal is no longer pending');
    const entry = await postInSession(session, {
      userId: req.userId,
      type: 'REVERSAL',
      availableDeltaMg: req.availableDeltaMg,
      lockedDeltaMg: req.lockedDeltaMg,
      refType: 'reversal',
      refId: req._id,
      idempotencyKey: `reversal:${req._id}`,
      createdBy: admin._id,
    });
    await ReversalRequest.updateOne({ _id: id }, { $set: { postedSeq: entry.seq } }, { session });
    await audit(
      { ...adminActor(admin), action: 'reversal.approved', targetType: 'reversal', targetId: id.toHexString(), details: { postedSeq: entry.seq }, ctx },
      session,
    );
    return { ...(updated as ReversalRequestDoc), postedSeq: entry.seq };
  });
}

export async function rejectReversal(admin: AdminDoc, id: Types.ObjectId, ctx: RequestContext): Promise<ReversalRequestDoc> {
  const updated = await ReversalRequest.findOneAndUpdate(
    { _id: id, status: 'PENDING' },
    { $set: { status: 'REJECTED', rejectedBy: admin._id, decidedAt: new Date() } },
    { new: true, lean: true },
  );
  if (!updated) {
    const exists = await ReversalRequest.exists({ _id: id });
    throw exists ? new AppError('INVALID_TRANSITION', 'Reversal is no longer pending') : new AppError('NOT_FOUND', 'Reversal request not found');
  }
  await audit({ ...adminActor(admin), action: 'reversal.rejected', targetType: 'reversal', targetId: id.toHexString(), ctx });
  return updated as ReversalRequestDoc;
}
