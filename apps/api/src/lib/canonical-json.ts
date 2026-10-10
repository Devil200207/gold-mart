import { Types } from 'mongoose';

// Normalises a value into plain JSON types so the same entry always hashes the same,
// whether it is freshly built in memory or read back from MongoDB.
export function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'object' && (value as { _bsontype?: string })._bsontype === 'ObjectId') {
    return (value as { toHexString(): string }).toHexString();
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      out[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

/** Sorted keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}
