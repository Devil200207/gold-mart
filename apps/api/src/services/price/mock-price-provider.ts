import crypto from 'crypto';
import { PriceProvider, PriceSnapshot } from './price-provider';

/**
 * Random walk around a base price, integers only. Each tick moves at most 0.2 % and pulls
 * 5 % of the way back towards the base so the price never drifts far.
 */
export class MockPriceProvider implements PriceProvider {
  private snapshot: PriceSnapshot;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly basePriceMinor: number,
    private readonly currency: string,
    private readonly tickSeconds: number,
  ) {
    this.snapshot = {
      spotPerGramMinor: basePriceMinor,
      previousSpotPerGramMinor: basePriceMinor,
      currency,
      updatedAt: new Date(),
    };
  }

  current(): PriceSnapshot {
    return this.snapshot;
  }

  tick(): void {
    const spot = this.snapshot.spotPerGramMinor;
    const maxStep = Math.max(1, Math.trunc((this.basePriceMinor * 20) / 10000));
    const step = crypto.randomInt(-maxStep, maxStep + 1);
    const reversion = Math.trunc((this.basePriceMinor - spot) / 20);
    const next = Math.max(1, spot + step + reversion);
    this.snapshot = { spotPerGramMinor: next, previousSpotPerGramMinor: spot, currency: this.currency, updatedAt: new Date() };
  }

  /** Test hook: pin the spot price. */
  setSpot(spotPerGramMinor: number): void {
    this.snapshot = {
      spotPerGramMinor,
      previousSpotPerGramMinor: this.snapshot.spotPerGramMinor,
      currency: this.currency,
      updatedAt: new Date(),
    };
  }

  start(): void {
    if (this.timer || this.tickSeconds <= 0) return;
    this.timer = setInterval(() => this.tick(), this.tickSeconds * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
