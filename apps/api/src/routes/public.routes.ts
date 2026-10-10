import { Router } from 'express';
import { env } from '../config/env';
import { toAnchor } from '../lib/serialize';
import { seqParam } from '../lib/validation';
import { ah } from '../middleware/async';
import { verifyEntry } from '../services/anchor.service';
import { priceProvider } from '../services/price';
import * as pricing from '../services/pricing';

export const publicRouter = Router();

export function currentPrice() {
  const p = priceProvider.current();
  const cfg = pricing.configFromEnv();
  const spot = p.spotPerGramMinor;
  return {
    currency: p.currency,
    currencyDecimals: env.CURRENCY_DECIMALS,
    spotPerGramMinor: spot,
    buyPerGramMinor: pricing.buyPricePerGram(spot, cfg),
    sellPerGramMinor: pricing.sellPricePerGram(spot, cfg),
    direction: spot > p.previousSpotPerGramMinor ? 'up' : spot < p.previousSpotPerGramMinor ? 'down' : 'flat',
    updatedAt: p.updatedAt.toISOString(),
  };
}

publicRouter.get('/price', (_req, res) => {
  res.json(currentPrice());
});

publicRouter.get(
  '/verify/:seq',
  ah(async (req, res) => {
    const r = await verifyEntry(seqParam.parse(req.params.seq));
    res.json({ ...r, anchor: toAnchor(r.anchor) });
  }),
);
