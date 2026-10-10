import { Router } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../lib/errors';
import { mulDivFloor } from '../lib/money';
import { toDelivery, toEntry, toMe, toPayment, toQuote } from '../lib/serialize';
import { bankAccountBody, deliveryBody, kycBody, objectId, pageQuery, quoteBody, quoteIdBody, seqParam } from '../lib/validation';
import { Delivery, DeliveryDoc, Payment, PaymentDoc, Quote } from '../models';
import { ah, ctxOf } from '../middleware/async';
import { currentUser, requireUser } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { tradeLimiter } from '../middleware/rate-limit';
import { cancelDelivery, listProducts, requestDelivery } from '../services/delivery.service';
import { findEntryBySeq, getBalance, listEntries } from '../services/ledger.service';
import { createBuyOrder, findPaymentForUser, sell } from '../services/order.service';
import { createQuote } from '../services/quote.service';
import { renderReceipt } from '../services/receipt.service';
import { saveBankAccount, submitKyc } from '../services/user.service';
import { currentPrice } from './public.routes';

export const userRouter = Router();
userRouter.use(requireUser);
userRouter.use(idempotency((req) => `user:${currentUser(req)._id.toHexString()}`));

// ---------- profile ----------
userRouter.get('/me', (req, res) => {
  res.json(toMe(currentUser(req)));
});

userRouter.post(
  '/me/kyc',
  ah(async (req, res) => {
    const body = kycBody.parse(req.body);
    res.json(toMe(await submitKyc(currentUser(req)._id, body, ctxOf(req))));
  }),
);

userRouter.post(
  '/me/bank-account',
  ah(async (req, res) => {
    const body = bankAccountBody.parse(req.body);
    res.json(toMe(await saveBankAccount(currentUser(req)._id, body, ctxOf(req))));
  }),
);

// ---------- wallet & trading ----------
userRouter.get(
  '/wallet',
  ah(async (req, res) => {
    const bal = await getBalance(currentUser(req)._id);
    const price = currentPrice();
    res.json({
      availableMg: bal.availableMg,
      lockedMg: bal.lockedMg,
      currency: price.currency,
      sellPerGramMinor: price.sellPerGramMinor,
      availableValueMinor: mulDivFloor(bal.availableMg, price.sellPerGramMinor, 1000),
      totalValueMinor: mulDivFloor(bal.availableMg + bal.lockedMg, price.sellPerGramMinor, 1000),
    });
  }),
);

userRouter.post(
  '/quotes',
  tradeLimiter,
  ah(async (req, res) => {
    const body = quoteBody.parse(req.body);
    res.status(201).json(toQuote(await createQuote(currentUser(req), body)));
  }),
);

userRouter.post(
  '/orders/buy',
  tradeLimiter,
  ah(async (req, res) => {
    const { quoteId } = quoteIdBody.parse(req.body);
    const r = await createBuyOrder(currentUser(req), quoteId);
    res.status(201).json({ paymentId: r.paymentId.toHexString(), gatewayOrderId: r.gatewayOrderId, checkoutUrl: r.checkoutUrl });
  }),
);

userRouter.get(
  '/payments/:id',
  ah(async (req, res) => {
    const p = await findPaymentForUser(currentUser(req), String(req.params.id));
    const goldMg = p.quoteId ? ((await Quote.findById(p.quoteId).lean())?.goldMg ?? null) : null;
    res.json(toPayment(p, goldMg));
  }),
);

userRouter.post(
  '/orders/sell',
  tradeLimiter,
  ah(async (req, res) => {
    const { quoteId } = quoteIdBody.parse(req.body);
    res.status(201).json(await sell(currentUser(req), quoteId, ctxOf(req)));
  }),
);

// ---------- delivery ----------
userRouter.get('/delivery/products', (_req, res) => {
  res.json(listProducts());
});

async function paymentsFor(deliveries: DeliveryDoc[]): Promise<Map<string, PaymentDoc>> {
  const ids = deliveries.map((d) => d.chargesPaymentId).filter((x): x is Types.ObjectId => !!x);
  const rows = (await Payment.find({ _id: { $in: ids } }).lean()) as PaymentDoc[];
  return new Map(rows.map((p) => [p._id.toHexString(), p]));
}

userRouter.post(
  '/deliveries',
  tradeLimiter,
  ah(async (req, res) => {
    const body = deliveryBody.parse(req.body);
    const r = await requestDelivery(currentUser(req), body, ctxOf(req));
    const payment = (await Payment.findById(r.paymentId).lean()) as PaymentDoc | null;
    res.status(201).json({ delivery: toDelivery(r.delivery, payment, { includeOtp: true }), paymentId: r.paymentId.toHexString(), checkoutUrl: r.checkoutUrl });
  }),
);

userRouter.get(
  '/deliveries',
  ah(async (req, res) => {
    const rows = (await Delivery.find({ userId: currentUser(req)._id }).sort({ createdAt: -1 }).limit(100).lean()) as DeliveryDoc[];
    const pays = await paymentsFor(rows);
    res.json({ items: rows.map((d) => toDelivery(d, pays.get(String(d.chargesPaymentId)) ?? null, { includeOtp: true })) });
  }),
);

userRouter.get(
  '/deliveries/:id',
  ah(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const d = (await Delivery.findOne({ _id: id, userId: currentUser(req)._id }).lean()) as DeliveryDoc | null;
    if (!d) throw new AppError('NOT_FOUND', 'Delivery not found');
    const pays = await paymentsFor([d]);
    res.json(toDelivery(d, pays.get(String(d.chargesPaymentId)) ?? null, { includeOtp: true }));
  }),
);

userRouter.post(
  '/deliveries/:id/cancel',
  ah(async (req, res) => {
    const id = objectId.parse(req.params.id);
    const d = await cancelDelivery(id, { kind: 'user', user: currentUser(req) }, 'Cancelled by user');
    const pays = await paymentsFor([d]);
    res.json(toDelivery(d, pays.get(String(d.chargesPaymentId)) ?? null, { includeOtp: true }));
  }),
);

// ---------- history & receipts ----------
userRouter.get(
  '/transactions',
  ah(async (req, res) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    const r = await listEntries({ userId: currentUser(req)._id }, page, pageSize);
    res.json({ items: r.items.map(toEntry), page, pageSize, total: r.total });
  }),
);

userRouter.get(
  '/transactions/:seq/receipt',
  ah(async (req, res) => {
    const user = currentUser(req);
    const seq = seqParam.parse(req.params.seq);
    const entry = await findEntryBySeq(seq);
    if (!entry || !entry.userId.equals(user._id)) throw new AppError('NOT_FOUND', 'Transaction not found');
    const html = await renderReceipt(entry, user);
    if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="receipt-${seq}.html"`);
    res.type('html').send(html);
  }),
);
