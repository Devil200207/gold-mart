/**
 * Integer-only unit helpers.
 *
 * Gold is always integer milligrams (mg). Money is always integer minor units
 * (fils, cents). These helpers convert between user-typed decimal strings and
 * integers using string splitting only, and format integers for display using
 * integer division / modulo. No floating-point arithmetic is ever applied to a
 * gold or money value.
 */

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const groupFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, useGrouping: true });

/**
 * Parses an unsigned decimal string with at most `decimals` fraction digits
 * into an integer of the smallest unit. Returns null for anything invalid.
 */
function parseUnsignedDecimal(raw: string, decimals: number): number | null {
  const input = raw.trim();
  if (input === '') return null;
  const pattern = decimals > 0 ? /^(\d*)(?:\.(\d*))?$/ : /^(\d+)$/;
  const match = pattern.exec(input);
  if (!match) return null;
  const wholePart = match[1] ?? '';
  const fracPart = match[2] ?? '';
  // Require at least one digit somewhere ("." alone is invalid).
  if (wholePart === '' && fracPart === '') return null;
  if (fracPart.length > decimals) return null;

  const whole = BigInt(wholePart === '' ? '0' : wholePart);
  const frac = BigInt(fracPart === '' ? '0' : fracPart.padEnd(decimals, '0'));
  const scale = BigInt(10) ** BigInt(decimals);
  const value = whole * scale + frac;
  if (value > MAX_SAFE) return null;
  return Number(value);
}

/** "1" → 1000, "1.5" → 1500, "0.125" → 125, "12.345" → 12345. Max 3 decimals. */
export function parseGramsToMg(input: string): number | null {
  return parseUnsignedDecimal(input, 3);
}

/** Like parseGramsToMg but also accepts a leading "-" (or "+"), e.g. "-0.250" → -250. */
export function parseSignedGramsToMg(input: string): number | null {
  const trimmed = input.trim().replace(/^−/, '-');
  let sign = 1;
  let rest = trimmed;
  if (rest.startsWith('-')) {
    sign = -1;
    rest = rest.slice(1);
  } else if (rest.startsWith('+')) {
    rest = rest.slice(1);
  }
  const mg = parseUnsignedDecimal(rest, 3);
  if (mg === null) return null;
  return mg === 0 ? 0 : sign * mg;
}

/** "12.5" with 2 decimals → 1250. Returns null for invalid input or too many decimals. */
export function parseMoneyToMinor(input: string, decimals: number): number | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) return null;
  return parseUnsignedDecimal(input, decimals);
}

function assertInteger(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${what} must be a safe integer, got ${String(value)}`);
  }
}

/** Splits a non-negative integer into whole / fraction parts by `scale` without floats. */
function splitInteger(abs: number, scale: number): { whole: number; frac: number } {
  const frac = abs % scale; // exact for integers
  const whole = (abs - frac) / scale; // exact: numerator is a multiple of scale
  return { whole, frac };
}

function pow10(decimals: number): number {
  let scale = 1;
  for (let i = 0; i < decimals; i += 1) scale *= 10;
  return scale;
}

/** 5000 → "5.000", 1 → "0.001", -250 → "-0.250". Whole grams are grouped ("1,250.000"). */
export function formatMg(mg: number): string {
  assertInteger(mg, 'mg');
  const sign = mg < 0 ? '-' : '';
  const { whole, frac } = splitInteger(Math.abs(mg), 1000);
  return `${sign}${groupFormatter.format(whole)}.${String(frac).padStart(3, '0')}`;
}

/** Same as formatMg but ungrouped, suitable for pre-filling an input ("1250.000"). */
export function mgToGramsInput(mg: number): string {
  assertInteger(mg, 'mg');
  const sign = mg < 0 ? '-' : '';
  const { whole, frac } = splitInteger(Math.abs(mg), 1000);
  return `${sign}${String(whole)}.${String(frac).padStart(3, '0')}`;
}

/** "+5.000 g", "−0.250 g" (true minus sign), "0.000 g". */
export function formatSignedMg(mg: number): string {
  assertInteger(mg, 'mg');
  if (mg === 0) return '0.000 g';
  const sign = mg > 0 ? '+' : '−';
  return `${sign}${formatMg(Math.abs(mg))} g`;
}

/** formatMoney(123450, "AED", 2) → "AED 1,234.50"; negatives → "-AED 1.00". */
export function formatMoney(minor: number, currency: string, decimals: number): string {
  assertInteger(minor, 'minor');
  const safeDecimals = Number.isInteger(decimals) && decimals >= 0 && decimals <= 6 ? decimals : 2;
  const sign = minor < 0 ? '-' : '';
  const { whole, frac } = splitInteger(Math.abs(minor), pow10(safeDecimals));
  const major = groupFormatter.format(whole);
  const minorPart = safeDecimals > 0 ? `.${String(frac).padStart(safeDecimals, '0')}` : '';
  return `${sign}${currency} ${major}${minorPart}`;
}

/** Floor division for non-negative integers without floating-point rounding. */
export function intDiv(numerator: number, denominator: number): number {
  assertInteger(numerator, 'numerator');
  assertInteger(denominator, 'denominator');
  if (denominator === 0) throw new Error('division by zero');
  const remainder = numerator % denominator;
  return (numerator - remainder) / denominator;
}

/** Keeps only characters that can be part of a decimal number while typing. */
export function sanitizeDecimalInput(value: string, allowNegative = false): string {
  const cleaned = value.replace(allowNegative ? /[^\d.\-−]/g : /[^\d.]/g, '');
  return cleaned.replace(/−/g, '-');
}
