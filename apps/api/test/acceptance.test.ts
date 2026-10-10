// Acceptance tests from the build spec, run in order against a real MongoDB replica set
// with authentication (the API connects as the restricted app user).
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { connectDb, disconnectDb } from '../src/config/db';
import { Delivery, Payment, Quote, User } from '../src/models';
import { runSeed } from '../src/scripts/seed';
import { runDailyAnchor } from '../src/services/anchor.service';
import { releaseExpiredDeliveries } from '../src/services/delivery.service';
import { verifyProof } from '../src/lib/merkle';
import { runIntegrityCheck } from '../src/services/integrity.service';
import { app, as, buyGold, idem, loginAdmin, loginUser, postWebhook, rootClient, signedWebhook, wallet } from './helpers';

const BUY_PRICE = Math.ceil((30000 * 10150) / 10000); // 30450 minor units per gram

let root: MongoClient;
const ledger = () => root.db(process.env.TEST_DB_NAME).collection('ledger_entries');

beforeAll(async () => {
  await connectDb(process.env.MONGO_URI);
  await runSeed(() => undefined);
  root = await rootClient();
});

afterAll(async () => {
  await root?.close();
  await disconnectDb();
});

describe('seed', () => {
  test('creates the three users through real BUY postings', async () => {
    for (const [email, mg] of [
      ['zero@example.com', 0],
      ['five@example.com', 5000],
      ['twentyfive@example.com', 25000],
    ] as const) {
      const user = await User.findOne({ email }).lean();
      const entries = await ledger().find({ userId: user!._id }).toArray();
      expect(entries.every((e) => e.type === 'BUY' && e.idempotencyKey.startsWith('buy:'))).toBe(true);
      expect(entries.reduce((s, e) => s + e.availableDeltaMg, 0)).toBe(mg);
    }
  });
});

