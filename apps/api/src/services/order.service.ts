import { Types } from 'mongoose';
import { AppError } from '../lib/errors';
import { withTransaction } from '../lib/tx';
import { Payment, PaymentDoc, Payout, PayoutDoc, UserDoc } from '../models';
import { audit, RequestContext } from './audit.service';
import { postInSession } from './ledger.service';
import { gateway } from './payment';
import { assertQuoteUsable, consumeQuote } from './quote.service';

// ---------------------------------------------------------------------------
// Buy: quote → gateway order → (verified webhook credits gold, see webhook.service.ts)
// ---------------------------------------------------------------------------
export async function createBuyOrder(user: UserDoc, quoteId: Types.ObjectId) {
  const quote = await assertQuoteUsable(quoteId, user._id, 'BUY');
  const paymentId = new Types.ObjectId();
  const order = await gateway.createOrder({ amountMinor: quote.totalMinor, currency: quote.currency, reference: `buy:${paymentId}` });

  // Marking the quote USED and creating the payment commit together.
  await withTransaction(async (session) => {
    await consumeQuote(session, quoteId, user._id, 'BUY');
    await Payment.create(
      [
        {
          _id: paymentId,
          userId: user._id,
          purpose: 'BUY',
          quoteId,
          deliveryId: null,
          gatewayOrderId: order.gatewayOrderId,
          checkoutUrl: order.checkoutUrl,
          amountMinor: quote.totalMinor,
          currency: quote.currency,
          status: 'CREATED',
        },
      ],
      { session },
    );
  });
  return { paymentId, gatewayOrderId: order.gatewayOrderId, checkoutUrl: order.checkoutUrl };
}

export async function findPaymentForUser(user: UserDoc, id: string): Promise<PaymentDoc> {
  const q = Types.ObjectId.isValid(id) && id.length === 24 ? { _id: new Types.ObjectId(id) } : { gatewayOrderId: id };
  const p = await Payment.findOne({ ...q, userId: user._id }).lean();
  if (!p) throw new AppError('NOT_FOUND', 'Payment not found');
  return p as PaymentDoc;
}

// ---------------------------------------------------------------------------
// Sell-back: debit gold + create payout (one transaction) → gateway payout → reverse on failure
// ---------------------------------------------------------------------------
export async function sell(user: UserDoc, quoteId: Types.ObjectId, ctx: RequestContext) {
  if (user.kycStatus !== 'VERIFIED') throw new AppError('KYC_REQUIRED', 'KYC must be verified before selling');
  if (!user.bankAccount) throw new AppError('BANK_ACCOUNT_REQUIRED', 'Add a bank account before selling');

  const payoutId = new Types.ObjectId();
  const { entry, payout } = await withTransaction(async (session) => {
    const quote = await consumeQuote(session, quoteId, user._id, 'SELL');
    const entry = await postInSession(session, {
      userId: user._id,
      type: 'SELL',
      availableDeltaMg: -quote.goldMg,
      lockedDeltaMg: 0,
      amountMinor: quote.totalMinor,
      currency: quote.currency,
      quoteId: quote._id,
      refType: 'payout',
      refId: payoutId,
      idempotencyKey: `sell:${quote._id}`,
      createdBy: 'system',
    });
    const [payout] = await Payout.create(
      [
        {
          _id: payoutId,
          userId: user._id,
          quoteId: quote._id,
          goldMg: quote.goldMg,
          amountMinor: quote.totalMinor,
          currency: quote.currency,
          status: 'PENDING',
          ledgerSeq: entry.seq,
        },
      ],
      { session },
    );
    return { entry, payout: payout.toObject() as PayoutDoc };
  });

  let status: PayoutDoc['status'] = 'PENDING';
  try {
    const res = await gateway.createPayout({
      amountMinor: payout.amountMinor,
      currency: payout.currency,
      bankAccountRef: user.bankAccount.iban,
      reference: `payout:${payoutId}`,
    });
    await Payout.updateOne({ _id: payoutId }, { $set: { gatewayPayoutId: res.payoutId } });
    if (res.status === 'PAID') {
      await Payout.updateOne({ _id: payoutId, status: 'PENDING' }, { $set: { status: 'PAID' } });
      status = 'PAID';
    } else if (res.status === 'FAILED') {
      await failPayout(payoutId, 'Bank rejected the payout');
      status = 'FAILED';
    }
  } catch (err) {
    await failPayout(payoutId, `Gateway error: ${(err as Error).message}`);
    status = 'FAILED';
  }

  await audit({ actorType: 'user', actorId: user._id, actorLabel: user.email, action: `sell.payout_${status.toLowerCase()}`, targetType: 'payout', targetId: payoutId.toHexString(), ctx });

  const messages = {
    PAID: 'Payout sent to your bank account.',
    PENDING: 'Payout is being processed by the bank.',
    FAILED: 'The bank payout failed, so your gold has been returned to your wallet. Please check your bank details.',
  };
  return {
    entrySeq: entry.seq,
    goldMg: payout.goldMg,
    payout: { id: payoutId.toHexString(), status, amountMinor: payout.amountMinor, currency: payout.currency },
    goldRestored: status === 'FAILED',
    message: messages[status],
  };
}

/** Marks a payout FAILED and restores the sold gold with a system REVERSAL (idempotent). */
export async function failPayout(payoutId: Types.ObjectId, reason: string): Promise<void> {
  await withTransaction(async (session) => {
    const payout = await Payout.findOneAndUpdate(
      { _id: payoutId, status: 'PENDING' },
      { $set: { status: 'FAILED', failureReason: reason } },
      { new: true, session, lean: true },
    );
    if (!payout) return; // already settled
    const entry = await postInSession(session, {
      userId: payout.userId,
      type: 'REVERSAL',
      availableDeltaMg: payout.goldMg,
      lockedDeltaMg: 0,
      amountMinor: payout.amountMinor,
      currency: payout.currency,
      quoteId: payout.quoteId,
      refType: 'payout',
      refId: payout._id,
      idempotencyKey: `payout-fail:${payout._id}`,
      createdBy: 'system',
    });
    await Payout.updateOne({ _id: payoutId }, { $set: { reversalSeq: entry.seq } }, { session });
    await audit(
      { actorType: 'system', action: 'payout.failed_reversed', targetType: 'payout', targetId: payoutId.toHexString(), details: { reason, reversalSeq: entry.seq } },
      session,
    );
  });
}

/** Async payout results from the gateway (a real gateway may answer PENDING first). */
export async function handlePayoutEvent(type: 'payout.paid' | 'payout.failed', gatewayPayoutId: string): Promise<void> {
  const payout = await Payout.findOne({ gatewayPayoutId }).lean();
  if (!payout) return;
  if (type === 'payout.paid') await Payout.updateOne({ _id: payout._id, status: 'PENDING' }, { $set: { status: 'PAID' } });
  else await failPayout(payout._id, 'Bank rejected the payout');
}
