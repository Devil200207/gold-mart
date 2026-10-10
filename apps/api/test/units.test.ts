import { Types } from 'mongoose';
import { canonicalJson } from '../src/lib/canonical-json';
import { formatMg, formatMoney } from '../src/lib/format';
import { merkleProof, merkleRoot, verifyProof } from '../src/lib/merkle';
import { sha256 } from '../src/lib/crypto';
import { mulDivCeil, mulDivFloor } from '../src/lib/money';
import { assertTransition } from '../src/services/delivery.service';
import { computeEntryHash, GENESIS_HASH } from '../src/services/ledger.service';
import * as pricing from '../src/services/pricing';

const cfg: pricing.PricingConfig = { buySpreadBps: 150, sellSpreadBps: 150, flatFeeMinor: 0, taxRateBps: 0 };

describe('pricing (integer rounding rules)', () => {
  test('buy and sell prices apply the spread', () => {
    expect(pricing.buyPricePerGram(30000, cfg)).toBe(30450);
    expect(pricing.sellPricePerGram(30000, cfg)).toBe(29550);
    expect(pricing.buyPricePerGram(30001, cfg)).toBe(Math.ceil(30001 * 1.015)); // 30451.015 → 30452
  });

  test('buy by money floors the grams and charges the full amount', () => {
    const b = pricing.buyByAmount(30000, 10000, cfg);
    expect(b.goldMg).toBe(Math.floor((10000 * 1000) / 30450)); // 328
    expect(b.totalMinor).toBe(10000);
  });

  test('buy by weight rounds the subtotal up', () => {
    expect(pricing.buyByWeight(30000, 1, cfg).subtotalMinor).toBe(31); // 30.45 → 31
    expect(pricing.buyByWeight(30000, 1000, cfg).subtotalMinor).toBe(30450);
  });

  test('sell floors the payout and subtracts the fee; tax and fee round up', () => {
    const c = { ...cfg, flatFeeMinor: 100, taxRateBps: 500 };
    const s = pricing.sell(30000, 1001, c);
    expect(s.subtotalMinor).toBe(Math.floor((1001 * 29550) / 1000)); // 29579
    expect(s.totalMinor).toBe(s.subtotalMinor - 100);
    expect(pricing.buyByAmount(30000, 101, c).taxMinor).toBe(6); // 5.05 → 6
  });

  test('mulDiv helpers never lose precision', () => {
    expect(mulDivFloor(9_007_199_254, 1_000_000, 3)).toBe(3_002_399_751_333_333);
    expect(mulDivCeil(1, 1, 3)).toBe(1);
    expect(() => mulDivFloor(1.5, 1, 1)).toThrow();
  });
});

describe('formatting from integers', () => {
  test('grams with 3 decimals and money with currency decimals', () => {
    expect(formatMg(5000)).toBe('5.000 g');
    expect(formatMg(1)).toBe('0.001 g');
    expect(formatMg(-250)).toBe('-0.250 g');
    expect(formatMoney(123450, 'AED')).toBe('AED 1,234.50');
  });
});

describe('hash chain', () => {
  test('canonical JSON sorts keys and strips whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}');
  });

  test('entry hash = sha256(prevHash + canonicalJson(entry without hash)) and detects edits', () => {
    const entry = {
      seq: 1,
      userId: new Types.ObjectId('64b7f0c2a1b2c3d4e5f60718'),
      type: 'BUY' as const,
      availableDeltaMg: 1000,
      lockedDeltaMg: 0,
      amountMinor: 30450,
      currency: 'AED',
      quoteId: null,
      refType: 'payment' as const,
      refId: new Types.ObjectId('64b7f0c2a1b2c3d4e5f60719'),
      idempotencyKey: 'buy:x',
      balanceAfter: { availableMg: 1000, lockedMg: 0 },
      prevHash: GENESIS_HASH,
      createdBy: 'system' as const,
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
    };
    const h = computeEntryHash(entry);
    const { prevHash, ...rest } = entry;
    expect(h).toBe(sha256(prevHash + canonicalJson({ ...rest, prevHash })));
    expect(computeEntryHash({ ...entry, availableDeltaMg: 1001 })).not.toBe(h);
  });
});

describe('merkle proofs', () => {
  test.each([1, 2, 3, 5, 8, 13])('every leaf of a %i-leaf tree verifies against the root', (n) => {
    const leaves = Array.from({ length: n }, (_, i) => sha256(`leaf-${i}`));
    const root = merkleRoot(leaves);
    leaves.forEach((leaf, i) => expect(verifyProof(leaf, merkleProof(leaves, i), root)).toBe(true));
    expect(verifyProof(sha256('other'), merkleProof(leaves, 0), root)).toBe(n === 0);
  });
});

describe('delivery status transitions', () => {
  test('only the allowed transitions pass', () => {
    expect(() => assertTransition('LOCKED', 'PACKED')).not.toThrow();
    expect(() => assertTransition('PACKED', 'CANCELLED')).not.toThrow();
    expect(() => assertTransition('SHIPPED', 'CANCELLED')).toThrow('Cannot move');
    expect(() => assertTransition('LOCKED', 'SHIPPED')).toThrow('Cannot move');
    expect(() => assertTransition('DELIVERED', 'LOCKED')).toThrow('Cannot move');
  });
});
