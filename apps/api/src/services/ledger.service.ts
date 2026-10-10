// THE ONLY CODE THAT WRITES BALANCES.
// accounts, ledger_entries and chain_head are written here and nowhere else
// (enforced by test/single-write-path.test.ts and, for ledger_entries, by the DB role).
import { ClientSession, Types } from 'mongoose';
import { Account, ChainHead, LedgerEntry, EntryType, LedgerEntryDoc, RefType, AccountDoc } from '../models/ledger.models';
import { AppError, isDuplicateKeyError } from '../lib/errors';
import { canonicalJson } from '../lib/canonical-json';
import { sha256 } from '../lib/crypto';
import { withTransaction } from '../lib/tx';
import { assertSafeInt } from '../lib/money';

export type { EntryType, LedgerEntryDoc, RefType, AccountDoc };
export { ENTRY_TYPES } from '../models/ledger.models';

export const GENESIS_HASH = '0'.repeat(64);
const HEAD_ID = 'main';

export interface PostingInput {
  userId: Types.ObjectId;
  type: EntryType;
  availableDeltaMg: number;
  lockedDeltaMg: number;
  amountMinor?: number | null;
  currency?: string | null;
  quoteId?: Types.ObjectId | null;
  refType: RefType;
  refId: Types.ObjectId;
  idempotencyKey: string;
  createdBy: 'system' | Types.ObjectId;
}

/** Fields that are hashed: everything except the hash itself (and Mongo's _id). */
export function hashableFields(e: Omit<LedgerEntryDoc, 'hash'> | LedgerEntryDoc) {
  return {
    seq: e.seq,
    userId: e.userId,
    type: e.type,
    availableDeltaMg: e.availableDeltaMg,
    lockedDeltaMg: e.lockedDeltaMg,
    amountMinor: e.amountMinor ?? null,
    currency: e.currency ?? null,
    quoteId: e.quoteId ?? null,
    refType: e.refType,
    refId: e.refId,
    idempotencyKey: e.idempotencyKey,
    balanceAfter: { availableMg: e.balanceAfter.availableMg, lockedMg: e.balanceAfter.lockedMg },
    prevHash: e.prevHash,
    createdBy: e.createdBy,
    createdAt: e.createdAt,
  };
}

/** hash = sha256(prevHash + canonicalJson(entry without hash)) */
export function computeEntryHash(e: Omit<LedgerEntryDoc, 'hash'> | LedgerEntryDoc): string {
  return sha256(e.prevHash + canonicalJson(hashableFields(e)));
}

function validate(input: PostingInput): void {
  assertSafeInt('availableDeltaMg', input.availableDeltaMg);
  assertSafeInt('lockedDeltaMg', input.lockedDeltaMg);
  if (input.amountMinor != null) assertSafeInt('amountMinor', input.amountMinor);
  if (input.availableDeltaMg === 0 && input.lockedDeltaMg === 0) throw new Error('posting must move gold');
  if (!input.idempotencyKey) throw new Error('idempotencyKey is required');
}

/** Creates the chain head (genesis) if it does not exist yet. */
export async function initChainHead(): Promise<void> {
  await ChainHead.updateOne(
    { _id: HEAD_ID },
    { $setOnInsert: { seq: 0, hash: GENESIS_HASH } },
    { upsert: true },
  );
}

/** Creates an empty account for a user if missing. Balances start at zero; only postings change them. */
export async function ensureAccount(userId: Types.ObjectId): Promise<void> {
  try {
    await Account.updateOne(
      { userId },
      { $setOnInsert: { userId, availableMg: 0, lockedMg: 0, lastSeq: 0, updatedAt: new Date() } },
      { upsert: true },
    );
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err; // concurrent upsert of the same account
  }
}

/**
 * Posts one ledger entry inside the caller's transaction. Use this when the posting must commit
 * together with other writes (payment status, payout record, delivery status).
 */
export async function postInSession(session: ClientSession, input: PostingInput): Promise<LedgerEntryDoc> {
  validate(input);

  const existing = await LedgerEntry.findOne({ idempotencyKey: input.idempotencyKey }, null, { session }).lean();
  if (existing) return existing as LedgerEntryDoc;

  const now = new Date();
  // Conditional update: a debit matches nothing when funds are short (no overdraft, enforced by the query).
  const filter: Record<string, unknown> = { userId: input.userId };
  if (input.availableDeltaMg < 0) filter.availableMg = { $gte: -input.availableDeltaMg };
  if (input.lockedDeltaMg < 0) filter.lockedMg = { $gte: -input.lockedDeltaMg };

  const account = await Account.findOneAndUpdate(
    filter,
    {
      $inc: { availableMg: input.availableDeltaMg, lockedMg: input.lockedDeltaMg },
      $set: { updatedAt: now },
    },
    { new: true, session, lean: true },
  );
  if (!account) {
    const exists = await Account.exists({ userId: input.userId }).session(session);
    if (!exists) throw new AppError('NOT_FOUND', 'Account not found');
    throw new AppError('INSUFFICIENT_GOLD', 'Not enough gold for this operation');
  }

  const head = await ChainHead.findOneAndUpdate({ _id: HEAD_ID }, { $inc: { seq: 1 } }, { new: true, session, lean: true });
  if (!head) throw new Error('chain_head missing: run initChainHead()');

  const unhashed: Omit<LedgerEntryDoc, 'hash'> = {
    seq: head.seq,
    userId: input.userId,
    type: input.type,
    availableDeltaMg: input.availableDeltaMg,
    lockedDeltaMg: input.lockedDeltaMg,
    amountMinor: input.amountMinor ?? null,
    currency: input.currency ?? null,
    quoteId: input.quoteId ?? null,
    refType: input.refType,
    refId: input.refId,
    idempotencyKey: input.idempotencyKey,
    balanceAfter: { availableMg: account.availableMg, lockedMg: account.lockedMg },
    prevHash: head.hash,
    createdBy: input.createdBy,
    createdAt: now,
  };
  const entry: LedgerEntryDoc = { ...unhashed, hash: computeEntryHash(unhashed) };

  await LedgerEntry.create([entry], { session });
  await ChainHead.updateOne({ _id: HEAD_ID }, { $set: { hash: entry.hash } }, { session });
  await Account.updateOne({ userId: input.userId }, { $set: { lastSeq: head.seq } }, { session });
  return entry;
}

