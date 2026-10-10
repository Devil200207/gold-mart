import { env } from '../../config/env';
import { MockPriceProvider } from './mock-price-provider';
import { PriceProvider } from './price-provider';

export type { PriceProvider, PriceSnapshot } from './price-provider';

// Swap this for the real provider later; nothing else needs to change.
export const mockPriceProvider = new MockPriceProvider(env.MOCK_BASE_PRICE_MINOR, env.CURRENCY, env.PRICE_TICK_SECONDS);
export const priceProvider: PriceProvider = mockPriceProvider;
