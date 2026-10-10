// Rule 1: only services/ledger.service.ts may write accounts, ledger_entries or chain_head.
// Fails if any other source file imports the ledger models or touches those collections by name.
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', 'src');
const ALLOWED = new Set(['services/ledger.service.ts', 'models/ledger.models.ts', 'scripts/db-schema.ts']);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name.startsWith('._')) return [];
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('only ledger.service.ts imports the ledger models or names the ledger collections', () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    const code = fs.readFileSync(file, 'utf8');
    if (/from\s+['"][^'"]*ledger\.models['"]/.test(code) || /require\(\s*['"][^'"]*ledger\.models['"]\s*\)/.test(code)) {
      offenders.push(`${rel}: imports ledger.models`);
    }
    if (/['"`](ledger_entries|accounts|chain_head)['"`]/.test(code)) offenders.push(`${rel}: references a ledger collection by name`);
    if (/\b(LedgerEntry|Account|ChainHead)\s*\.\s*(create|insert\w*|update\w*|replace\w*|delete\w*|findOneAnd\w*|bulkWrite|collection)\b/.test(code)) {
      offenders.push(`${rel}: calls a write method on a ledger model`);
    }
  }
  expect(offenders).toEqual([]);
});
