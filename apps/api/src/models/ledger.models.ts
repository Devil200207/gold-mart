// RESTRICTED MODULE: only services/ledger.service.ts may import this file.
// test/single-write-path.test.ts fails the build if any other source file imports it.
import { Schema, model, Types } from 'mongoose';

export const ENTRY_TYPES = [
  'BUY',
  'SELL',
  'DELIVERY_LOCK',
  'DELIVERY_RELEASE',
  'DELIVERY_COMPLETE',
  'REVERSAL',
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const REF_TYPES = ['payment', 'payout', 'delivery', 'reversal'] as const;
export type RefType = (typeof REF_TYPES)[number];

export interface LedgerEntryDoc {
  _id?: Types.ObjectId;
  seq: number;
  userId: Types.ObjectId;
  type: EntryType;
  availableDeltaMg: number;
  lockedDeltaMg: number;
  amountMinor: number | null;
  currency: string | null;
  quoteId: Types.ObjectId | null;
  refType: RefType;
  refId: Types.ObjectId;
  idempotencyKey: string;
  balanceAfter: { availableMg: number; lockedMg: number };
  prevHash: string;
  hash: string;
  createdBy: 'system' | Types.ObjectId;
  createdAt: Date;
}

const ledgerEntrySchema = new Schema<LedgerEntryDoc>(
  {
    seq: { type: Number, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ENTRY_TYPES, required: true },
    availableDeltaMg: { type: Number, required: true },
    lockedDeltaMg: { type: Number, required: true },
    amountMinor: { type: Number, default: null },
    currency: { type: String, default: null },
    quoteId: { type: Schema.Types.ObjectId, default: null },
    refType: { type: String, enum: REF_TYPES, required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    idempotencyKey: { type: String, required: true },
    balanceAfter: {
      availableMg: { type: Number, required: true },
      lockedMg: { type: Number, required: true },
    },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
    createdBy: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, required: true },
  },
  { versionKey: false },
);

export interface AccountDoc {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  availableMg: number;
  lockedMg: number;
  lastSeq: number;
  updatedAt: Date;
}

const accountSchema = new Schema<AccountDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    availableMg: { type: Number, required: true, default: 0 },
    lockedMg: { type: Number, required: true, default: 0 },
    lastSeq: { type: Number, required: true, default: 0 },
    updatedAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

export interface ChainHeadDoc {
  _id: string;
  seq: number;
  hash: string;
}

const chainHeadSchema = new Schema<ChainHeadDoc>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true },
    hash: { type: String, required: true },
  },
  { versionKey: false },
);

export const LedgerEntry = model<LedgerEntryDoc>('LedgerEntry', ledgerEntrySchema, 'ledger_entries');
export const Account = model<AccountDoc>('Account', accountSchema, 'accounts');
export const ChainHead = model<ChainHeadDoc>('ChainHead', chainHeadSchema, 'chain_head');
