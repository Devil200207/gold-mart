import type { ReactNode } from 'react';
import type { Quote } from '../lib/api';
import { formatMg, formatMoney } from '../lib/units';
import { formatDuration } from '../lib/labels';
import { Card, Row } from './Card';

interface QuoteCardProps {
  quote: Quote;
  decimals: number;
  remainingMs: number;
  children?: ReactNode;
}

/** Breakdown of a server-issued BUY or SELL quote with its lock countdown. */
export function QuoteCard({ quote, decimals, remainingMs, children }: QuoteCardProps) {
  const money = (minor: number) => formatMoney(minor, quote.currency, decimals);
  const expired = remainingMs <= 0;
  const urgent = !expired && remainingMs < 30_000;
  const isBuy = quote.side === 'BUY';

  return (
    <Card className="animate-slide-up overflow-hidden" padded={false}>
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-amber-50/60 px-5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">
          {isBuy ? 'Buy quote' : 'Sell quote'}
        </span>
        {expired ? (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">Quote expired</span>
        ) : (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
              urgent ? 'bg-red-100 text-red-700' : 'bg-white text-stone-700 ring-1 ring-stone-200'
            }`}
          >
            Price locked · {formatDuration(remainingMs)}
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        <div className="mb-3 text-center">
          <p className="text-xs uppercase tracking-wide text-stone-500">Gold weight</p>
          <p className="mt-0.5 text-3xl font-semibold tabular-nums text-stone-900">
            {formatMg(quote.goldMg)} <span className="text-lg font-medium text-stone-500">g</span>
          </p>
        </div>
        <dl className="divide-y divide-stone-100">
          <Row label="Price per gram" value={money(quote.pricePerGramMinor)} />
          <Row label="Subtotal" value={money(quote.subtotalMinor)} />
          <Row label="Fee" value={isBuy ? money(quote.feeMinor) : `−${money(quote.feeMinor)}`} />
          {(isBuy || quote.taxMinor !== 0) && <Row label="Tax" value={money(quote.taxMinor)} />}
          <Row label={isBuy ? 'Total to pay' : 'You receive'} value={money(quote.totalMinor)} strong />
        </dl>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </Card>
  );
}
