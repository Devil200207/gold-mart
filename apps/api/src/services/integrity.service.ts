import { env } from '../config/env';
import { IntegrityCheck, IntegrityCheckDoc, IntegrityFailure } from '../models';
import { computeEntryHash, GENESIS_HASH, getChainHead, listAccounts, streamAllEntries } from './ledger.service';

const MAX_FAILURES = 200;

/**
 * 1. Walk the ledger in seq order: recompute every hash, check prevHash links and seq has no gaps.
 * 2. Per user, the sum of deltas must equal the cached account balances.
 * 3. Total gold owed to users must not exceed physical stock.
 */
export async function runIntegrityCheck(trigger: IntegrityCheckDoc['trigger']): Promise<IntegrityCheckDoc> {
  const startedAt = new Date();
  const failures: IntegrityFailure[] = [];
  const add = (f: IntegrityFailure) => {
    if (failures.length < MAX_FAILURES) failures.push(f);
  };

  let expectedSeq = 1;
  let prevHash = GENESIS_HASH;
  let entriesChecked = 0;
  let lastSeq = 0;
  const sums = new Map<string, { availableMg: number; lockedMg: number }>();

  for await (const e of streamAllEntries()) {
    entriesChecked++;
    if (e.seq !== expectedSeq) {
      add({ check: 'SEQ', seq: e.seq, message: e.seq > expectedSeq ? `Gap: seq ${expectedSeq}–${e.seq - 1} missing` : `Duplicate or out-of-order seq ${e.seq}` });
    }
    if (e.prevHash !== prevHash) add({ check: 'HASH', seq: e.seq, message: `prevHash does not link to entry ${e.seq - 1}` });
    if (computeEntryHash(e) !== e.hash) add({ check: 'HASH', seq: e.seq, message: `Entry ${e.seq} content does not match its hash (tampered)` });

    const uid = e.userId.toHexString();
    const s = sums.get(uid) ?? { availableMg: 0, lockedMg: 0 };
    s.availableMg += e.availableDeltaMg;
    s.lockedMg += e.lockedDeltaMg;
    sums.set(uid, s);

    prevHash = e.hash;
    lastSeq = e.seq;
    expectedSeq = e.seq + 1;
  }

  const head = await getChainHead();
  if (head && (head.seq !== lastSeq || head.hash !== prevHash)) {
    add({ check: 'CHAIN_HEAD', seq: head.seq, message: `chain_head (seq ${head.seq}) does not match the last entry (seq ${lastSeq})` });
  }

  const accounts = await listAccounts();
  let totalOwedMg = 0;
  for (const a of accounts) {
    const uid = a.userId.toHexString();
    const s = sums.get(uid) ?? { availableMg: 0, lockedMg: 0 };
    if (s.availableMg !== a.availableMg || s.lockedMg !== a.lockedMg) {
      add({
        check: 'BALANCE',
        userId: uid,
        message: `Ledger sums (available ${s.availableMg}, locked ${s.lockedMg}) ≠ account (available ${a.availableMg}, locked ${a.lockedMg})`,
      });
    }
    sums.delete(uid);
    totalOwedMg += a.availableMg + a.lockedMg;
  }
  for (const [uid] of sums) add({ check: 'BALANCE', userId: uid, message: 'Ledger entries exist for a user without an account' });

  if (totalOwedMg > env.PHYSICAL_STOCK_MG) {
    add({ check: 'STOCK', message: `Gold owed to users (${totalOwedMg} mg) exceeds physical stock (${env.PHYSICAL_STOCK_MG} mg)` });
  }

  const doc = await IntegrityCheck.create({
    ok: failures.length === 0,
    trigger,
    startedAt,
    finishedAt: new Date(),
    entriesChecked,
    lastSeq,
    usersChecked: accounts.length,
    totalOwedMg,
    physicalStockMg: env.PHYSICAL_STOCK_MG,
    failures,
  });
  if (failures.length && process.env.NODE_ENV !== 'test') console.error(`[integrity] FAILED with ${failures.length} problem(s)`, failures.slice(0, 5));
  return doc.toObject() as IntegrityCheckDoc;
}

export async function latestIntegrityCheck(): Promise<IntegrityCheckDoc | null> {
  return (await IntegrityCheck.findOne().sort({ finishedAt: -1 }).lean()) as IntegrityCheckDoc | null;
}
