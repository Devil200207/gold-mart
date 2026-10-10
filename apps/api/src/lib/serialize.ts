// Maps DB documents to the API contract shapes.
import { Types } from 'mongoose';
import { explorerUrl } from '../services/anchor.service';
import { deliveryOtp } from '../services/delivery.service';
import type { LedgerEntryDoc } from '../services/ledger.service';
import {
  AnchorDoc,
  AuditLogDoc,
  DeliveryDoc,
  IntegrityCheckDoc,
  PaymentDoc,
  QuoteDoc,
  ReversalRequestDoc,
  UserDoc,
} from '../models';

const id = (v: Types.ObjectId | null | undefined) => (v ? v.toHexString() : null);
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

export function toMe(u: UserDoc) {
  return {
    id: u._id.toHexString(),
    email: u.email,
    kycStatus: u.kycStatus,
    kycName: u.kyc?.fullName ?? null,
    bankAccount: u.bankAccount
      ? { holderName: u.bankAccount.holderName, ibanMasked: maskIban(u.bankAccount.iban) }
      : null,
    createdAt: iso(u.createdAt),
  };
}

export const maskIban = (iban: string) => {
  const clean = iban.replace(/\s/g, '');
  return `${clean.slice(0, 4)} •••• •••• ${clean.slice(-4)}`;
};

export function toQuote(q: QuoteDoc) {
  return {
    id: q._id.toHexString(),
    side: q.side,
    pricePerGramMinor: q.pricePerGramMinor,
    goldMg: q.goldMg,
    subtotalMinor: q.subtotalMinor,
    feeMinor: q.feeMinor,
    taxMinor: q.taxMinor,
    totalMinor: q.totalMinor,
    currency: q.currency,
    status: q.status,
    expiresAt: iso(q.expiresAt),
    serverTime: new Date().toISOString(),
    createdAt: iso(q.createdAt),
  };
}

export function toPayment(p: PaymentDoc, goldMg: number | null) {
  return {
    id: p._id.toHexString(),
    purpose: p.purpose,
    status: p.status,
    amountMinor: p.amountMinor,
    currency: p.currency,
    gatewayOrderId: p.gatewayOrderId,
    checkoutUrl: p.checkoutUrl,
    goldMg,
    deliveryId: id(p.deliveryId),
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

export function toEntry(e: LedgerEntryDoc) {
  return {
    seq: e.seq,
    type: e.type,
    availableDeltaMg: e.availableDeltaMg,
    lockedDeltaMg: e.lockedDeltaMg,
    amountMinor: e.amountMinor,
    currency: e.currency,
    refType: e.refType,
    refId: e.refId.toHexString(),
    balanceAfter: { availableMg: e.balanceAfter.availableMg, lockedMg: e.balanceAfter.lockedMg },
    hash: e.hash,
    createdAt: iso(e.createdAt),
  };
}

export function toAdminEntry(e: LedgerEntryDoc, emails: Map<string, string>, adminNames: Map<string, string>) {
  const createdBy = e.createdBy === 'system' ? 'system' : (adminNames.get(String(e.createdBy)) ?? String(e.createdBy));
  return {
    ...toEntry(e),
    userId: e.userId.toHexString(),
    userEmail: emails.get(e.userId.toHexString()) ?? null,
    prevHash: e.prevHash,
    idempotencyKey: e.idempotencyKey,
    quoteId: id(e.quoteId),
    createdBy,
  };
}

const OTP_VISIBLE = new Set(['LOCKED', 'PACKED', 'SHIPPED']);

export function toDelivery(d: DeliveryDoc, payment: PaymentDoc | null, opts: { includeOtp: boolean }) {
  const base = {
    id: d._id.toHexString(),
    product: d.product,
    productName: d.productName,
    goldMg: d.goldMg,
    address: d.address,
    status: d.status,
    chargesMinor: d.chargesMinor,
    currency: d.currency,
    chargesPaymentId: id(d.chargesPaymentId),
    chargesStatus: payment?.status ?? null,
    chargesCheckoutUrl: payment && payment.status === 'CREATED' ? payment.checkoutUrl : null,
    chargesDueBy: iso(d.chargesDueBy),
    trackingNo: d.trackingNo,
    history: d.history.map((h) => ({ status: h.status, at: iso(h.at), by: h.by })),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
  if (!opts.includeOtp) return base;
  const otp = d.chargesPaidAt && OTP_VISIBLE.has(d.status) ? deliveryOtp(d._id) : null;
  return { ...base, otp };
}

export function toAdminDelivery(d: DeliveryDoc, payment: PaymentDoc | null, email: string | null) {
  return { ...toDelivery(d, payment, { includeOtp: false }), userId: d.userId.toHexString(), userEmail: email };
}

export function toReversal(r: ReversalRequestDoc, emails: Map<string, string>, adminNames: Map<string, string>) {
  const ref = (v: Types.ObjectId | null) => (v ? { id: v.toHexString(), username: adminNames.get(v.toHexString()) ?? '?' } : null);
  return {
    id: r._id.toHexString(),
    targetSeq: r.targetSeq,
    userId: r.userId.toHexString(),
    userEmail: emails.get(r.userId.toHexString()) ?? null,
    availableDeltaMg: r.availableDeltaMg,
    lockedDeltaMg: r.lockedDeltaMg,
    reason: r.reason,
    requestedBy: ref(r.requestedBy)!,
    approvedBy: ref(r.approvedBy),
    rejectedBy: ref(r.rejectedBy),
    status: r.status,
    postedSeq: r.postedSeq,
    createdAt: iso(r.createdAt),
    decidedAt: iso(r.decidedAt),
  };
}

export function toIntegrity(c: IntegrityCheckDoc | null) {
  if (!c) return null;
  return {
    id: c._id.toHexString(),
    ok: c.ok,
    trigger: c.trigger,
    startedAt: iso(c.startedAt),
    finishedAt: iso(c.finishedAt),
    entriesChecked: c.entriesChecked,
    lastSeq: c.lastSeq,
    usersChecked: c.usersChecked,
    totalOwedMg: c.totalOwedMg,
    physicalStockMg: c.physicalStockMg,
    failures: c.failures,
  };
}

export function toAnchor(a: AnchorDoc | null) {
  if (!a) return null;
  return {
    id: a._id.toHexString(),
    date: a.date,
    firstSeq: a.firstSeq,
    lastSeq: a.lastSeq,
    entryCount: a.entryCount,
    merkleRoot: a.merkleRoot,
    status: a.status,
    txHash: a.txHash,
    explorerUrl: explorerUrl(a.txHash),
    error: a.error,
    createdAt: iso(a.createdAt),
  };
}

export function toAudit(a: AuditLogDoc) {
  return {
    id: a._id.toHexString(),
    actorType: a.actorType,
    actorId: id(a.actorId),
    actorLabel: a.actorLabel,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    ip: a.ip,
    details: a.details,
    createdAt: iso(a.createdAt),
  };
}
