// Integer-only arithmetic for gold (mg) and money (minor units).
// BigInt is used for intermediate products so nothing can lose precision.

export function assertSafeInt(name: string, v: number): void {
  if (!Number.isSafeInteger(v)) throw new Error(`${name} must be a safe integer, got ${v}`);
}

function toSafe(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`integer overflow: ${v}`);
  return n;
}

/** floor(a * b / c) for non-negative integers */
export function mulDivFloor(a: number, b: number, c: number): number {
  assertSafeInt('a', a);
  assertSafeInt('b', b);
  assertSafeInt('c', c);
  return toSafe((BigInt(a) * BigInt(b)) / BigInt(c));
}

/** ceil(a * b / c) for non-negative integers */
export function mulDivCeil(a: number, b: number, c: number): number {
  assertSafeInt('a', a);
  assertSafeInt('b', b);
  assertSafeInt('c', c);
  const num = BigInt(a) * BigInt(b);
  const den = BigInt(c);
  return toSafe((num + den - 1n) / den);
}
