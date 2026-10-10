// Pure pricing functions. Integers only; rounding exactly as the spec defines.
import { env } from '../config/env';
import { mulDivCeil, mulDivFloor } from '../lib/money';

export interface PricingConfig {
  buySpreadBps: number;
  sellSpreadBps: number;
  flatFeeMinor: number;
  taxRateBps: number;
}

export const configFromEnv = (): PricingConfig => ({
  buySpreadBps: env.BUY_SPREAD_BPS,
  sellSpreadBps: env.SELL_SPREAD_BPS,
  flatFeeMinor: env.FLAT_FEE_MINOR,
  taxRateBps: env.TAX_RATE_BPS,
});

/** Buy price = spot × (1 + spread). Rounded up to the minor unit (never below the spread). */
export const buyPricePerGram = (spot: number, c: PricingConfig) => mulDivCeil(spot, 10000 + c.buySpreadBps, 10000);

/** Sell price = spot × (1 − spread). Rounded down to the minor unit. */
export const sellPricePerGram = (spot: number, c: PricingConfig) => mulDivFloor(spot, 10000 - c.sellSpreadBps, 10000);

/** Tax is computed on the subtotal, rounded up. */
export const taxOn = (subtotalMinor: number, c: PricingConfig) => mulDivCeil(subtotalMinor, c.taxRateBps, 10000);

export interface Breakdown {
  pricePerGramMinor: number;
  goldMg: number;
  subtotalMinor: number;
  feeMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/** Buy by money: goldMg = floor(subtotal × 1000 / price). The full entered amount is the subtotal. */
export function buyByAmount(spot: number, amountMinor: number, c: PricingConfig): Breakdown {
  const price = buyPricePerGram(spot, c);
  const goldMg = mulDivFloor(amountMinor, 1000, price);
  const feeMinor = c.flatFeeMinor;
  const taxMinor = taxOn(amountMinor, c);
  return { pricePerGramMinor: price, goldMg, subtotalMinor: amountMinor, feeMinor, taxMinor, totalMinor: amountMinor + feeMinor + taxMinor };
}

/** Buy by weight: subtotal = ceil(goldMg × price / 1000). */
export function buyByWeight(spot: number, goldMg: number, c: PricingConfig): Breakdown {
  const price = buyPricePerGram(spot, c);
  const subtotalMinor = mulDivCeil(goldMg, price, 1000);
  const feeMinor = c.flatFeeMinor;
  const taxMinor = taxOn(subtotalMinor, c);
  return { pricePerGramMinor: price, goldMg, subtotalMinor, feeMinor, taxMinor, totalMinor: subtotalMinor + feeMinor + taxMinor };
}

/** Sell: payout = floor(goldMg × sellPrice / 1000) − fee. No tax on sell-back. */
export function sell(spot: number, goldMg: number, c: PricingConfig): Breakdown {
  const price = sellPricePerGram(spot, c);
  const subtotalMinor = mulDivFloor(goldMg, price, 1000);
  const feeMinor = c.flatFeeMinor;
  return { pricePerGramMinor: price, goldMg, subtotalMinor, feeMinor, taxMinor: 0, totalMinor: subtotalMinor - feeMinor };
}
