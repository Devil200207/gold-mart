import { z } from 'zod';
import { env, webhookUrl } from '../../config/env';
import { hmacSha256, randomId, safeEqual } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { MockGatewayOrder } from '../../models';
import { PaymentGateway, SIGNATURE_HEADER, WebhookEvent } from './payment-gateway';

const eventSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(['payment.paid', 'payment.failed', 'payout.paid', 'payout.failed']),
  gatewayOrderId: z.string().min(1),
  amountMinor: z.number().int().safe(),
  currency: z.string().min(1),
});

/**
 * Behaves like a hosted-checkout gateway: orders get a checkout page (served by the API under
 * /mock-gateway), the page triggers HMAC-signed webhooks, and payouts settle synchronously.
 * A bank account reference (IBAN) ending in 0000 makes the payout fail.
 */
export class MockGateway implements PaymentGateway {
  constructor(private readonly secret: string) {}

  /** Test hook: force the next N payouts to fail regardless of bank account. */
  failNextPayouts = 0;

  async createOrder(p: { amountMinor: number; currency: string; reference: string }) {
    const gatewayOrderId = randomId('mock_ord');
    await MockGatewayOrder.create({ gatewayId: gatewayOrderId, kind: 'ORDER', ...p, status: 'PENDING' });
    return { gatewayOrderId, checkoutUrl: `${env.PUBLIC_BASE_URL}/mock-gateway/checkout/${gatewayOrderId}` };
  }

  sign(rawBody: Buffer | string): string {
    return hmacSha256(this.secret, rawBody);
  }

  verifyWebhook(rawBody: Buffer, signatureHeader: string): boolean {
    if (!signatureHeader) return false;
    return safeEqual(this.sign(rawBody), signatureHeader);
  }

  parseWebhook(rawBody: Buffer): WebhookEvent {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Webhook body is not JSON');
    }
    return eventSchema.parse(json);
  }

  async createPayout(p: { amountMinor: number; currency: string; bankAccountRef: string; reference: string }) {
    const payoutId = randomId('mock_po');
    let status: 'PAID' | 'FAILED' = p.bankAccountRef.replace(/\s/g, '').endsWith('0000') ? 'FAILED' : 'PAID';
    if (this.failNextPayouts > 0) {
      this.failNextPayouts--;
      status = 'FAILED';
    }
    await MockGatewayOrder.create({
      gatewayId: payoutId,
      kind: 'PAYOUT',
      amountMinor: p.amountMinor,
      currency: p.currency,
      reference: p.reference,
      status,
    });
    return { payoutId, status };
  }

  // ----- mock-only helpers (not part of PaymentGateway) -----

  buildWebhook(event: Omit<WebhookEvent, 'eventId'> & { eventId?: string }): { rawBody: string; signature: string; event: WebhookEvent } {
    const full: WebhookEvent = { eventId: event.eventId ?? randomId('evt'), ...event } as WebhookEvent;
    const rawBody = JSON.stringify(full);
    return { rawBody, signature: this.sign(rawBody), event: full };
  }

  /** Marks the mock order paid/failed (as the gateway would) and returns the webhook to send. */
  async settleOrder(gatewayOrderId: string, outcome: 'pay' | 'fail') {
    const order = await MockGatewayOrder.findOneAndUpdate(
      { gatewayId: gatewayOrderId, kind: 'ORDER', status: 'PENDING' },
      { $set: { status: outcome === 'pay' ? 'PAID' : 'FAILED' } },
      { new: true },
    ).lean();
    if (!order) return null;
    return this.buildWebhook({
      type: outcome === 'pay' ? 'payment.paid' : 'payment.failed',
      gatewayOrderId,
      amountMinor: order.amountMinor,
      currency: order.currency,
    });
  }

  /** Delivers a webhook over HTTP to the API, like a real gateway would. */
  async deliver(rawBody: string, signature: string): Promise<number> {
    const res = await fetch(webhookUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signature },
      body: rawBody,
    });
    return res.status;
  }
}
