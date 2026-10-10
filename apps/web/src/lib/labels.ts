import type { DeliveryStatus, EntryType, PaymentStatus } from './api';

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  BUY: 'Bought gold',
  SELL: 'Sold gold',
  DELIVERY_LOCK: 'Locked for delivery',
  DELIVERY_RELEASE: 'Delivery lock released',
  DELIVERY_COMPLETE: 'Delivered',
  REVERSAL: 'Correction',
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  REQUESTED: 'Requested',
  LOCKED: 'Gold locked',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  CREATED: 'Awaiting payment',
  PAID: 'Paid',
  FAILED: 'Failed',
  LATE_PAID_REFUND: 'Refund pending',
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });

function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(iso: string | null | undefined): string {
  const d = safeDate(iso);
  return d ? dateTimeFormatter.format(d) : '—';
}

export function formatDate(iso: string | null | undefined): string {
  const d = safeDate(iso);
  return d ? dateFormatter.format(d) : '—';
}

export function formatTime(iso: string | null | undefined): string {
  const d = safeDate(iso);
  return d ? timeFormatter.format(d) : '—';
}

/** mm:ss (or h:mm:ss) for a non-negative duration in ms. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = (totalSeconds - seconds) / 60;
  const minutes = totalMinutes % 60;
  const hours = (totalMinutes - minutes) / 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

export function shortHash(hash: string | null | undefined, size = 10): string {
  if (!hash) return '—';
  return hash.length > size ? `${hash.slice(0, size)}…` : hash;
}

export function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 8 ? `…${id.slice(-6)}` : id;
}
