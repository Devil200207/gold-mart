import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError } from './api';
import { newIdempotencyKey } from './idempotency';

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof Error) return new ApiError(0, 'CLIENT_ERROR', e.message);
  return new ApiError(0, 'CLIENT_ERROR', 'Something went wrong. Please try again.');
}

/**
 * Wraps a user action (button click) that performs a state-changing request.
 *
 *  - generates exactly ONE Idempotency-Key per invocation of `run` (i.e. per
 *    click) and hands it to `fn`; the API wrapper reuses it for retries
 *  - ignores re-entrant calls while a request is in flight (double-submit guard
 *    that works even before React re-renders the disabled button)
 *  - exposes `pending` for disabling the button and `error` for inline display
 */
export function useAction<A extends unknown[], R>(fn: (idempotencyKey: string, ...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const idempotencyKey = newIdempotencyKey(); // once per user action
    try {
      return await fnRef.current(idempotencyKey, ...args);
    } catch (e) {
      if (mounted.current) setError(toApiError(e));
      return undefined;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, setError, clearError };
}

/** Loads data for a screen with loading / error state and a `reload` function. */
export function useLoader<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async (silent: boolean) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const result = await fnRef.current();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (id === requestId.current) setError(toApiError(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    return () => {
      // Invalidate any in-flight response for the previous deps.
      requestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);

  return { data, error, loading, reload, refresh, setData };
}

/** Calls `callback` every `ms` milliseconds while the tab is visible. `null` pauses. */
export function useInterval(callback: () => void, ms: number | null): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  useEffect(() => {
    if (ms === null) return undefined;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      cbRef.current();
    }, ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/** Current time in ms, re-rendering every `tickMs`. */
export function useNow(tickMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}
