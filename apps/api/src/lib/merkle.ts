import crypto from 'crypto';

// Binary Merkle tree over 32-byte leaf hashes. Parent = sha256(left || right);
// an odd node at the end of a level is promoted unchanged.

const h = (a: Buffer, b: Buffer) => crypto.createHash('sha256').update(Buffer.concat([a, b])).digest();

export interface ProofStep {
  position: 'left' | 'right';
  hash: string;
}

function levels(leavesHex: string[]): Buffer[][] {
  if (leavesHex.length === 0) throw new Error('no leaves');
  const out: Buffer[][] = [leavesHex.map((x) => Buffer.from(x, 'hex'))];
  while (out[out.length - 1].length > 1) {
    const cur = out[out.length - 1];
    const next: Buffer[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? h(cur[i], cur[i + 1]) : cur[i]);
    out.push(next);
  }
  return out;
}

export function merkleRoot(leavesHex: string[]): string {
  const l = levels(leavesHex);
  return l[l.length - 1][0].toString('hex');
}

export function merkleProof(leavesHex: string[], index: number): ProofStep[] {
  const l = levels(leavesHex);
  const proof: ProofStep[] = [];
  let i = index;
  for (let d = 0; d < l.length - 1; d++) {
    const level = l[d];
    const sibling = i % 2 === 0 ? i + 1 : i - 1;
    if (sibling < level.length) proof.push({ position: i % 2 === 0 ? 'right' : 'left', hash: level[sibling].toString('hex') });
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyProof(leafHex: string, proof: ProofStep[], rootHex: string): boolean {
  let acc = Buffer.from(leafHex, 'hex');
  for (const step of proof) {
    const sib = Buffer.from(step.hash, 'hex');
    acc = step.position === 'right' ? h(acc, sib) : h(sib, acc);
  }
  return acc.toString('hex') === rootHex;
}
