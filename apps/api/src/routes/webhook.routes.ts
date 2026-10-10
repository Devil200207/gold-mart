import express, { Router } from 'express';
import { ah, ctxOf } from '../middleware/async';
import { SIGNATURE_HEADER } from '../services/payment';
import { handlePaymentWebhook } from '../services/webhook.service';

export const webhookRouter = Router();

// Raw body is required to verify the HMAC signature byte-for-byte.
webhookRouter.post(
  '/payment',
  express.raw({ type: '*/*', limit: '64kb' }),
  ah(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const outcome = await handlePaymentWebhook(raw, req.get(SIGNATURE_HEADER) ?? '', ctxOf(req));
    // Only reached after the DB transaction committed.
    res.status(200).json({ received: true, outcome });
  }),
);
