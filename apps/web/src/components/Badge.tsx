import type { ReactNode } from 'react';
import type { DeliveryStatus, KycStatus, PaymentStatus, ReversalStatus } from '../lib/api';
import { DELIVERY_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '../lib/labels';

export type BadgeTone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const tones: Record<BadgeTone, string> = {
  gray: 'bg-stone-100 text-stone-700 ring-stone-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone = 'gray', children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const deliveryTone: Record<DeliveryStatus, BadgeTone> = {
  REQUESTED: 'gray',
  LOCKED: 'amber',
  PACKED: 'blue',
  SHIPPED: 'violet',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return <Badge tone={deliveryTone[status]}>{DELIVERY_STATUS_LABEL[status]}</Badge>;
}

const paymentTone: Record<PaymentStatus, BadgeTone> = {
  CREATED: 'amber',
  PAID: 'green',
  FAILED: 'red',
  LATE_PAID_REFUND: 'violet',
};

export function PaymentStatusBadge({ status, prefix }: { status: PaymentStatus | null; prefix?: string }) {
  if (!status) return <Badge tone="gray">{prefix ? `${prefix}: ` : ''}None</Badge>;
  return (
    <Badge tone={paymentTone[status]}>
      {prefix ? `${prefix}: ` : ''}
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function KycBadge({ status }: { status: KycStatus }) {
  return status === 'VERIFIED' ? <Badge tone="green">KYC verified</Badge> : <Badge tone="amber">KYC not done</Badge>;
}

const reversalTone: Record<ReversalStatus, BadgeTone> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
};

export function ReversalStatusBadge({ status }: { status: ReversalStatus }) {
  return <Badge tone={reversalTone[status]}>{status}</Badge>;
}
