import { AppError } from '../lib/errors';
import { withTransaction } from '../lib/tx';
import { Delivery, DeliveryDoc, Payment, Quote } from '../models';
import { audit, RequestContext } from './audit.service';
import { cancelInSession, markChargesPaidInSession } from './delivery.service';
import { postInSession } from './ledger.service';
import { handlePayoutEvent } from './order.service';
import { gateway } from './payment';

export type WebhookOutcome = 'credited' | 'charges_paid' | 'failed' | 'flagged' | 'duplicate' | 'ignored';

/**
 * Rules: verify signature (constant time) → skip known eventIds → exact amount/currency match →
 * mark PAID and post the ledger entry in ONE transaction. The route returns 200 only after this
 * resolves, so the gateway retries if anything throws.
 */
export async function handlePaymentWebhook(rawBody: Buffer, signature: string, ctx: RequestContext): Promise<WebhookOutcome> {
  if (!gateway.verifyWebhook(rawBody, signature)) {
    await audit({ actorType: 'gateway', action: 'webhook.invalid_signature', details: { bytes: rawBody.length }, ctx });
    throw new AppError('INVALID_SIGNATURE', 'Invalid webhook signature');
  }
  const event = gateway.parseWebhook(rawBody);

  if (event.type === 'payout.paid' || event.type === 'payout.failed') {
    await handlePayoutEvent(event.type, event.gatewayOrderId);
    return 'ignored';
  }

  const outcome = await withTransaction<WebhookOutcome>(async (session) => {
    const payment = await Payment.findOne({ gatewayOrderId: event.gatewayOrderId }, null, { session });
    if (!payment) return 'ignored';
    if (payment.webhookEventIds.includes(event.eventId)) return 'duplicate';
    payment.webhookEventIds.push(event.eventId);

    const delivery =
      payment.purpose === 'DELIVERY_CHARGES' && payment.deliveryId
        ? ((await Delivery.findById(payment.deliveryId, null, { session }).lean()) as DeliveryDoc | null)
        : null;

    let result: WebhookOutcome = 'ignored';

    if (event.type === 'payment.paid') {
      const matches = event.amountMinor === payment.amountMinor && event.currency === payment.currency;
      if (!matches) {
        // Never credit on a mismatch; flag for a manual refund of whatever was taken.
        if (payment.status === 'CREATED') payment.status = 'FAILED';
        payment.needsManualRefund = true;
        payment.flagReason = `Amount mismatch: paid ${event.amountMinor} ${event.currency}, expected ${payment.amountMinor} ${payment.currency}`;
        if (delivery && (delivery.status === 'LOCKED' || delivery.status === 'PACKED')) {
          await cancelInSession(session, delivery, { kind: 'system' }, 'Charges payment amount mismatch');
        }
        result = 'flagged';
      } else if (payment.status === 'CREATED') {
        if (payment.purpose === 'BUY') {
          // Credit at the quoted price even if the quote has since expired (the user paid against it).
          const quote = await Quote.findById(payment.quoteId, null, { session }).lean();
          if (!quote) throw new Error(`quote ${payment.quoteId} missing for payment ${payment._id}`);
          const entry = await postInSession(session, {
            userId: payment.userId,
            type: 'BUY',
            availableDeltaMg: quote.goldMg,
            lockedDeltaMg: 0,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            quoteId: quote._id,
            refType: 'payment',
            refId: payment._id,
            idempotencyKey: `buy:${payment._id}`,
            createdBy: 'system',
          });
          payment.status = 'PAID';
          payment.paidAt = new Date();
          payment.ledgerSeq = entry.seq;
          result = 'credited';
        } else if (delivery && delivery.status === 'LOCKED' && !delivery.chargesPaidAt) {
          await markChargesPaidInSession(session, delivery);
          payment.status = 'PAID';
          payment.paidAt = new Date();
          result = 'charges_paid';
        } else {
          // Charges arrived after the delivery was cancelled (e.g. timeout): refund them.
          payment.status = 'LATE_PAID_REFUND';
          payment.needsManualRefund = true;
          payment.flagReason = 'Charges paid after the delivery was cancelled';
          result = 'flagged';
        }
      } else if (payment.status === 'FAILED') {
        payment.status = 'LATE_PAID_REFUND';
        payment.needsManualRefund = true;
        payment.flagReason = 'Payment succeeded after it was marked failed';
        result = 'flagged';
      }
    } else if (event.type === 'payment.failed' && payment.status === 'CREATED') {
      payment.status = 'FAILED';
      if (delivery && delivery.status === 'LOCKED') {
        await cancelInSession(session, delivery, { kind: 'system' }, 'Charges payment failed');
      }
      result = 'failed';
    }

    await payment.save({ session });
    if (result === 'flagged') {
      await audit(
        { actorType: 'gateway', action: 'payment.flagged', targetType: 'payment', targetId: payment._id.toHexString(), details: { reason: payment.flagReason }, ctx },
        session,
      );
    }
    return result;
  });
  return outcome;
}