describe('buy', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginUser('buyer@test.com');
  });

  test('buy by amount credits exactly floor(amount × 1000 / price) mg after a valid webhook, and nothing before it', async () => {
    const api = as(token);
    const amountMinor = 12345;
    const q = await api.post('/api/v1/quotes', { side: 'BUY', amountMinor });
    expect(q.status).toBe(201);
    expect(q.body.pricePerGramMinor).toBe(BUY_PRICE);
    const expectedMg = Math.floor((amountMinor * 1000) / BUY_PRICE);
    expect(q.body.goldMg).toBe(expectedMg);
    expect(q.body.totalMinor).toBe(amountMinor);

    const o = await api.post('/api/v1/orders/buy', { quoteId: q.body.id });
    expect(o.status).toBe(201);
    expect(o.body.checkoutUrl).toContain('/mock-gateway/checkout/');

    // Before the webhook: nothing credited, even if the client "returns" from checkout.
    expect((await wallet(token)).availableMg).toBe(0);
    const pending = await api.get(`/api/v1/payments/${o.body.gatewayOrderId}`);
    expect(pending.body.status).toBe('CREATED');

    const hook = signedWebhook({ type: 'payment.paid', gatewayOrderId: o.body.gatewayOrderId, amountMinor: q.body.totalMinor, currency: 'AED' });
    const w = await postWebhook(hook.rawBody, hook.signature);
    expect(w.status).toBe(200);
    expect((await wallet(token)).availableMg).toBe(expectedMg);
    const paid = await api.get(`/api/v1/payments/${o.body.paymentId}`);
    expect(paid.body).toMatchObject({ status: 'PAID', goldMg: expectedMg });
  });

  test('a webhook with a bad signature returns 401 and changes nothing', async () => {
    const api = as(token);
    const before = await wallet(token);
    const q = await api.post('/api/v1/quotes', { side: 'BUY', goldMg: 1000 });
    const o = await api.post('/api/v1/orders/buy', { quoteId: q.body.id });
    const hook = signedWebhook({ type: 'payment.paid', gatewayOrderId: o.body.gatewayOrderId, amountMinor: q.body.totalMinor, currency: 'AED' });

    const bad = await postWebhook(hook.rawBody, 'a'.repeat(64));
    expect(bad.status).toBe(401);
    const tampered = await postWebhook(hook.rawBody.replace(String(q.body.totalMinor), '1'), hook.signature);
    expect(tampered.status).toBe(401);

    expect(await wallet(token)).toEqual(expect.objectContaining({ availableMg: before.availableMg }));
    const p = await Payment.findOne({ gatewayOrderId: o.body.gatewayOrderId }).lean();
    expect(p!.status).toBe('CREATED');
    expect(p!.webhookEventIds).toHaveLength(0);
  });

  test('the same webhook sent twice credits once (sequential and concurrent)', async () => {
    const api = as(token);
    for (const mode of ['sequential', 'concurrent'] as const) {
      const before = (await wallet(token)).availableMg;
      const q = await api.post('/api/v1/quotes', { side: 'BUY', goldMg: 777 });
      const o = await api.post('/api/v1/orders/buy', { quoteId: q.body.id });
      const hook = signedWebhook({ type: 'payment.paid', gatewayOrderId: o.body.gatewayOrderId, amountMinor: q.body.totalMinor, currency: 'AED' });
      const results =
        mode === 'sequential'
          ? [await postWebhook(hook.rawBody, hook.signature), await postWebhook(hook.rawBody, hook.signature)]
          : await Promise.all([postWebhook(hook.rawBody, hook.signature), postWebhook(hook.rawBody, hook.signature)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results.map((r) => r.body.outcome).sort()).toEqual(['credited', 'duplicate']);
      expect((await wallet(token)).availableMg).toBe(before + 777);
      expect(await ledger().countDocuments({ idempotencyKey: `buy:${o.body.paymentId}` })).toBe(1);
    }
  });

  test('a webhook whose amount differs from the quote credits nothing and flags the payment', async () => {
    const api = as(token);
    const before = (await wallet(token)).availableMg;
    const q = await api.post('/api/v1/quotes', { side: 'BUY', goldMg: 2000 });
    const o = await api.post('/api/v1/orders/buy', { quoteId: q.body.id });
    const hook = signedWebhook({ type: 'payment.paid', gatewayOrderId: o.body.gatewayOrderId, amountMinor: q.body.totalMinor - 1, currency: 'AED' });
    const w = await postWebhook(hook.rawBody, hook.signature);
    expect(w.status).toBe(200);
    expect(w.body.outcome).toBe('flagged');
    expect((await wallet(token)).availableMg).toBe(before);
    const p = await Payment.findOne({ gatewayOrderId: o.body.gatewayOrderId }).lean();
    expect(p).toMatchObject({ status: 'FAILED', needsManualRefund: true });
    expect(await ledger().countDocuments({ refId: new ObjectId(o.body.paymentId) })).toBe(0);

    // A wrong currency is a mismatch too.
    const q2 = await api.post('/api/v1/quotes', { side: 'BUY', goldMg: 2000 });
    const o2 = await api.post('/api/v1/orders/buy', { quoteId: q2.body.id });
    const hook2 = signedWebhook({ type: 'payment.paid', gatewayOrderId: o2.body.gatewayOrderId, amountMinor: q2.body.totalMinor, currency: 'USD' });
    expect((await postWebhook(hook2.rawBody, hook2.signature)).body.outcome).toBe('flagged');
    expect((await wallet(token)).availableMg).toBe(before);
  });

  test('a payment confirmed after the quote expired is still credited at the quoted price', async () => {
    const api = as(token);
    const before = (await wallet(token)).availableMg;
    const q = await api.post('/api/v1/quotes', { side: 'BUY', goldMg: 500 });
    const o = await api.post('/api/v1/orders/buy', { quoteId: q.body.id });
    await Quote.updateOne({ _id: q.body.id }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });
    const hook = signedWebhook({ type: 'payment.paid', gatewayOrderId: o.body.gatewayOrderId, amountMinor: q.body.totalMinor, currency: 'AED' });
    expect((await postWebhook(hook.rawBody, hook.signature)).body.outcome).toBe('credited');
    expect((await wallet(token)).availableMg).toBe(before + 500);
  });
});

