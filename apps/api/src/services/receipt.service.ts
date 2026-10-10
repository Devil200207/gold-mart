import { env } from '../config/env';
import { escapeHtml as e, formatMg, formatMoney } from '../lib/format';
import { Delivery, Payment, Payout, Quote, UserDoc } from '../models';
import { LedgerEntryDoc } from './ledger.service';

const TYPE_LABEL: Record<string, string> = {
  BUY: 'Gold purchase',
  SELL: 'Gold sell-back',
  DELIVERY_LOCK: 'Gold reserved for home delivery',
  DELIVERY_RELEASE: 'Delivery cancelled — gold released',
  DELIVERY_COMPLETE: 'Physical gold delivered',
  REVERSAL: 'Correction (reversal)',
};

export async function renderReceipt(entry: LedgerEntryDoc, user: UserDoc): Promise<string> {
  const rows: [string, string][] = [
    ['Receipt no.', `GW-${String(entry.seq).padStart(8, '0')}`],
    ['Date (UTC)', entry.createdAt.toISOString().replace('T', ' ').slice(0, 19)],
    ['Customer', user.email],
    ['Transaction', TYPE_LABEL[entry.type] ?? entry.type],
  ];
  if (entry.availableDeltaMg !== 0) rows.push(['Available gold change', formatMg(entry.availableDeltaMg)]);
  if (entry.lockedDeltaMg !== 0) rows.push(['Locked gold change', formatMg(entry.lockedDeltaMg)]);

  if (entry.quoteId) {
    const q = await Quote.findById(entry.quoteId).lean();
    if (q) {
      rows.push([`${q.side === 'BUY' ? 'Buy' : 'Sell'} price per gram`, formatMoney(q.pricePerGramMinor, q.currency, env.CURRENCY_DECIMALS)]);
      rows.push(['Subtotal', formatMoney(q.subtotalMinor, q.currency, env.CURRENCY_DECIMALS)]);
      rows.push(['Fee', formatMoney(q.feeMinor, q.currency, env.CURRENCY_DECIMALS)]);
      rows.push(['Tax', formatMoney(q.taxMinor, q.currency, env.CURRENCY_DECIMALS)]);
    }
  }
  if (entry.amountMinor != null && entry.currency) {
    const label = entry.type === 'BUY' ? 'Total paid' : entry.type === 'SELL' ? 'Payout' : 'Amount';
    rows.push([label, formatMoney(entry.amountMinor, entry.currency, env.CURRENCY_DECIMALS)]);
  }
  if (entry.refType === 'payment') {
    const p = await Payment.findById(entry.refId).lean();
    if (p) rows.push(['Gateway order', p.gatewayOrderId]);
  } else if (entry.refType === 'payout') {
    const p = await Payout.findById(entry.refId).lean();
    if (p) rows.push(['Payout status', p.status]);
  } else if (entry.refType === 'delivery') {
    const d = await Delivery.findById(entry.refId).lean();
    if (d) rows.push(['Product', d.productName]);
  }
  rows.push(['Balance after', `${formatMg(entry.balanceAfter.availableMg)} available · ${formatMg(entry.balanceAfter.lockedMg)} locked`]);
  rows.push(['Ledger seq', String(entry.seq)]);
  rows.push(['Entry hash', entry.hash]);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt GW-${entry.seq}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fafaf9;color:#1c1917;margin:0;padding:24px}
  .card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:24px}
  h1{font-size:18px;margin:0 0 4px} .sub{color:#78716c;font-size:13px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:14px} td{padding:8px 0;border-bottom:1px solid #f5f5f4;vertical-align:top}
  td:first-child{color:#78716c;width:45%} td:last-child{text-align:right;overflow-wrap:anywhere}
  .hash{font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all}
  .foot{color:#a8a29e;font-size:12px;margin-top:16px}
</style></head>
<body><div class="card">
<h1>Gold Wallet — Transaction receipt</h1>
<div class="sub">Gold is held in allocated storage on your behalf. Weights in grams (3 decimals).</div>
<table>${rows.map(([k, v]) => `<tr><td>${e(k)}</td><td${k === 'Entry hash' ? ' class="hash"' : ''}>${e(v)}</td></tr>`).join('')}</table>
<div class="foot">This entry is part of a tamper-evident hash chain. Verify at /api/v1/verify/${entry.seq}.</div>
</div></body></html>`;
}
