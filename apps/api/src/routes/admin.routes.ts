import { Router } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import {
  toAdminDelivery,
  toAdminEntry,
  toAnchor,
  toAudit,
  toEntry,
  toIntegrity,
  toMe,
  toReversal,
} from '../lib/serialize';
import {
  adminLoginBody,
  auditQuery,
  completeBody,
  deliveryStatusBody,
  deliveryStatusQuery,
  ledgerQuery,
  objectId,
  pageQuery,
  reversalBody,
} from '../lib/validation';
import {
  Admin,
  AdminDoc,
  AuditLog,
  AuditLogDoc,
  Delivery,
  DELIVERY_STATUSES,
  DeliveryDoc,
  Payment,
  PaymentDoc,
  ReversalRequest,
  ReversalRequestDoc,
  User,
  UserDoc,
} from '../models';
import { ah, ctxOf } from '../middleware/async';
import { currentAdmin, requireAdmin, requireRole } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { authLimiter } from '../middleware/rate-limit';
import { adminLogin, adminLogout } from '../services/admin-auth.service';
import { latestAnchors } from '../services/anchor.service';
import { audit } from '../services/audit.service';
import { adminSetStatus, completeDelivery } from '../services/delivery.service';
import { latestIntegrityCheck, runIntegrityCheck } from '../services/integrity.service';
import { getBalance, getBalances, listEntries, LedgerEntryDoc, totals } from '../services/ledger.service';
import { approveReversal, rejectReversal, requestReversal } from '../services/reversal.service';

export const adminRouter = Router();

const toAdmin = (a: AdminDoc) => ({ id: a._id.toHexString(), username: a.username, roles: a.roles });

// ---------- auth (no session yet) ----------
adminRouter.post(
  '/auth/login',
  authLimiter,
  ah(async (req, res) => {
    const { username, password, totp } = adminLoginBody.parse(req.body);
    const r = await adminLogin(username, password, totp, ctxOf(req));
    res.json({ token: r.token, admin: toAdmin(r.admin) });
  }),
);

// ---------- everything below needs an admin session ----------
adminRouter.use(requireAdmin);
adminRouter.post(
  '/auth/logout',
  ah(async (req, res) => {
    await adminLogout(req.adminSid!);
    res.json({ ok: true });
  }),
);
adminRouter.use(idempotency((req) => `admin:${currentAdmin(req)._id.toHexString()}`));

// lookup helpers
async function emailsFor(ids: Types.ObjectId[]): Promise<Map<string, string>> {
  const rows = await User.find({ _id: { $in: ids } }, { email: 1 }).lean();
  return new Map(rows.map((u) => [u._id.toHexString(), u.email]));
}
async function adminNames(): Promise<Map<string, string>> {
  const rows = await Admin.find({}, { username: 1 }).lean();
  return new Map(rows.map((a) => [a._id.toHexString(), a.username]));
}
async function paymentsFor(ds: DeliveryDoc[]): Promise<Map<string, PaymentDoc>> {
  const ids = ds.map((d) => d.chargesPaymentId).filter((x): x is Types.ObjectId => !!x);
  const rows = (await Payment.find({ _id: { $in: ids } }).lean()) as PaymentDoc[];
  return new Map(rows.map((p) => [p._id.toHexString(), p]));
}
async function adminDeliveries(ds: DeliveryDoc[]) {
  const [pays, emails] = await Promise.all([paymentsFor(ds), emailsFor(ds.map((d) => d.userId))]);
  return ds.map((d) => toAdminDelivery(d, pays.get(String(d.chargesPaymentId)) ?? null, emails.get(d.userId.toHexString()) ?? null));
}

adminRouter.get('/me', (req, res) => {
  res.json(toAdmin(currentAdmin(req)));
});

// ---------- dashboard & integrity ----------
adminRouter.get(
  '/dashboard',
  ah(async (_req, res) => {
    const [t, userCount, pendingReversals, byStatus, lastIntegrity, anchors] = await Promise.all([
      totals(),
      User.countDocuments(),
      ReversalRequest.countDocuments({ status: 'PENDING' }),
      Delivery.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      latestIntegrityCheck(),
      latestAnchors(1),
    ]);
    const deliveriesByStatus = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, byStatus.find((b) => b._id === s)?.n ?? 0]));
    res.json({
      userCount,
      totalAvailableMg: t.availableMg,
      totalLockedMg: t.lockedMg,
      totalOwedMg: t.availableMg + t.lockedMg,
      physicalStockMg: env.PHYSICAL_STOCK_MG,
      pendingReversals,
      deliveriesByStatus,
      lastIntegrity: toIntegrity(lastIntegrity),
      lastAnchor: toAnchor(anchors[0] ?? null),
      anchorEnabled: env.ANCHOR_ENABLED,
    });
  }),
);

adminRouter.get(
  '/integrity',
  ah(async (_req, res) => {
    const [latest, anchors] = await Promise.all([latestIntegrityCheck(), latestAnchors(10)]);
    res.json({ latest: toIntegrity(latest), anchors: anchors.map(toAnchor), anchorEnabled: env.ANCHOR_ENABLED });
  }),
);

adminRouter.post(
  '/integrity/run',
  ah(async (req, res) => {
    const admin = currentAdmin(req);
    const result = await runIntegrityCheck('manual');
    await audit({ actorType: 'admin', actorId: admin._id, actorLabel: admin.username, action: 'integrity.run', details: { ok: result.ok }, ctx: ctxOf(req) });
    res.json(toIntegrity(result));
  }),
);