describe('quotes and validation', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginUser('quotes@test.com');
  });

  test('using an expired or already-used quote returns QUOTE_INVALID', async () => {
    const api = as(token);
    const q = await api.post('/api/v1/quotes', { side: 'BUY', goldMg: 100 });
    expect((await api.post('/api/v1/orders/buy', { quoteId: q.body.id })).status).toBe(201);
    const reused = await api.post('/api/v1/orders/buy', { quoteId: q.body.id });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe('QUOTE_INVALID');

    const q2 = await api.post('/api/v1/quotes', { side: 'BUY', goldMg: 100 });
    await Quote.updateOne({ _id: q2.body.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await api.post('/api/v1/orders/buy', { quoteId: q2.body.id });
    expect(expired.status).toBe(409);
    expect(expired.body.error.code).toBe('QUOTE_INVALID');
  });

  test('a request with a decimal gram value is rejected with 400', async () => {
    const api = as(token);
    for (const body of [
      { side: 'BUY', goldMg: 1.5 },
      { side: 'SELL', goldMg: 0.25 },
      { side: 'BUY', amountMinor: 100.5 },
      { side: 'BUY', goldMg: '1000' },
    ]) {
      const r = await api.post('/api/v1/quotes', body);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  test('state-changing POSTs need an Idempotency-Key, and a repeated key returns the first response', async () => {
    const api = as(token);
    const key = idem();
    const a = await api.post('/api/v1/quotes', { side: 'BUY', goldMg: 100 }, key);
    const b = await api.post('/api/v1/quotes', { side: 'BUY', goldMg: 100 }, key);
    expect(b.status).toBe(a.status);
    expect(b.body.id).toBe(a.body.id);
    expect(await Quote.countDocuments({ _id: a.body.id })).toBe(1);

    const missing = await request(app).post('/api/v1/quotes').set('Authorization', `Bearer ${token}`).send({ side: 'BUY', goldMg: 100 });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

describe('sell-back', () => {
  test('two parallel sells that together exceed the balance: one succeeds, one fails with INSUFFICIENT_GOLD', async () => {
    const token = await loginUser('five@example.com');
    const api = as(token);
    expect((await wallet(token)).availableMg).toBe(5000);
    const q1 = await api.post('/api/v1/quotes', { side: 'SELL', goldMg: 3000 });
    const q2 = await api.post('/api/v1/quotes', { side: 'SELL', goldMg: 3000 });
    expect([q1.status, q2.status]).toEqual([201, 201]);

    const results = await Promise.all([
      api.post('/api/v1/orders/sell', { quoteId: q1.body.id }),
      api.post('/api/v1/orders/sell', { quoteId: q2.body.id }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const failed = results.find((r) => r.status === 409)!;
    expect(failed.body.error.code).toBe('INSUFFICIENT_GOLD');
    const ok = results.find((r) => r.status === 201)!;
    expect(ok.body.payout.status).toBe('PAID');

    const w = await wallet(token);
    expect(w.availableMg).toBe(2000);
    const user = await User.findOne({ email: 'five@example.com' }).lean();
    const entries = await ledger().find({ userId: user!._id }).sort({ seq: 1 }).toArray();
    expect(entries.every((e) => e.balanceAfter.availableMg >= 0)).toBe(true);
  });

  test('a failed payout restores the sold gold automatically', async () => {
    // twentyfive@example.com has a mock IBAN ending in 0000, which the mock bank rejects.
    const token = await loginUser('twentyfive@example.com');
    const api = as(token);
    const before = await wallet(token);
    const q = await api.post('/api/v1/quotes', { side: 'SELL', goldMg: 1500 });
    const r = await api.post('/api/v1/orders/sell', { quoteId: q.body.id });
    expect(r.status).toBe(201);
    expect(r.body.payout.status).toBe('FAILED');
    expect(r.body.goldRestored).toBe(true);
    expect((await wallet(token)).availableMg).toBe(before.availableMg);

    const reversal = await ledger().findOne({ idempotencyKey: `payout-fail:${r.body.payout.id}` });
    expect(reversal).toMatchObject({ type: 'REVERSAL', availableDeltaMg: 1500, createdBy: 'system' });
    expect(await ledger().findOne({ seq: r.body.entrySeq })).toMatchObject({ type: 'SELL', availableDeltaMg: -1500 });
  });

  test('selling requires verified KYC', async () => {
    const token = await loginUser('nokyc@test.com');
    await buyGold(token, 1000);
    const q = await as(token).post('/api/v1/quotes', { side: 'SELL', goldMg: 500 });
    const r = await as(token).post('/api/v1/orders/sell', { quoteId: q.body.id });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('KYC_REQUIRED');
  });
});

describe('home delivery', () => {
  let token: string;
  let ops: string;
  beforeAll(async () => {
    token = await loginUser('deliver@test.com');
    ops = await loginAdmin('ops1');
  });

  test('delivery is refused under 10 000 mg available; at or above it, availableMg falls and lockedMg rises by the product weight', async () => {
    const api = as(token);
    await buyGold(token, 9996);
    const address = { fullName: 'Test User', phone: '+971500000000', line1: '1 Gold St', city: 'Dubai', country: 'AE' };
    const refused = await api.post('/api/v1/deliveries', { product: 'COIN_10G', address });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('DELIVERY_MIN_NOT_MET');
    expect(await wallet(token)).toMatchObject({ availableMg: 9996, lockedMg: 0 });

    await buyGold(token, 4); // smallest top-up above MIN_BUY_MINOR, bringing the balance to exactly 10 000 mg
    const ok = await api.post('/api/v1/deliveries', { product: 'COIN_10G', address });
    expect(ok.status).toBe(201);
    expect(ok.body.delivery.status).toBe('LOCKED');
    expect(await wallet(token)).toMatchObject({ availableMg: 0, lockedMg: 10000 });
  });

  test('unpaid delivery charges after the timeout release the locked gold', async () => {
    const [d] = (await as(token).get('/api/v1/deliveries')).body.items;
    expect(d.status).toBe('LOCKED');

    expect(await releaseExpiredDeliveries(new Date())).toBe(0); // not yet due
    const released = await releaseExpiredDeliveries(new Date(Date.now() + 31 * 60_000));
    expect(released).toBe(1);
    expect(await wallet(token)).toMatchObject({ availableMg: 10000, lockedMg: 0 });
    const after = (await as(token).get(`/api/v1/deliveries/${d.id}`)).body;
    expect(after.status).toBe('CANCELLED');
    expect(await ledger().countDocuments({ idempotencyKey: `delivery-release:${d.id}` })).toBe(1);

    // Charges paid after the cancellation are flagged for refund and never re-lock gold.
    const pay = await Payment.findById(d.chargesPaymentId).lean();
    const hook = signedWebhook({ type: 'payment.paid', gatewayOrderId: pay!.gatewayOrderId, amountMinor: pay!.amountMinor, currency: 'AED' });
    expect((await postWebhook(hook.rawBody, hook.signature)).body.outcome).toBe('flagged');
    expect((await Payment.findById(d.chargesPaymentId).lean())!.status).toBe('LATE_PAID_REFUND');
    expect(await wallet(token)).toMatchObject({ availableMg: 10000, lockedMg: 0 });
  });

  test('delivery completes only with the correct OTP and then reduces lockedMg', async () => {
    const api = as(token);
    const address = { fullName: 'Test User', phone: '+971500000000', line1: '1 Gold St', city: 'Dubai', country: 'AE' };
    const created = await api.post('/api/v1/deliveries', { product: 'COIN_10G', address });
    expect(created.status).toBe(201);
    const id = created.body.delivery.id;
    expect(created.body.delivery.otp).toBeNull();

    const admin = as(ops);
    const early = await admin.post(`/api/v1/admin/deliveries/${id}/status`, { status: 'PACKED' });
    expect(early.body.error.code).toBe('CHARGES_UNPAID');

    const pay = await Payment.findById(created.body.paymentId).lean();
    const hook = signedWebhook({ type: 'payment.paid', gatewayOrderId: pay!.gatewayOrderId, amountMinor: pay!.amountMinor, currency: 'AED' });
    expect((await postWebhook(hook.rawBody, hook.signature)).body.outcome).toBe('charges_paid');
    const tracked = (await api.get(`/api/v1/deliveries/${id}`)).body;
    expect(tracked.otp).toMatch(/^\d{6}$/);
    expect(await wallet(token)).toMatchObject({ availableMg: 0, lockedMg: 10000 }); // charges never touch the gold ledger

    // Invalid transition: cannot complete before shipping.
    expect((await admin.post(`/api/v1/admin/deliveries/${id}/complete`, { otp: tracked.otp })).body.error.code).toBe('INVALID_TRANSITION');
    expect((await admin.post(`/api/v1/admin/deliveries/${id}/status`, { status: 'PACKED' })).status).toBe(200);
    expect((await admin.post(`/api/v1/admin/deliveries/${id}/status`, { status: 'SHIPPED', trackingNo: 'TRK-123456' })).status).toBe(200);
    expect((await api.post(`/api/v1/deliveries/${id}/cancel`)).body.error.code).toBe('INVALID_TRANSITION');

    const wrong = tracked.otp === '000000' ? '111111' : '000000';
    const bad = await admin.post(`/api/v1/admin/deliveries/${id}/complete`, { otp: wrong });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_OTP');
    expect(await wallet(token)).toMatchObject({ lockedMg: 10000 });

    const good = await admin.post(`/api/v1/admin/deliveries/${id}/complete`, { otp: tracked.otp });
    expect(good.status).toBe(200);
    expect(good.body.status).toBe('DELIVERED');
    expect(good.body).not.toHaveProperty('otp');
    expect(await wallet(token)).toMatchObject({ availableMg: 0, lockedMg: 0 });
    const d = await Delivery.findById(id).lean();
    expect(d!.history.map((h) => h.status)).toEqual(['LOCKED', 'PACKED', 'SHIPPED', 'DELIVERED']);
  });
});

describe('admin reversals', () => {
  test('a reversal approved by its own requester is rejected; approved by a second admin, it posts', async () => {
    const [f1, f2, ops] = await Promise.all([loginAdmin('finance1'), loginAdmin('finance2'), loginAdmin('ops1')]);
    const user = await User.findOne({ email: 'buyer@test.com' }).lean();
    const target = await ledger().findOne({ userId: user!._id, type: 'BUY' });
    const token = await loginUser('buyer@test.com');
    const before = (await wallet(token)).availableMg;

    const req = await as(f1).post('/api/v1/admin/reversals', { targetSeq: target!.seq, availableDeltaMg: -5, lockedDeltaMg: 0, reason: 'Duplicate credit correction' });
    expect(req.status).toBe(201);
    expect(req.body.status).toBe('PENDING');

    const self = await as(f1).post(`/api/v1/admin/reversals/${req.body.id}/approve`);
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
    expect((await as(ops).post(`/api/v1/admin/reversals/${req.body.id}/approve`)).body.error.code).toBe('FORBIDDEN');
    expect((await wallet(token)).availableMg).toBe(before);

    const ok = await as(f2).post(`/api/v1/admin/reversals/${req.body.id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'APPROVED', approvedBy: { username: 'finance2' } });
    expect((await wallet(token)).availableMg).toBe(before - 5);
    const posted = await ledger().findOne({ seq: ok.body.postedSeq });
    expect(posted).toMatchObject({ type: 'REVERSAL', idempotencyKey: `reversal:${req.body.id}`, availableDeltaMg: -5 });

    // Approving again is a no-op error, not a second posting.
    expect((await as(f2).post(`/api/v1/admin/reversals/${req.body.id}/approve`)).body.error.code).toBe('INVALID_TRANSITION');
    expect(await ledger().countDocuments({ idempotencyKey: `reversal:${req.body.id}` })).toBe(1);
  });
});

describe('database lock-down and integrity', () => {
  test("using the app's database user, updateOne or deleteOne on ledger_entries fails with an authorization error", async () => {
    const appClient = await MongoClient.connect(process.env.MONGO_URI!);
    try {
      const col = appClient.db().collection('ledger_entries');
      expect(await col.findOne({ seq: 1 })).not.toBeNull(); // reads are allowed
      await expect(col.updateOne({ seq: 1 }, { $set: { availableDeltaMg: 999999 } })).rejects.toMatchObject({ code: 13 });
      await expect(col.deleteOne({ seq: 1 })).rejects.toMatchObject({ code: 13 });
      await expect(col.drop()).rejects.toMatchObject({ code: 13 });
      await expect(appClient.db().collection('audit_logs').deleteMany({})).rejects.toMatchObject({ code: 13 });
    } finally {
      await appClient.close();
    }
  });

  test('the database rejects a negative or fractional balance even if code tried to write one', async () => {
    const accounts = root.db(process.env.TEST_DB_NAME).collection('accounts');
    const user = await User.findOne({ email: 'zero@example.com' }).lean();
    await expect(accounts.updateOne({ userId: user!._id }, { $inc: { availableMg: -1 } })).rejects.toMatchObject({ code: 121 });
    await expect(accounts.updateOne({ userId: user!._id }, { $set: { availableMg: 0.5 } })).rejects.toMatchObject({ code: 121 });
  });

  test('manually editing a ledger entry with a root DB user makes the integrity check fail and name the broken seq', async () => {
    expect((await runIntegrityCheck('test')).ok).toBe(true);
    const victim = await ledger().findOne({ type: 'BUY' }, { sort: { seq: -1 } });
    await ledger().updateOne({ _id: victim!._id }, { $inc: { availableDeltaMg: 1000 } });
    try {
      const r = await runIntegrityCheck('test');
      expect(r.ok).toBe(false);
      expect(r.failures).toEqual(expect.arrayContaining([expect.objectContaining({ check: 'HASH', seq: victim!.seq })]));
      expect(r.failures.filter((f) => f.check === 'HASH').map((f) => f.seq)).toEqual([victim!.seq]);
    } finally {
      await ledger().updateOne({ _id: victim!._id }, { $inc: { availableDeltaMg: -1000 } });
    }
    expect((await runIntegrityCheck('test')).ok).toBe(true);
  });

  test('the daily anchor stores a Merkle root and /verify returns a proof that checks out', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const anchor = await runDailyAnchor(today);
    expect(anchor).toMatchObject({ date: today, status: 'LOCAL_ONLY', firstSeq: 1 });
    for (const seq of [anchor!.firstSeq, Math.ceil(anchor!.lastSeq / 2), anchor!.lastSeq]) {
      const r = await request(app).get(`/api/v1/verify/${seq}`);
      expect(r.status).toBe(200);
      expect(r.body.anchor.merkleRoot).toBe(anchor!.merkleRoot);
      expect(verifyProof(r.body.hash, r.body.proof, anchor!.merkleRoot)).toBe(true);
    }
  });

  test('after the seed and all tests, the sum of ledger deltas per user equals accounts for every user', async () => {
    const db = root.db(process.env.TEST_DB_NAME);
    const sums = await db
      .collection('ledger_entries')
      .aggregate<{ _id: ObjectId; a: number; l: number }>([{ $group: { _id: '$userId', a: { $sum: '$availableDeltaMg' }, l: { $sum: '$lockedDeltaMg' } } }])
      .toArray();
    const accounts = await db.collection('accounts').find().toArray();
    expect(accounts.length).toBeGreaterThanOrEqual(sums.length);
    for (const acc of accounts) {
      const s = sums.find((x) => x._id.equals(acc.userId)) ?? { a: 0, l: 0 };
      expect({ user: String(acc.userId), availableMg: acc.availableMg, lockedMg: acc.lockedMg }).toEqual({
        user: String(acc.userId),
        availableMg: s.a,
        lockedMg: s.l,
      });
    }
    const r = await runIntegrityCheck('test');
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
