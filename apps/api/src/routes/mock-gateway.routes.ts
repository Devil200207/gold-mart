import express, { Router } from 'express';
import { env } from '../config/env';
import { escapeHtml as e, formatMoney } from '../lib/format';
import { MockGatewayOrder } from '../models';
import { ah } from '../middleware/async';
import { mockGateway } from '../services/payment';

// Stands in for the gateway's hosted checkout page. Not part of the app's API.
export const mockGatewayRouter = Router();

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)}</title>
<style>
 body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#eef2ff;margin:0;padding:24px;color:#1e1b4b}
 .card{max-width:420px;margin:40px auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(30,27,75,.12)}
 .brand{font-weight:700;color:#4f46e5;letter-spacing:.02em;margin-bottom:18px}
 .amt{font-size:32px;font-weight:700;margin:6px 0 2px} .muted{color:#6b7280;font-size:13px}
 button{width:100%;padding:13px;border:0;border-radius:10px;font-size:15px;font-weight:600;margin-top:10px;cursor:pointer}
 .pay{background:#4f46e5;color:#fff}.fail{background:#fee2e2;color:#991b1b}.twice{background:#e0e7ff;color:#3730a3}
 .note{margin-top:18px;font-size:12px;color:#6b7280;line-height:1.5}
 a{color:#4f46e5}
</style></head><body><div class="card"><div class="brand">MockPay · test checkout</div>${body}</div></body></html>`;

const returnUrl = (orderId: string) => `${env.PUBLIC_BASE_URL}/payment/return?orderId=${encodeURIComponent(orderId)}`;

mockGatewayRouter.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${env.PUBLIC_BASE_URL}; frame-ancestors 'none'`,
  );
  next();
});

mockGatewayRouter.get(
  '/checkout/:orderId',
  ah(async (req, res) => {
    const order = await MockGatewayOrder.findOne({ gatewayId: req.params.orderId, kind: 'ORDER' }).lean();
    if (!order) return res.status(404).type('html').send(page('Not found', '<p>Unknown order.</p>'));
    const amount = formatMoney(order.amountMinor, order.currency, env.CURRENCY_DECIMALS);
    if (order.status !== 'PENDING') {
      return res
        .type('html')
        .send(page('Checkout', `<p>This order is already <b>${e(order.status)}</b>.</p><p><a href="${e(returnUrl(order.gatewayId))}">Return to Gold Wallet</a></p>`));
    }
    const action = `${env.PUBLIC_BASE_URL}/mock-gateway/checkout/${encodeURIComponent(order.gatewayId)}`;
    res.type('html').send(
      page(
        'Checkout',
        `<div class="muted">Amount due</div><div class="amt">${e(amount)}</div>
         <div class="muted">Reference ${e(order.reference)} · Order ${e(order.gatewayId)}</div>
         <form method="post" action="${e(action)}">
           <button class="pay" name="outcome" value="pay">Pay ${e(amount)}</button>
           <button class="fail" name="outcome" value="fail">Fail payment</button>
           <button class="twice" name="outcome" value="pay-twice">Pay &amp; send webhook twice</button>
         </form>
         <div class="note">Test gateway. The result is sent to Gold Wallet as an HMAC-signed webhook after 1–2 seconds; the app only credits gold when that webhook is verified.</div>`,
      ),
    );
  }),
);

mockGatewayRouter.post(
  '/checkout/:orderId',
  express.urlencoded({ extended: false, limit: '2kb' }),
  ah(async (req, res) => {
    const outcome = String(req.body?.outcome ?? '');
    const orderId = String(req.params.orderId);
    if (!['pay', 'fail', 'pay-twice'].includes(outcome)) return res.status(400).type('html').send(page('Error', '<p>Bad request.</p>'));
    const hook = await mockGateway.settleOrder(orderId, outcome === 'fail' ? 'fail' : 'pay');
    if (hook) {
      const times = outcome === 'pay-twice' ? 2 : 1;
      const delay = 1000 + Math.floor(Math.random() * 1000);
      setTimeout(async () => {
        for (let i = 0; i < times; i++) {
          try {
            const status = await mockGateway.deliver(hook.rawBody, hook.signature);
            console.log(`[mock-gateway] webhook ${hook.event.type} ${orderId} → ${status}`);
          } catch (err) {
            console.error('[mock-gateway] webhook delivery failed', err);
          }
        }
      }, delay);
    }
    res.redirect(303, returnUrl(orderId));
  }),
);
