import { useEffect, useRef } from 'react';
import { useNow } from '../lib/hooks';
import { formatDuration } from '../lib/labels';

/**
 * Milliseconds left until `targetIso`, measured on the server's clock.
 * `offsetMs` = serverTime − local time when the server response arrived, so
 * `Date.now() + offsetMs` approximates the server's current time.
 */
export function useCountdown(targetIso: string | null | undefined, offsetMs = 0, tickMs = 250): number {
  const now = useNow(tickMs);
  if (!targetIso) return 0;
  const target = Date.parse(targetIso);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, target - (now + offsetMs));
}

/** Computes the clock offset from a response's `serverTime` field. */
export function clockOffsetFrom(serverTimeIso: string, receivedAtMs: number = Date.now()): number {
  const server = Date.parse(serverTimeIso);
  return Number.isNaN(server) ? 0 : server - receivedAtMs;
}

interface CountdownProps {
  to: string;
  offsetMs?: number;
  onExpire?(): void;
  className?: string;
}

export function Countdown({ to, offsetMs = 0, onExpire, className = '' }: CountdownProps) {
  const remaining = useCountdown(to, offsetMs);
  const expired = remaining <= 0;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  useEffect(() => {
    if (expired) onExpireRef.current?.();
  }, [expired]);
  return <span className={`tabular-nums ${className}`}>{formatDuration(remaining)}</span>;
}
