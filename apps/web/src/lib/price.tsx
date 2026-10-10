import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type Price } from './api';
import { useInterval } from './hooks';

export const PRICE_POLL_MS = 10_000;

interface PriceContextValue {
  price: Price | null;
  error: string | null;
  /** Currency code to use for display before the first price arrives. */
  currency: string;
  /** Decimals of the currency's minor unit (from GET /price; 2 until loaded). */
  decimals: number;
  refresh(): void;
}

const PriceContext = createContext<PriceContextValue | null>(null);

/** Polls GET /price every 10 s and shares it with every screen. */
export function PriceProvider({ children }: { children: ReactNode }) {
  const [price, setPrice] = useState<Price | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await api.getPrice();
      setPrice(next);
      setError(null);
    } catch {
      setError('Live price unavailable');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useInterval(() => void load(), PRICE_POLL_MS);

  const value = useMemo<PriceContextValue>(
    () => ({
      price,
      error,
      currency: price?.currency ?? 'AED',
      decimals: price?.currencyDecimals ?? 2,
      refresh: () => void load(),
    }),
    [price, error, load],
  );

  return <PriceContext.Provider value={value}>{children}</PriceContext.Provider>;
}

export function usePrice(): PriceContextValue {
  const ctx = useContext(PriceContext);
  if (!ctx) throw new Error('usePrice must be used inside <PriceProvider>');
  return ctx;
}
