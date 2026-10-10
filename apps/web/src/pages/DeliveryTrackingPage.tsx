import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Delivery, type DeliveryStatus } from '../lib/api';
import { useAction, useInterval, useLoader } from '../lib/hooks';
import { usePrice } from '../lib/price';
import { formatMg, formatMoney } from '../lib/units';
import { DELIVERY_STATUS_LABEL, formatDateTime } from '../lib/labels';
import { PageHeader } from '../components/PageHeader';
import { Card, CardTitle, Row } from '../components/Card';
import { AnchorButton, Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { DeliveryStatusBadge, PaymentStatusBadge } from '../components/Badge';
import { ConfirmDialog } from '../components/Modal';
import { Countdown, useCountdown } from '../components/Countdown';
import { SkeletonCard } from '../components/Skeleton';
import { CheckIcon, XCircleIcon } from '../components/icons';

const POLL_MS = 10_000;
const FLOW: DeliveryStatus[] = ['LOCKED', 'PACKED', 'SHIPPED', 'DELIVERED'];

export function DeliveryTrackingPage() {
  const { id = '' } = useParams();
  const { decimals } = usePrice();
  const delivery = useLoader(() => api.getDelivery(id), [id]);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useInterval(() => void delivery.refresh(), POLL_MS);

  const cancel = useAction(async (key) => {
    const updated = await api.cancelDelivery(id, key);
    delivery.setData(updated);
    setConfirmCancel(false);
  });

  const d = delivery.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delivery"
        subtitle={d ? d.productName : undefined}
        backTo="/deliver"
        right={d ? <DeliveryStatusBadge status={d.status} /> : undefined}
      />

      {delivery.loading && !d ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </>
      ) : delivery.error && !d ? (
        <Banner tone="error">{delivery.error.message}</Banner>
      ) : d ? (
        <>
          {d.otp && <OtpCard otp={d.otp} />}

          <ChargesCard delivery={d} decimals={decimals} />

          <Card>
            <CardTitle>Status</CardTitle>
            <Timeline delivery={d} />
          </Card>

          <Card>
            <CardTitle>Details</CardTitle>
            <dl className="divide-y divide-stone-100">
              <Row label="Product" value={d.productName} />
              <Row label="Gold weight" value={`${formatMg(d.goldMg)} g`} />
              <Row
                label="Tracking number"
                value={d.trackingNo ? <span className="font-mono">{d.trackingNo}</span> : <span className="text-stone-400">Not shipped yet</span>}
              />
              <Row label="Requested" value={formatDateTime(d.createdAt)} />
            </dl>
            <div className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-stone-700">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Deliver to</p>
              <p className="font-medium text-stone-900">{d.address.fullName}</p>
              <p>{d.address.line1}</p>
              {d.address.line2 && <p>{d.address.line2}</p>}
              <p>
                {d.address.city}
                {d.address.postalCode ? ` ${d.address.postalCode}` : ''}, {d.address.country}
              </p>
              <p className="mt-1 text-stone-500">{d.address.phone}</p>
            </div>
          </Card>

          {(d.status === 'LOCKED' || d.status === 'PACKED') && (
            <div className="space-y-2">
              {cancel.error && !confirmCancel && <Banner tone="error">{cancel.error.message}</Banner>}
              <Button variant="secondary" fullWidth onClick={() => setConfirmCancel(true)} disabled={cancel.pending}>
                Cancel delivery
              </Button>
              <p className="text-center text-xs text-stone-400">You can cancel until the parcel ships.</p>
            </div>
          )}

          <ConfirmDialog
            open={confirmCancel}
            title="Cancel this delivery?"
            tone="danger"
            confirmLabel="Cancel delivery"
            cancelLabel="Keep it"
            busy={cancel.pending}
            error={confirmCancel && cancel.error ? cancel.error.message : null}
            onCancel={() => setConfirmCancel(false)}
            onConfirm={() => void cancel.run()}
          >
            <p>
              The {formatMg(d.goldMg)} g locked for this delivery will be released back to your available balance.
            </p>
          </ConfirmDialog>
        </>
      ) : null}
    </div>
  );
}

function OtpCard({ otp }: { otp: string }) {
  return (
    <section className="rounded-3xl bg-stone-900 p-6 text-center text-white shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Delivery code</p>
      <p className="mt-3 font-mono text-4xl font-semibold tracking-[0.35em] text-white">{otp}</p>
      <p className="mt-3 text-sm text-stone-300">Give this code to the courier when your gold arrives.</p>
      <p className="mt-1 text-xs text-stone-500">Never share it before you have the parcel in hand.</p>
    </section>
  );
}

