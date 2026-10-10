import { ClientSession, Types } from 'mongoose';
import { deliveryOtpSecret, env } from '../config/env';
import { chargesFor, DELIVERY_PRODUCTS, findProduct } from '../config/products';
import { hmacSha256, safeEqual, sha256 } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { withTransaction } from '../lib/tx';
import { Address, AdminDoc, Delivery, DeliveryDoc, DeliveryStatus, Payment, UserDoc } from '../models';
import { audit, RequestContext } from './audit.service';
import { getBalance, postInSession } from './ledger.service';
import { gateway } from './payment';

const ALLOWED: Record<DeliveryStatus, DeliveryStatus[]> = {
  REQUESTED: ['LOCKED', 'CANCELLED'],
  LOCKED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function assertTransition(from: DeliveryStatus, to: DeliveryStatus): void {
  if (!ALLOWED[from].includes(to)) {
    throw new AppError('INVALID_TRANSITION', `Cannot move a delivery from ${from} to ${to}`);
  }
}

export type Actor = { kind: 'user'; user: UserDoc } | { kind: 'admin'; admin: AdminDoc } | { kind: 'system' };

const actorLabel = (a: Actor) => (a.kind === 'user' ? 'user' : a.kind === 'admin' ? `admin:${a.admin.username}` : 'system');

const auditActor = (a: Actor) =>
  a.kind === 'user'
    ? { actorType: 'user' as const, actorId: a.user._id, actorLabel: a.user.email }
    : a.kind === 'admin'
      ? { actorType: 'admin' as const, actorId: a.admin._id, actorLabel: a.admin.username }
      : { actorType: 'system' as const };

// ---------- delivery OTP ----------
// The 6-digit code is derived from the delivery id with a server secret, so it can be shown to
// the user again without being stored. Only its hash is stored and compared at handover.
export function deliveryOtp(deliveryId: Types.ObjectId): string {
  const h = hmacSha256(deliveryOtpSecret(), `delivery-otp:${deliveryId.toHexString()}`);
  return (parseInt(h.slice(0, 12), 16) % 1_000_000).toString().padStart(6, '0');
}
const otpHash = (deliveryId: Types.ObjectId, otp: string) => sha256(`${deliveryId.toHexString()}:${otp}`);

export function listProducts() {
  return {
    minMg: env.DELIVERY_MIN_MG,
    currency: env.CURRENCY,
    products: DELIVERY_PRODUCTS.map((p) => ({ ...p, chargesMinor: chargesFor(p) })),
  };
}

export async function requestDelivery(user: UserDoc, input: { product: string; address: Address }, ctx: RequestContext) {
  const product = findProduct(input.product);
  if (!product) throw new AppError('VALIDATION_ERROR', `Unknown product ${input.product}`);

  const bal = await getBalance(user._id);
  if (bal.availableMg < env.DELIVERY_MIN_MG) {
    throw new AppError('DELIVERY_MIN_NOT_MET', `Home delivery needs at least ${env.DELIVERY_MIN_MG} mg of available gold`);
  }
  if (bal.availableMg < product.goldMg) throw new AppError('INSUFFICIENT_GOLD', 'Not enough gold for this product');

  const deliveryId = new Types.ObjectId();
  const paymentId = new Types.ObjectId();
  const chargesMinor = chargesFor(product);
  // Gateway first: if the lock below fails, the unused gateway order is simply never paid.
  const order = await gateway.createOrder({ amountMinor: chargesMinor, currency: env.CURRENCY, reference: `delivery:${deliveryId}` });
  const now = new Date();

  await withTransaction(async (session) => {
    await Delivery.create(
      [
        {
          _id: deliveryId,
          userId: user._id,
          goldMg: product.goldMg,
          product: product.code,
          productName: product.name,
          address: input.address,
          chargesMinor,
          currency: env.CURRENCY,
          chargesPaymentId: paymentId,
          chargesPaidAt: null,
          chargesDueBy: new Date(now.getTime() + env.DELIVERY_CHARGE_PAYMENT_TIMEOUT_MIN * 60_000),
          status: 'LOCKED',
          otpHash: null,
          trackingNo: null,
          history: [{ status: 'LOCKED', at: now, by: 'user' }],
        },
      ],
      { session },
    );
    await Payment.create(
      [
        {
          _id: paymentId,
          userId: user._id,
          purpose: 'DELIVERY_CHARGES',
          quoteId: null,
          deliveryId,
          gatewayOrderId: order.gatewayOrderId,
          checkoutUrl: order.checkoutUrl,
          amountMinor: chargesMinor,
          currency: env.CURRENCY,
          status: 'CREATED',
        },
      ],
      { session },
    );
    await postInSession(session, {
      userId: user._id,
      type: 'DELIVERY_LOCK',
      availableDeltaMg: -product.goldMg,
      lockedDeltaMg: product.goldMg,
      refType: 'delivery',
      refId: deliveryId,
      idempotencyKey: `delivery-lock:${deliveryId}`,
      createdBy: 'system',
    });
  });

  await audit({
    ...auditActor({ kind: 'user', user }),
    action: 'delivery.requested',
    targetType: 'delivery',
    targetId: deliveryId.toHexString(),
    details: { product: product.code, goldMg: product.goldMg },
    ctx,
  });
  const delivery = (await Delivery.findById(deliveryId).lean()) as DeliveryDoc;
  return { delivery, paymentId, checkoutUrl: order.checkoutUrl };
}

/** Cancels and releases the locked gold, inside the caller's transaction. */
export async function cancelInSession(
  session: ClientSession,
  delivery: DeliveryDoc,
  actor: Actor,
  reason: string,
  opts: { requireUnpaid?: boolean } = {},
): Promise<DeliveryDoc> {
  assertTransition(delivery.status, 'CANCELLED');
  const now = new Date();
  const filter: Record<string, unknown> = { _id: delivery._id, status: delivery.status };
  if (opts.requireUnpaid) filter.chargesPaidAt = null;
  const updated = await Delivery.findOneAndUpdate(
    filter,
    { $set: { status: 'CANCELLED' }, $push: { history: { status: 'CANCELLED', at: now, by: actorLabel(actor) } } },
    { new: true, session, lean: true },
  );
  if (!updated) throw new AppError('INVALID_TRANSITION', 'Delivery changed while cancelling; try again');

  await postInSession(session, {
    userId: delivery.userId,
    type: 'DELIVERY_RELEASE',
    availableDeltaMg: delivery.goldMg,
    lockedDeltaMg: -delivery.goldMg,
    refType: 'delivery',
    refId: delivery._id,
    idempotencyKey: `delivery-release:${delivery._id}`,
    createdBy: actor.kind === 'admin' ? actor.admin._id : 'system',
  });

  if (delivery.chargesPaidAt && delivery.chargesPaymentId) {
    await Payment.updateOne(
      { _id: delivery.chargesPaymentId },
      { $set: { needsManualRefund: true, flagReason: 'Delivery cancelled after charges were paid' } },
      { session },
    );
  }
  await audit(
    {
      ...auditActor(actor),
      action: 'delivery.status_changed',
      targetType: 'delivery',
      targetId: delivery._id.toHexString(),
      details: { from: delivery.status, to: 'CANCELLED', reason },
    },
    session,
  );
  return updated as DeliveryDoc;
}

export async function cancelDelivery(deliveryId: Types.ObjectId, actor: Actor, reason: string): Promise<DeliveryDoc> {
  return withTransaction(async (session) => {
    const filter: Record<string, unknown> = { _id: deliveryId };
    if (actor.kind === 'user') filter.userId = actor.user._id;
    const d = await Delivery.findOne(filter, null, { session }).lean();
    if (!d) throw new AppError('NOT_FOUND', 'Delivery not found');
    return cancelInSession(session, d as DeliveryDoc, actor, reason);
  });
}

/** Called by the webhook handler (inside its transaction) when the charges payment succeeds. */
export async function markChargesPaidInSession(session: ClientSession, delivery: DeliveryDoc): Promise<void> {
  const otp = deliveryOtp(delivery._id);
  await Delivery.updateOne(
    { _id: delivery._id, chargesPaidAt: null },
    { $set: { chargesPaidAt: new Date(), otpHash: otpHash(delivery._id, otp) } },
    { session },
  );
}

export async function adminSetStatus(
  admin: AdminDoc,
  deliveryId: Types.ObjectId,
  to: 'PACKED' | 'SHIPPED' | 'CANCELLED',
  trackingNo: string | undefined,
  ctx: RequestContext,
): Promise<DeliveryDoc> {
  if (to === 'CANCELLED') return cancelDelivery(deliveryId, { kind: 'admin', admin }, 'Cancelled by admin');

  const d = await Delivery.findById(deliveryId).lean();
  if (!d) throw new AppError('NOT_FOUND', 'Delivery not found');
  assertTransition(d.status, to);
  if (to === 'PACKED' && !d.chargesPaidAt) throw new AppError('CHARGES_UNPAID', 'Delivery charges have not been paid');
  if (to === 'SHIPPED' && !trackingNo) throw new AppError('VALIDATION_ERROR', 'trackingNo is required to ship');

  const set: Record<string, unknown> = { status: to };
  if (to === 'SHIPPED') set.trackingNo = trackingNo;
  const updated = await Delivery.findOneAndUpdate(
    { _id: deliveryId, status: d.status },
    { $set: set, $push: { history: { status: to, at: new Date(), by: `admin:${admin.username}` } } },
    { new: true, lean: true },
  );
  if (!updated) throw new AppError('INVALID_TRANSITION', 'Delivery changed meanwhile; reload and try again');
  await audit({
    actorType: 'admin',
    actorId: admin._id,
    actorLabel: admin.username,
    action: 'delivery.status_changed',
    targetType: 'delivery',
    targetId: deliveryId.toHexString(),
    details: { from: d.status, to, trackingNo: trackingNo ?? null },
    ctx,
  });
  return updated as DeliveryDoc;
}

export async function completeDelivery(admin: AdminDoc, deliveryId: Types.ObjectId, otp: string, ctx: RequestContext) {
  const d = await Delivery.findById(deliveryId).lean();
  if (!d) throw new AppError('NOT_FOUND', 'Delivery not found');
  assertTransition(d.status, 'DELIVERED');
  if (!d.otpHash || !safeEqual(otpHash(d._id, otp), d.otpHash)) {
    await audit({
      actorType: 'admin',
      actorId: admin._id,
      actorLabel: admin.username,
      action: 'delivery.otp_failed',
      targetType: 'delivery',
      targetId: deliveryId.toHexString(),
      ctx,
    });
    throw new AppError('INVALID_OTP', 'The delivery code is not correct');
  }

  return withTransaction(async (session) => {
    const updated = await Delivery.findOneAndUpdate(
      { _id: deliveryId, status: 'SHIPPED' },
      { $set: { status: 'DELIVERED' }, $push: { history: { status: 'DELIVERED', at: new Date(), by: `admin:${admin.username}` } } },
      { new: true, session, lean: true },
    );
    if (!updated) throw new AppError('INVALID_TRANSITION', 'Delivery is no longer SHIPPED');
    await postInSession(session, {
      userId: d.userId,
      type: 'DELIVERY_COMPLETE',
      availableDeltaMg: 0,
      lockedDeltaMg: -d.goldMg,
      refType: 'delivery',
      refId: d._id,
      idempotencyKey: `delivery-complete:${d._id}`,
      createdBy: admin._id,
    });
    await audit(
      {
        actorType: 'admin',
        actorId: admin._id,
        actorLabel: admin.username,
        action: 'delivery.status_changed',
        targetType: 'delivery',
        targetId: deliveryId.toHexString(),
        details: { from: 'SHIPPED', to: 'DELIVERED' },
        ctx,
      },
      session,
    );
    return updated as DeliveryDoc;
  });
}

/** Job: release gold for deliveries whose charges were not paid in time. */
export async function releaseExpiredDeliveries(now = new Date()): Promise<number> {
  const stale = await Delivery.find({ status: 'LOCKED', chargesPaidAt: null, chargesDueBy: { $lte: now } }).lean();
  let released = 0;
  for (const d of stale) {
    try {
      await withTransaction(async (session) => {
        const fresh = await Delivery.findById(d._id, null, { session }).lean();
        if (!fresh || fresh.status !== 'LOCKED' || fresh.chargesPaidAt) return;
        await cancelInSession(session, fresh as DeliveryDoc, { kind: 'system' }, 'Charges not paid in time', { requireUnpaid: true });
        released++;
      });
    } catch (err) {
      console.error(`[jobs] could not release delivery ${d._id}:`, err);
    }
  }
  return released;
}
