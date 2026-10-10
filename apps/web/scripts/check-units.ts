// Self-check for src/lib/units.ts. Run with: npm run check:units (Node >= 22.6).
import {
  formatMg,
  formatMoney,
  formatSignedMg,
  intDiv,
  mgToGramsInput,
  parseGramsToMg,
  parseMoneyToMinor,
  parseSignedGramsToMg,
} from '../src/lib/units.ts';

let failures = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// parseGramsToMg
eq(parseGramsToMg('1'), 1000, 'grams 1');
eq(parseGramsToMg('1.5'), 1500, 'grams 1.5');
eq(parseGramsToMg('0.125'), 125, 'grams 0.125');
eq(parseGramsToMg('12.345'), 12345, 'grams 12.345');
eq(parseGramsToMg('0.001'), 1, 'grams 0.001');
eq(parseGramsToMg('.5'), 500, 'grams .5');
eq(parseGramsToMg('10.'), 10000, 'grams 10.');
eq(parseGramsToMg(' 2 '), 2000, 'grams trimmed');
eq(parseGramsToMg('0'), 0, 'grams 0');
eq(parseGramsToMg('1.2345'), null, 'grams 4 decimals');
eq(parseGramsToMg(''), null, 'grams empty');
eq(parseGramsToMg('.'), null, 'grams dot');
eq(parseGramsToMg('-1'), null, 'grams negative');
eq(parseGramsToMg('1e3'), null, 'grams exponent');
eq(parseGramsToMg('1,5'), null, 'grams comma');
eq(parseGramsToMg('abc'), null, 'grams text');
eq(parseGramsToMg('99999999999999999'), null, 'grams overflow');
eq(parseGramsToMg('0.3'), 300, 'grams 0.3 (float trap)');
eq(parseGramsToMg('1.005'), 1005, 'grams 1.005 (float trap)');

// parseSignedGramsToMg
eq(parseSignedGramsToMg('-0.250'), -250, 'signed -0.250');
eq(parseSignedGramsToMg('+1'), 1000, 'signed +1');
eq(parseSignedGramsToMg('−1.5'), -1500, 'signed unicode minus');
eq(parseSignedGramsToMg('-0'), 0, 'signed -0 is 0');
eq(parseSignedGramsToMg('--1'), null, 'signed double minus');

// parseMoneyToMinor
eq(parseMoneyToMinor('12.5', 2), 1250, 'money 12.5');
eq(parseMoneyToMinor('0.1', 2), 10, 'money 0.1');
eq(parseMoneyToMinor('1234.56', 2), 123456, 'money 1234.56');
eq(parseMoneyToMinor('100', 2), 10000, 'money 100');
eq(parseMoneyToMinor('1.005', 2), null, 'money 3 decimals');
eq(parseMoneyToMinor('5', 0), 5, 'money 0 decimals');
eq(parseMoneyToMinor('5.1', 0), null, 'money 0 decimals with fraction');
eq(parseMoneyToMinor('1.234', 3), 1234, 'money 3 decimals currency');

// formatMg
eq(formatMg(5000), '5.000', 'fmt 5000');
eq(formatMg(1), '0.001', 'fmt 1');
eq(formatMg(-250), '-0.250', 'fmt -250');
eq(formatMg(0), '0.000', 'fmt 0');
eq(formatMg(25_000), '25.000', 'fmt 25000');
eq(formatMg(5_000_000), '5,000.000', 'fmt grouped');
eq(formatMg(Number.MAX_SAFE_INTEGER), '9,007,199,254,740.991', 'fmt max safe');
eq(mgToGramsInput(1_234_567), '1234.567', 'input ungrouped');

// formatSignedMg
eq(formatSignedMg(5000), '+5.000 g', 'signed +5');
eq(formatSignedMg(-250), '−0.250 g', 'signed -0.25');
eq(formatSignedMg(0), '0.000 g', 'signed 0');

// formatMoney
eq(formatMoney(123450, 'AED', 2), 'AED 1,234.50', 'money AED');
eq(formatMoney(5, 'AED', 2), 'AED 0.05', 'money 5 fils');
eq(formatMoney(-100, 'AED', 2), '-AED 1.00', 'money negative');
eq(formatMoney(1234, 'JPY', 0), 'JPY 1,234', 'money 0 decimals');
eq(formatMoney(Number.MAX_SAFE_INTEGER, 'AED', 2), 'AED 90,071,992,547,409.91', 'money max safe');

// intDiv
eq(intDiv(10, 3), 3, 'intDiv 10/3');
eq(intDiv(Number.MAX_SAFE_INTEGER, 1000), 9007199254740, 'intDiv max safe');

let threw = false;
try {
  formatMg(1.5);
} catch {
  threw = true;
}
eq(threw, true, 'formatMg rejects non-integers');

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('units.ts: all checks passed');
