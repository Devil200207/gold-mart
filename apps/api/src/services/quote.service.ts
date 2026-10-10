import { ClientSession, Types } from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { Quote, QuoteDoc, QuoteSide, UserDoc } from '../models';
import { priceProvider } from './price';
import * as pricing from './pricing';
import { getBalance } from './ledger.service';

export type QuoteRequest =
  | { side: 'BUY'; amountMinor: number; goldMg?: undefined }
  | { side: 'BUY'; goldMg: number; amountMinor?: undefined }
  | { side: 'SELL'; goldMg: number };

export async function createQuote(user: UserDoc, req: QuoteRequest): Promise<QuoteDoc> {
  const spot = priceProvider.current().spotPerGramMinor;
  const cfg = pricing.configFromEnv();
  let b: pricing.Breakdown;
  let inputMode: 'AMOUNT' | 'WEIGHT';

  if (req.side === 'BUY') {
    if (req.amountMinor !== undefined) {
      inputMode = 'AMOUNT';
      b = pricing.buyByAmount(spot, req.amountMinor, cfg);
    } else {
      inputMode = 'WEIGHT';
      b = pricing.buyByWeight(spot, req.goldMg, cfg);
    }
    if (b.subtotalMinor < env.MIN_BUY_MINOR) {
      throw new AppError('AMOUNT_TOO_SMALL', `Minimum purchase is ${env.MIN_BUY_MINOR} minor units`);
    }
    if (b.goldMg < 1) throw new AppError('AMOUNT_TOO_SMALL', 'Amount buys less than 1 mg of gold');
    if (user.kycStatus !== 'VERIFIED' && b.totalMinor > env.UNVERIFIED_BUY_LIMIT_MINOR) {
      throw new AppError('KYC_REQUIRED', 'Complete KYC to buy more than the unverified limit', {
        limitMinor: env.UNVERIFIED_BUY_LIMIT_MINOR,
      });
    }
  } else {
    inputMode = 'WEIGHT';
    b = pricing.sell(spot, req.goldMg, cfg);
    if (b.totalMinor <= 0) throw new AppError('AMOUNT_TOO_SMALL', 'Payout would be zero after fees');
    const bal = await getBalance(user._id);
    if (req.goldMg > bal.availableMg) throw new AppError('INSUFFICIENT_GOLD', 'You cannot sell more than your available gold');
  }

  const now = new Date();
  return Quote.create({
    userId: user._id,
    side: req.side,
    inputMode,
    spotPerGramMinor: spot,
    pricePerGramMinor: b.pricePerGramMinor,
    goldMg: b.goldMg,
    subtotalMinor: b.subtotalMinor,
    feeMinor: b.feeMinor,
    taxMinor: b.taxMinor,
    totalMinor: b.totalMinor,
    currency: env.CURRENCY,
    expiresAt: new Date(now.getTime() + env.QUOTE_TTL_SECONDS * 1000),
    status: 'OPEN',
    createdAt: now,
  });
}

/** Read-only pre-check so we fail fast before calling the gateway. */
export async function assertQuoteUsable(quoteId: Types.ObjectId, userId: Types.ObjectId, side: QuoteSide): Promise<QuoteDoc> {
  const q = await Quote.findOne({ _id: quoteId, userId, side, status: 'OPEN', expiresAt: { $gt: new Date() } }).lean();
  if (!q) throw new AppError('QUOTE_INVALID', 'Quote is expired or already used; request a new price');
  return q as QuoteDoc;
}

/** Atomically marks an OPEN, unexpired quote as USED. Anything else → QUOTE_INVALID. */
export async function consumeQuote(
  session: ClientSession | null,
  quoteId: Types.ObjectId,
  userId: Types.ObjectId,
  side: QuoteSide,
): Promise<QuoteDoc> {
  const now = new Date();
  const q = await Quote.findOneAndUpdate(
    { _id: quoteId, userId, side, status: 'OPEN', expiresAt: { $gt: now } },
    { $set: { status: 'USED', usedAt: now } },
    { new: true, session: session ?? undefined, lean: true },
  );
  if (!q) throw new AppError('QUOTE_INVALID', 'Quote is expired or already used; request a new price');
  return q as QuoteDoc;
}

export async function expireStaleQuotes(now = new Date()): Promise<number> {
  const r = await Quote.updateMany({ status: 'OPEN', expiresAt: { $lte: now } }, { $set: { status: 'EXPIRED' } });
  return r.modifiedCount;
}
