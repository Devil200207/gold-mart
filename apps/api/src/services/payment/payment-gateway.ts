export type WebhookEventType = 'payment.paid' | 'payment.failed' | 'payout.paid' | 'payout.failed';

export interface WebhookEvent {
  eventId: string;
  type: WebhookEventType;
  /** gateway order id for payment events, gateway payout id for payout events */
  gatewayOrderId: string;
  amountMinor: number;
  currency: string;
}

/** Business logic codes against this interface only, so a real gateway can replace the mock. */
export interface PaymentGateway {
  createOrder(p: { amountMinor: number; currency: string; reference: string }): Promise<{ gatewayOrderId: string; checkoutUrl: string }>;
  verifyWebhook(rawBody: Buffer, signatureHeader: string): boolean;
  parseWebhook(rawBody: Buffer): WebhookEvent;
  createPayout(p: {
    amountMinor: number;
    currency: string;
    bankAccountRef: string;
    reference: string;
  }): Promise<{ payoutId: string; status: 'PENDING' | 'PAID' | 'FAILED' }>;
}

export const SIGNATURE_HEADER = 'x-gateway-signature';
