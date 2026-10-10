import { ethers } from 'ethers';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { merkleProof, merkleRoot } from '../lib/merkle';
import { Anchor, AnchorDoc } from '../models';
import { entriesInSeqRange, findEntryBySeq, seqRangeForPeriod } from './ledger.service';

export const explorerUrl = (txHash: string | null) => (txHash ? `${env.ANCHOR_EXPLORER_TX_URL}${txHash}` : null);

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export function previousUtcDay(now = new Date()): string {
  return utcDay(new Date(now.getTime() - 86_400_000));
}

/**
 * Builds a Merkle root over the hashes of all entries created on `date` (UTC) and, when
 * ANCHOR_ENABLED=true, publishes `GOLDLEDGER:<date>:<firstSeq>:<lastSeq>:<root>` as the data of a
 * zero-value self-transaction on Polygon Amoy. With anchoring disabled the root is still stored
 * (status LOCAL_ONLY) so /verify works offline.
 */
export async function runDailyAnchor(date: string = previousUtcDay()): Promise<AnchorDoc | null> {
  const existing = await Anchor.findOne({ date }).lean();
  if (existing) return existing as AnchorDoc;

  const from = new Date(`${date}T00:00:00.000Z`);
  const range = await seqRangeForPeriod(from, new Date(from.getTime() + 86_400_000));
  if (!range) return null;
  const entries = await entriesInSeqRange(range.firstSeq, range.lastSeq);
  const root = merkleRoot(entries.map((e) => e.hash));

  let status: AnchorDoc['status'] = 'LOCAL_ONLY';
  let txHash: string | null = null;
  let error: string | null = null;
  if (env.ANCHOR_ENABLED) {
    try {
      const provider = new ethers.JsonRpcProvider(env.ANCHOR_RPC_URL);
      const wallet = new ethers.Wallet(env.ANCHOR_PRIVATE_KEY, provider);
      const data = ethers.hexlify(ethers.toUtf8Bytes(`GOLDLEDGER:${date}:${range.firstSeq}:${range.lastSeq}:${root}`));
      const tx = await wallet.sendTransaction({ to: wallet.address, value: 0n, data });
      txHash = tx.hash;
      status = 'SENT';
    } catch (err) {
      status = 'FAILED';
      error = (err as Error).message.slice(0, 500);
    }
  }
  const doc = await Anchor.create({ date, ...range, entryCount: entries.length, merkleRoot: root, status, txHash, error });
  return doc.toObject() as AnchorDoc;
}

export async function latestAnchors(limit = 10): Promise<AnchorDoc[]> {
  return (await Anchor.find().sort({ date: -1 }).limit(limit).lean()) as AnchorDoc[];
}

/** Public proof that an entry is included in an anchored Merkle root. */
export async function verifyEntry(seq: number) {
  const entry = await findEntryBySeq(seq);
  if (!entry) throw new AppError('NOT_FOUND', `Ledger entry ${seq} not found`);
  const anchor = (await Anchor.findOne({ firstSeq: { $lte: seq }, lastSeq: { $gte: seq } }).lean()) as AnchorDoc | null;
  if (!anchor) return { seq, hash: entry.hash, anchor: null, proof: [] };
  const entries = await entriesInSeqRange(anchor.firstSeq, anchor.lastSeq);
  const index = entries.findIndex((e) => e.seq === seq);
  return { seq, hash: entry.hash, anchor, proof: merkleProof(entries.map((e) => e.hash), index) };
}