// ---------- users ----------
adminRouter.get(
  '/users',
  ah(async (req, res) => {
    const admin = currentAdmin(req);
    const { page, pageSize } = pageQuery.parse(req.query);
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 100) : null;
    const filter = q ? { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      User.countDocuments(filter),
    ]);
    const balances = await getBalances(users.map((u) => u._id));
    await audit({ actorType: 'admin', actorId: admin._id, actorLabel: admin.username, action: 'admin.view_users', details: { q, page }, ctx: ctxOf(req) });
    res.json({
      items: users.map((u) => ({
        id: u._id.toHexString(),
        email: u.email,
        kycStatus: u.kycStatus,
        availableMg: balances.get(u._id.toHexString())?.availableMg ?? 0,
        lockedMg: balances.get(u._id.toHexString())?.lockedMg ?? 0,
        createdAt: u.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    });
  }),
);

adminRouter.get(
  '/users/:id',
  ah(async (req, res) => {
    const admin = currentAdmin(req);
    const id = objectId.parse(req.params.id);
    const user = (await User.findById(id).lean()) as UserDoc | null;
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    const [account, entries, deliveries] = await Promise.all([
      getBalance(id),
      listEntries({ userId: id }, 1, 50),
      Delivery.find({ userId: id }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    await audit({ actorType: 'admin', actorId: admin._id, actorLabel: admin.username, action: 'admin.view_user', targetType: 'user', targetId: id.toHexString(), ctx: ctxOf(req) });
    res.json({ user: toMe(user), account, entries: entries.items.map(toEntry), deliveries: await adminDeliveries(deliveries as DeliveryDoc[]) });
  }),
);

// ---------- ledger ----------
adminRouter.get(
  '/ledger',
  ah(async (req, res) => {
    const admin = currentAdmin(req);
    const { page, pageSize, userId, type, from, to } = ledgerQuery.parse(req.query);
    const toExclusive = to ? new Date(to.getTime() + 86_400_000) : undefined;
    const r = await listEntries({ userId, type, from, to: toExclusive }, page, pageSize);
    const [emails, names] = await Promise.all([emailsFor(r.items.map((e) => e.userId)), adminNames()]);
    await audit({
      actorType: 'admin',
      actorId: admin._id,
      actorLabel: admin.username,
      action: 'admin.view_ledger',
      details: { userId: userId?.toHexString() ?? null, type: type ?? null, page },
      ctx: ctxOf(req),
    });
    res.json({ items: r.items.map((e: LedgerEntryDoc) => toAdminEntry(e, emails, names)), page, pageSize, total: r.total });
  }),
);

// ---------- deliveries ----------
adminRouter.get(
  '/deliveries',
  ah(async (req, res) => {
    const { status } = deliveryStatusQuery.parse(req.query);
    const rows = (await Delivery.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(200).lean()) as DeliveryDoc[];
    res.json({ items: await adminDeliveries(rows) });
  }),
);

adminRouter.post(
  '/deliveries/:id/status',
  requireRole('OPS'),
  ah(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { status, trackingNo } = deliveryStatusBody.parse(req.body);
    const d = await adminSetStatus(currentAdmin(req), id, status, trackingNo, ctxOf(req));
    res.json((await adminDeliveries([d]))[0]);
  }),
);

adminRouter.post(
  '/deliveries/:id/complete',
  requireRole('OPS'),
  ah(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const { otp } = completeBody.parse(req.body);
    const d = await completeDelivery(currentAdmin(req), id, otp, ctxOf(req));
    res.json((await adminDeliveries([d]))[0]);
  }),
);

// ---------- reversals (two-person approval) ----------
async function serializeReversals(rows: ReversalRequestDoc[]) {
  const [emails, names] = await Promise.all([emailsFor(rows.map((r) => r.userId)), adminNames()]);
  return rows.map((r) => toReversal(r, emails, names));
}

adminRouter.get(
  '/reversals',
  ah(async (req, res) => {
    const status = typeof req.query.status === 'string' && ['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.status) ? req.query.status : undefined;
    const rows = (await ReversalRequest.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(200).lean()) as ReversalRequestDoc[];
    res.json({ items: await serializeReversals(rows) });
  }),
);

adminRouter.post(
  '/reversals',
  requireRole('FINANCE'),
  ah(async (req, res) => {
    const body = reversalBody.parse(req.body);
    const r = await requestReversal(currentAdmin(req), body, ctxOf(req));
    res.status(201).json((await serializeReversals([r]))[0]);
  }),
);

adminRouter.post(
  '/reversals/:id/approve',
  requireRole('FINANCE'),
  ah(async (req, res) => {
    const r = await approveReversal(currentAdmin(req), objectId.parse(req.params.id), ctxOf(req));
    res.json((await serializeReversals([r]))[0]);
  }),
);

adminRouter.post(
  '/reversals/:id/reject',
  requireRole('FINANCE'),
  ah(async (req, res) => {
    const r = await rejectReversal(currentAdmin(req), objectId.parse(req.params.id), ctxOf(req));
    res.json((await serializeReversals([r]))[0]);
  }),
);

// ---------- audit trail ----------
adminRouter.get(
  '/audit-logs',
  ah(async (req, res) => {
    const { page, pageSize, action, actorType, from, to } = auditQuery.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (action) filter.action = { $regex: `^${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
    if (actorType) filter.actorType = actorType;
    if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: new Date(to.getTime() + 86_400_000) } : {}) };
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ items: (items as AuditLogDoc[]).map(toAudit), page, pageSize, total });
  }),
);