/** Posts one ledger entry in its own transaction. Repeating an idempotencyKey returns the original entry. */
export async function post(input: PostingInput): Promise<LedgerEntryDoc> {
  try {
    return await withTransaction((session) => postInSession(session, input));
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existing = await LedgerEntry.findOne({ idempotencyKey: input.idempotencyKey }).lean();
      if (existing) return existing as LedgerEntryDoc;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Read-only access for the rest of the app.
// ---------------------------------------------------------------------------

export interface Balance {
  availableMg: number;
  lockedMg: number;
  lastSeq: number;
}

export async function getBalance(userId: Types.ObjectId): Promise<Balance> {
  const a = await Account.findOne({ userId }).lean();
  return { availableMg: a?.availableMg ?? 0, lockedMg: a?.lockedMg ?? 0, lastSeq: a?.lastSeq ?? 0 };
}

export async function getBalances(userIds: Types.ObjectId[]): Promise<Map<string, Balance>> {
  const rows = await Account.find({ userId: { $in: userIds } }).lean();
  return new Map(rows.map((a) => [a.userId.toHexString(), { availableMg: a.availableMg, lockedMg: a.lockedMg, lastSeq: a.lastSeq }]));
}

export async function listAccounts(): Promise<AccountDoc[]> {
  return Account.find().lean();
}

export async function totals(): Promise<{ availableMg: number; lockedMg: number }> {
  const [row] = await Account.aggregate<{ availableMg: number; lockedMg: number }>([
    { $group: { _id: null, availableMg: { $sum: '$availableMg' }, lockedMg: { $sum: '$lockedMg' } } },
  ]);
  return { availableMg: row?.availableMg ?? 0, lockedMg: row?.lockedMg ?? 0 };
}

export interface EntryFilter {
  userId?: Types.ObjectId;
  type?: EntryType;
  from?: Date;
  to?: Date;
}

function buildFilter(f: EntryFilter) {
  const q: Record<string, unknown> = {};
  if (f.userId) q.userId = f.userId;
  if (f.type) q.type = f.type;
  if (f.from || f.to) {
    q.createdAt = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: f.to } : {}) };
  }
  return q;
}

export async function listEntries(
  f: EntryFilter,
  page: number,
  pageSize: number,
): Promise<{ items: LedgerEntryDoc[]; total: number }> {
  const q = buildFilter(f);
  const [items, total] = await Promise.all([
    LedgerEntry.find(q).sort({ seq: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    LedgerEntry.countDocuments(q),
  ]);
  return { items: items as LedgerEntryDoc[], total };
}

export async function findEntryBySeq(seq: number): Promise<LedgerEntryDoc | null> {
  return (await LedgerEntry.findOne({ seq }).lean()) as LedgerEntryDoc | null;
}

export async function findEntryByIdempotencyKey(key: string): Promise<LedgerEntryDoc | null> {
  return (await LedgerEntry.findOne({ idempotencyKey: key }).lean()) as LedgerEntryDoc | null;
}

/** Streams every entry in seq order (integrity check). */
export function streamAllEntries(): AsyncIterable<LedgerEntryDoc> {
  return LedgerEntry.find().sort({ seq: 1 }).lean().cursor() as unknown as AsyncIterable<LedgerEntryDoc>;
}

export async function entriesInSeqRange(firstSeq: number, lastSeq: number): Promise<LedgerEntryDoc[]> {
  return (await LedgerEntry.find({ seq: { $gte: firstSeq, $lte: lastSeq } }).sort({ seq: 1 }).lean()) as LedgerEntryDoc[];
}

export async function seqRangeForPeriod(from: Date, to: Date): Promise<{ firstSeq: number; lastSeq: number } | null> {
  const [row] = await LedgerEntry.aggregate<{ firstSeq: number; lastSeq: number }>([
    { $match: { createdAt: { $gte: from, $lt: to } } },
    { $group: { _id: null, firstSeq: { $min: '$seq' }, lastSeq: { $max: '$seq' } } },
  ]);
  return row ? { firstSeq: row.firstSeq, lastSeq: row.lastSeq } : null;
}

export async function getChainHead(): Promise<{ seq: number; hash: string } | null> {
  const h = await ChainHead.findById(HEAD_ID).lean();
  return h ? { seq: h.seq, hash: h.hash } : null;
}