function ChargesCard({ delivery: d, decimals }: { delivery: Delivery; decimals: number }) {
  const remaining = useCountdown(d.chargesDueBy);
  const unpaid = d.chargesStatus !== 'PAID';
  const awaitingPayment = d.status === 'LOCKED' && (d.chargesStatus === null || d.chargesStatus === 'CREATED');
  const overdue = awaitingPayment && remaining <= 0;

  return (
    <Card>
      <CardTitle action={<PaymentStatusBadge status={d.chargesStatus} />}>Delivery charges</CardTitle>
      <p className="text-2xl font-semibold tabular-nums text-stone-900">{formatMoney(d.chargesMinor, d.currency, decimals)}</p>
      {awaitingPayment && !overdue && d.chargesCheckoutUrl && (
        <div className="mt-4 space-y-3">
          <Banner tone="warning" title="Charges unpaid">
            Pay within <Countdown to={d.chargesDueBy} className="font-semibold" /> or the request is cancelled and your gold
            is released.
          </Banner>
          <AnchorButton href={d.chargesCheckoutUrl} size="lg" fullWidth>
            Pay charges
          </AnchorButton>
        </div>
      )}
      {overdue && (
        <Banner tone="warning" className="mt-4">
          The payment window has passed. This request will be cancelled and your gold released shortly.
        </Banner>
      )}
      {d.chargesStatus === 'FAILED' && d.status !== 'CANCELLED' && (
        <Banner tone="error" className="mt-4">
          The charges payment failed. The request will be cancelled and your gold released back to your wallet.
        </Banner>
      )}
      {d.chargesStatus === 'LATE_PAID_REFUND' && (
        <Banner tone="info" className="mt-4">
          Your charges payment arrived too late and will be refunded.
        </Banner>
      )}
      {!unpaid && d.status !== 'CANCELLED' && <p className="mt-1 text-sm text-emerald-600">Paid — thank you.</p>}
    </Card>
  );
}

function Timeline({ delivery: d }: { delivery: Delivery }) {
  const historyFor = (status: DeliveryStatus) => [...d.history].reverse().find((h) => h.status === status);
  const cancelled = d.status === 'CANCELLED';
  const currentIndex = FLOW.indexOf(d.status);
  // For a cancelled delivery, show the steps it reached before cancellation.
  const reachedIndex = cancelled
    ? FLOW.reduce((acc, s, i) => (historyFor(s) ? i : acc), -1)
    : currentIndex;
  const steps = cancelled ? FLOW.slice(0, Math.max(reachedIndex + 1, 1)) : FLOW;

  return (
    <ol className="relative">
      {steps.map((status, i) => {
        const done = i <= reachedIndex;
        const current = !cancelled && i === currentIndex;
        const entry = historyFor(status);
        const isLast = i === steps.length - 1 && !cancelled;
        return (
          <li key={status} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={`absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-0.5 ${done && i < reachedIndex ? 'bg-amber-400' : 'bg-stone-200'}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 flex h-7 w-7 flex-none items-center justify-center rounded-full ${
                done ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-400 ring-1 ring-stone-200'
              } ${current ? 'ring-4 ring-amber-100' : ''}`}
            >
              {done ? <CheckIcon className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-stone-300" />}
            </span>
            <div className="pt-0.5">
              <p className={`text-sm font-semibold ${done ? 'text-stone-900' : 'text-stone-400'}`}>{DELIVERY_STATUS_LABEL[status]}</p>
              <p className="text-xs text-stone-500">{entry ? `${formatDateTime(entry.at)} · ${entry.by}` : stepHint(status)}</p>
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="relative flex gap-4">
          <span className="relative z-10 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-red-100 text-red-600">
            <XCircleIcon className="h-5 w-5" />
          </span>
          <div className="pt-0.5">
            <p className="text-sm font-semibold text-red-700">Cancelled</p>
            <p className="text-xs text-stone-500">
              {historyFor('CANCELLED') ? `${formatDateTime(historyFor('CANCELLED')?.at)} · ${historyFor('CANCELLED')?.by}` : ''}
            </p>
            <p className="mt-1 text-xs text-stone-500">The locked gold was released back to your wallet.</p>
          </div>
        </li>
      )}
    </ol>
  );
}

function stepHint(status: DeliveryStatus): string {
  switch (status) {
    case 'LOCKED':
      return 'Gold reserved for your delivery';
    case 'PACKED':
      return 'Being prepared at the vault';
    case 'SHIPPED':
      return 'On its way with an insured courier';
    case 'DELIVERED':
      return 'Handed over with your delivery code';
    default:
      return '';
  }
}
