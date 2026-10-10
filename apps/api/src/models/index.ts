// Every collection except the ledger collections (accounts, ledger_entries, chain_head),
// which live in ledger.models.ts and are only reachable through ledger.service.ts.
// Indexes and validators are created by scripts/setup-db-roles.ts, not by Mongoose.
import { Schema, model, Types } from 'mongoose';

const opts = { versionKey: false } as const;

// ---------- users ----------
export type KycStatus = 'NONE' | 'VERIFIED';
export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  role: 'USER';
  kycStatus: KycStatus;
  kyc: { fullName: string; idNumberLast4: string; dateOfBirth: string; verifiedAt: Date } | null;
  bankAccount: { holderName: string; iban: string; addedAt: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}
export const User = model<UserDoc>(
  'User',
  new Schema<UserDoc>(
    {
      email: { type: String, required: true, lowercase: true, trim: true },
      role: { type: String, enum: ['USER'], default: 'USER' },
      kycStatus: { type: String, enum: ['NONE', 'VERIFIED'], default: 'NONE' },
      kyc: { type: Schema.Types.Mixed, default: null },
      bankAccount: { type: Schema.Types.Mixed, default: null },
    },
    { ...opts, timestamps: true },
  ),
  'users',
);

// ---------- admins ----------
export const ADMIN_ROLES = ['SUPPORT', 'OPS', 'FINANCE'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export interface AdminDoc {
  _id: Types.ObjectId;
  username: string;
  passwordHash: string;
  totpSecret: string;
  roles: AdminRole[];
  active: boolean;
  createdAt: Date;
}
export const Admin = model<AdminDoc>(
  'Admin',
  new Schema<AdminDoc>(
    {
      username: { type: String, required: true },
      passwordHash: { type: String, required: true },
      totpSecret: { type: String, required: true },
      roles: [{ type: String, enum: ADMIN_ROLES }],
      active: { type: Boolean, default: true },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
  'admins',
);

export interface AdminSessionDoc {
  _id: string;
  adminId: Types.ObjectId;
  lastSeenAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}
export const AdminSession = model<AdminSessionDoc>(
  'AdminSession',
  new Schema<AdminSessionDoc>(
    {
      _id: { type: String, required: true },
      adminId: { type: Schema.Types.ObjectId, required: true },
      lastSeenAt: { type: Date, required: true },
      createdAt: { type: Date, default: () => new Date() },
      revokedAt: { type: Date, default: null },
    },
    opts,
  ),
  'admin_sessions',
);

// ---------- login OTPs ----------
export interface OtpCodeDoc {
  _id: Types.ObjectId;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}
export const OtpCode = model<OtpCodeDoc>(
  'OtpCode',
  new Schema<OtpCodeDoc>(
    {
      email: { type: String, required: true },
      codeHash: { type: String, required: true },
      expiresAt: { type: Date, required: true },
      attempts: { type: Number, default: 0 },
      consumedAt: { type: Date, default: null },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
  'otp_codes',
);

// ---------- idempotency keys (HTTP layer) ----------
export interface IdempotencyKeyDoc {
  _id: Types.ObjectId;
  scope: string;
  key: string;
  method: string;
  path: string;
  bodyHash: string;
  state: 'IN_PROGRESS' | 'DONE';
  responseStatus: number | null;
  responseBody: unknown;
  createdAt: Date;
}
export const IdempotencyKey = model<IdempotencyKeyDoc>(
  'IdempotencyKey',
  new Schema<IdempotencyKeyDoc>(
    {
      scope: { type: String, required: true },
      key: { type: String, required: true },
      method: { type: String, required: true },
      path: { type: String, required: true },
      bodyHash: { type: String, required: true },
      state: { type: String, enum: ['IN_PROGRESS', 'DONE'], required: true },
      responseStatus: { type: Number, default: null },
      responseBody: { type: Schema.Types.Mixed, default: null },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
  'idempotency_keys',
);

// ---------- quotes ----------
export type QuoteSide = 'BUY' | 'SELL';
export type QuoteStatus = 'OPEN' | 'USED' | 'EXPIRED';
export interface QuoteDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  side: QuoteSide;
  inputMode: 'AMOUNT' | 'WEIGHT';
  spotPerGramMinor: number;
  pricePerGramMinor: number;
  goldMg: number;
  subtotalMinor: number;
  feeMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  expiresAt: Date;
  status: QuoteStatus;
  usedAt: Date | null;
  createdAt: Date;
}
export const Quote = model<QuoteDoc>(
  'Quote',
  new Schema<QuoteDoc>(
    {
      userId: { type: Schema.Types.ObjectId, required: true },
      side: { type: String, enum: ['BUY', 'SELL'], required: true },
      inputMode: { type: String, enum: ['AMOUNT', 'WEIGHT'], required: true },
      spotPerGramMinor: { type: Number, required: true },
      pricePerGramMinor: { type: Number, required: true },
      goldMg: { type: Number, required: true },
      subtotalMinor: { type: Number, required: true },
      feeMinor: { type: Number, required: true },
      taxMinor: { type: Number, required: true },
      totalMinor: { type: Number, required: true },
      currency: { type: String, required: true },
      expiresAt: { type: Date, required: true },
      status: { type: String, enum: ['OPEN', 'USED', 'EXPIRED'], default: 'OPEN' },
      usedAt: { type: Date, default: null },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
  'quotes',
);

// ---------- payments ----------
export type PaymentStatus = 'CREATED' | 'PAID' | 'FAILED' | 'LATE_PAID_REFUND';
export interface PaymentDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  purpose: 'BUY' | 'DELIVERY_CHARGES';
  quoteId: Types.ObjectId | null;
  deliveryId: Types.ObjectId | null;
  gatewayOrderId: string;
  checkoutUrl: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  webhookEventIds: string[];
  needsManualRefund: boolean;
  flagReason: string | null;
  ledgerSeq: number | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export const Payment = model<PaymentDoc>(
  'Payment',
  new Schema<PaymentDoc>(
    {
      userId: { type: Schema.Types.ObjectId, required: true },
      purpose: { type: String, enum: ['BUY', 'DELIVERY_CHARGES'], required: true },
      quoteId: { type: Schema.Types.ObjectId, default: null },
      deliveryId: { type: Schema.Types.ObjectId, default: null },
      gatewayOrderId: { type: String, required: true },
      checkoutUrl: { type: String, required: true },
      amountMinor: { type: Number, required: true },
      currency: { type: String, required: true },
      status: { type: String, enum: ['CREATED', 'PAID', 'FAILED', 'LATE_PAID_REFUND'], default: 'CREATED' },
      webhookEventIds: { type: [String], default: [] },
      needsManualRefund: { type: Boolean, default: false },
      flagReason: { type: String, default: null },
      ledgerSeq: { type: Number, default: null },
      paidAt: { type: Date, default: null },
    },
    { ...opts, timestamps: true },
  ),
  'payments',
);

// ---------- payouts ----------
export type PayoutStatus = 'PENDING' | 'PAID' | 'FAILED';
export interface PayoutDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  quoteId: Types.ObjectId;
  goldMg: number;
  amountMinor: number;
  currency: string;
  status: PayoutStatus;
  gatewayPayoutId: string | null;
  ledgerSeq: number | null;
  reversalSeq: number | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const Payout = model<PayoutDoc>(
  'Payout',
  new Schema<PayoutDoc>(
    {
      userId: { type: Schema.Types.ObjectId, required: true },
      quoteId: { type: Schema.Types.ObjectId, required: true },
      goldMg: { type: Number, required: true },
      amountMinor: { type: Number, required: true },
      currency: { type: String, required: true },
      status: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
      gatewayPayoutId: { type: String, default: null },
      ledgerSeq: { type: Number, default: null },
      reversalSeq: { type: Number, default: null },
      failureReason: { type: String, default: null },
    },
    { ...opts, timestamps: true },
  ),
  'payouts',
);

// ---------- deliveries ----------
export const DELIVERY_STATUSES = ['REQUESTED', 'LOCKED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export interface Address {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  country: string;
  postalCode?: string;
}
export interface DeliveryDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  goldMg: number;
  product: string;
  productName: string;
  address: Address;
  chargesMinor: number;
  currency: string;
  chargesPaymentId: Types.ObjectId | null;
  chargesPaidAt: Date | null;
  chargesDueBy: Date;
  status: DeliveryStatus;
  otpHash: string | null;
  trackingNo: string | null;
  history: { status: DeliveryStatus; at: Date; by: string }[];
  createdAt: Date;
  updatedAt: Date;
}
export const Delivery = model<DeliveryDoc>(
  'Delivery',
  new Schema<DeliveryDoc>(
    {
      userId: { type: Schema.Types.ObjectId, required: true },
      goldMg: { type: Number, required: true },
      product: { type: String, required: true },
      productName: { type: String, required: true },
      address: { type: Schema.Types.Mixed, required: true },
      chargesMinor: { type: Number, required: true },
      currency: { type: String, required: true },
      chargesPaymentId: { type: Schema.Types.ObjectId, default: null },
      chargesPaidAt: { type: Date, default: null },
      chargesDueBy: { type: Date, required: true },
      status: { type: String, enum: DELIVERY_STATUSES, required: true },
      otpHash: { type: String, default: null },
      trackingNo: { type: String, default: null },
      history: [{ _id: false, status: String, at: Date, by: String }],
    },
    { ...opts, timestamps: true },
  ),
  'deliveries',
);

// ---------- reversal requests ----------
export interface ReversalRequestDoc {
  _id: Types.ObjectId;
  targetSeq: number;
  userId: Types.ObjectId;
  availableDeltaMg: number;
  lockedDeltaMg: number;
  reason: string;
  requestedBy: Types.ObjectId;
  approvedBy: Types.ObjectId | null;
  rejectedBy: Types.ObjectId | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  postedSeq: number | null;
  createdAt: Date;
  decidedAt: Date | null;
}
export const ReversalRequest = model<ReversalRequestDoc>(
  'ReversalRequest',
  new Schema<ReversalRequestDoc>(
    {
      targetSeq: { type: Number, required: true },
      userId: { type: Schema.Types.ObjectId, required: true },
      availableDeltaMg: { type: Number, required: true },
      lockedDeltaMg: { type: Number, required: true },
      reason: { type: String, required: true },
      requestedBy: { type: Schema.Types.ObjectId, required: true },
      approvedBy: { type: Schema.Types.ObjectId, default: null },
      rejectedBy: { type: Schema.Types.ObjectId, default: null },
      status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
      postedSeq: { type: Number, default: null },
      createdAt: { type: Date, default: () => new Date() },
      decidedAt: { type: Date, default: null },
    },
    opts,
  ),
  'reversal_requests',
);

// ---------- audit logs (insert-only) ----------
export type ActorType = 'user' | 'admin' | 'system' | 'anonymous' | 'gateway';
export interface AuditLogDoc {
  _id: Types.ObjectId;
  actorType: ActorType;
  actorId: Types.ObjectId | null;
  actorLabel: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
}
export const AuditLog = model<AuditLogDoc>(
  'AuditLog',
  new Schema<AuditLogDoc>(
    {
      actorType: { type: String, required: true },
      actorId: { type: Schema.Types.ObjectId, default: null },
      actorLabel: { type: String, default: null },
      action: { type: String, required: true },
      targetType: { type: String, default: null },
      targetId: { type: String, default: null },
      ip: { type: String, default: null },
      userAgent: { type: String, default: null },
      details: { type: Schema.Types.Mixed, default: null },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
  'audit_logs',
);

// ---------- integrity checks ----------
export interface IntegrityFailure {
  check: 'HASH' | 'SEQ' | 'CHAIN_HEAD' | 'BALANCE' | 'STOCK';
  seq?: number;
  userId?: string;
  message: string;
}
export interface IntegrityCheckDoc {
  _id: Types.ObjectId;
  ok: boolean;
  trigger: 'scheduled' | 'manual' | 'test';
  startedAt: Date;
  finishedAt: Date;
  entriesChecked: number;
  lastSeq: number;
  usersChecked: number;
  totalOwedMg: number;
  physicalStockMg: number;
  failures: IntegrityFailure[];
}
export const IntegrityCheck = model<IntegrityCheckDoc>(
  'IntegrityCheck',
  new Schema<IntegrityCheckDoc>(
    {
      ok: { type: Boolean, required: true },
      trigger: { type: String, required: true },
      startedAt: { type: Date, required: true },
      finishedAt: { type: Date, required: true },
      entriesChecked: { type: Number, required: true },
      lastSeq: { type: Number, required: true },
      usersChecked: { type: Number, required: true },
      totalOwedMg: { type: Number, required: true },
      physicalStockMg: { type: Number, required: true },
      failures: { type: Schema.Types.Mixed, default: [] },
    },
    opts,
  ),
  'integrity_checks',
);

// ---------- anchors ----------
export interface AnchorDoc {
  _id: Types.ObjectId;
  date: string;
  firstSeq: number;
  lastSeq: number;
  entryCount: number;
  merkleRoot: string;
  status: 'LOCAL_ONLY' | 'SENT' | 'FAILED';
  txHash: string | null;
  error: string | null;
  createdAt: Date;
}
export const Anchor = model<AnchorDoc>(
  'Anchor',
  new Schema<AnchorDoc>(
    {
      date: { type: String, required: true },
      firstSeq: { type: Number, required: true },
      lastSeq: { type: Number, required: true },
      entryCount: { type: Number, required: true },
      merkleRoot: { type: String, required: true },
      status: { type: String, enum: ['LOCAL_ONLY', 'SENT', 'FAILED'], required: true },
      txHash: { type: String, default: null },
      error: { type: String, default: null },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
  'anchors',
);

// ---------- mock gateway state (stands in for the gateway's own database) ----------
export interface MockGatewayOrderDoc {
  _id: Types.ObjectId;
  gatewayId: string;
  kind: 'ORDER' | 'PAYOUT';
  amountMinor: number;
  currency: string;
  reference: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
  createdAt: Date;
}
export const MockGatewayOrder = model<MockGatewayOrderDoc>(
  'MockGatewayOrder',
  new Schema<MockGatewayOrderDoc>(
    {
      gatewayId: { type: String, required: true },
      kind: { type: String, enum: ['ORDER', 'PAYOUT'], required: true },
      amountMinor: { type: Number, required: true },
      currency: { type: String, required: true },
      reference: { type: String, required: true },
      status: { type: String, enum: ['PENDING', 'PAID', 'FAILED'], default: 'PENDING' },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
  'mock_gateway_orders',
);
