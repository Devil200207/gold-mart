export interface PriceSnapshot {
  /** spot price per gram, integer minor units */
  spotPerGramMinor: number;
  previousSpotPerGramMinor: number;
  currency: string;
  updatedAt: Date;
}

/** A source of the live spot price. The real feed will implement this same interface. */
export interface PriceProvider {
  current(): PriceSnapshot;
  start(): void;
  stop(): void;
}
