import { randomUUID } from 'crypto';
import { MongoClient } from 'mongodb';
import { authenticator } from 'otplib';
import request from 'supertest';
import { createApp } from '../src/app';
import { SEED_ADMIN_PASSWORD, SEED_ADMINS } from '../src/scripts/seed-data';
import { mockGateway, SIGNATURE_HEADER, WebhookEvent } from '../src/services/payment';

export const app = createApp();
export const idem = () => randomUUID();

export function as(token: string) {
  return {
    get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: object = {}, key: string = idem()) =>
      request(app).post(path).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body),
  };
}

export async function loginUser(email: string): Promise<string> {
  const r1 = await request(app).post('/api/v1/auth/otp/request').send({ email });
  expect(r1.status).toBe(200);
  const r2 = await request(app).post('/api/v1/auth/otp/verify').send({ email, otp: r1.body.devOtp });
  expect(r2.status).toBe(200);
  return r2.body.accessToken as string;
}

export async function loginAdmin(username: string): Promise<string> {
  const a = SEED_ADMINS.find((x) => x.username === username)!;
  const r = await request(app)
    .post('/api/v1/admin/auth/login')
    .send({ username, password: SEED_ADMIN_PASSWORD, totp: authenticator.generate(a.totpSecret) });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

export function postWebhook(rawBody: string, signature: string) {
  return request(app).post('/api/v1/webhooks/payment').set('content-type', 'application/json').set(SIGNATURE_HEADER, signature).send(rawBody);
}

export function signedWebhook(event: Omit<WebhookEvent, 'eventId'> & { eventId?: string }) {
  return mockGateway.buildWebhook(event);
}

export async function wallet(token: string): Promise<{ availableMg: number; lockedMg: number }> {
  const r = await as(token).get('/api/v1/wallet');
  expect(r.status).toBe(200);
  return r.body;
}

/** Full buy: quote → order → verified webhook. */
export async function buyGold(token: string, goldMg: number) {
  const api = as(token);
  const q = await api.post('/api/v1/quotes', { side: 'BUY', goldMg });
  expect(q.status).toBe(201);
  const o = await api.post('/api/v1/orders/buy', { quoteId: q.body.id });
  expect(o.status).toBe(201);
  const hook = signedWebhook({ type: 'payment.paid', gatewayOrderId: o.body.gatewayOrderId, amountMinor: q.body.totalMinor, currency: q.body.currency });
  const w = await postWebhook(hook.rawBody, hook.signature);
  expect(w.status).toBe(200);
  expect(w.body.outcome).toBe('credited');
  return { quote: q.body, order: o.body };
}

export async function rootClient(): Promise<MongoClient> {
  return MongoClient.connect(process.env.TEST_ROOT_URI!);
}
