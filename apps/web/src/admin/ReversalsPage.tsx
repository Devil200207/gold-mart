import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type Reversal, type ReversalRequestBody, type ReversalStatus } from '../lib/api';
import { useAdmin, useAdminAuth } from '../lib/adminAuth';
import { useAction, useLoader } from '../lib/hooks';
import { formatSignedMg, parseSignedGramsToMg, sanitizeDecimalInput } from '../lib/units';
import { formatDateTime, shortId } from '../lib/labels';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Input, Textarea } from '../components/Input';
import { Banner } from '../components/Banner';
import { ReversalStatusBadge } from '../components/Badge';
import { ConfirmDialog } from '../components/Modal';
import { AdminPageHeader, RoleNote } from './AdminLayout';
import { EmptyRow, LoadingRows, Table, Td, Th } from './Table';

const TABS: { value: ReversalStatus | ''; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: '', label: 'All' },
];

type Decision = { kind: 'approve' | 'reject'; reversal: Reversal };

export function ReversalsPage() {
  const admin = useAdmin();
  const { hasRole } = useAdminAuth();
  const isFinance = hasRole('FINANCE');
  const [status, setStatus] = useState<ReversalStatus | ''>('PENDING');
  const list = useLoader(() => adminApi.reversals(status), [status]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const decide = useAction(async (key, d: Decision) => {
    const updated =
      d.kind === 'approve' ? await adminApi.approveReversal(d.reversal.id, key) : await adminApi.rejectReversal(d.reversal.id, key);
    setNotice(
      updated.status === 'APPROVED'
        ? `Reversal approved and posted${updated.postedSeq !== null ? ` as ledger seq ${updated.postedSeq}` : ''}.`
        : 'Reversal rejected.',
    );
    setDecision(null);
    await list.refresh();
  });

  return (
    <div>
      <AdminPageHeader
        title="Reversals"
        subtitle="Corrections are new REVERSAL entries, requested by one finance admin and approved by another"
        right={!isFinance ? <RoleNote role="FINANCE" /> : undefined}
      />

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        {isFinance ? (
          <RequestForm
            onCreated={(r) => {
              setNotice(`Reversal requested for seq ${r.targetSeq}. Another finance admin must approve it.`);
              setStatus('PENDING');
              void list.refresh();
            }}
          />
        ) : (
          <Card>
            <CardTitle>Request a reversal</CardTitle>
            <p className="text-sm text-stone-500">Only admins with the FINANCE role can request or decide reversals.</p>
          </Card>
        )}

        <div className="min-w-0">
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-stone-200/80">
            {TABS.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setStatus(t.value)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  status === t.value ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {notice && (
            <Banner tone="success" className="mb-4">
              {notice}
            </Banner>
          )}
          {decide.error && !decision && (
            <Banner tone="error" className="mb-4">
              {decide.error.message}
            </Banner>
          )}
          {list.error && (
            <Banner tone="error" className="mb-4">
              {list.error.message}
            </Banner>
          )}

          <Table minWidth={1020}>
            <thead>
              <tr>
                <Th>Requested</Th>
                <Th>Target seq</Th>
                <Th>User</Th>
                <Th className="text-right">Available Δ</Th>
                <Th className="text-right">Locked Δ</Th>
                <Th>Reason</Th>
                <Th>Requested by</Th>
                <Th>Status</Th>
                <Th className="text-right">Decision</Th>
              </tr>
            </thead>
            <tbody>
              {list.loading && !list.data ? (
                <LoadingRows colSpan={9} />
              ) : (list.data?.items.length ?? 0) === 0 ? (
                <EmptyRow colSpan={9}>No reversal requests.</EmptyRow>
              ) : (
                list.data?.items.map((r) => {
                  const isRequester = r.requestedBy.id === admin.id;
                  return (
                    <tr key={r.id} className="hover:bg-stone-50">
                      <Td className="whitespace-nowrap text-xs" title={r.id}>
                        {formatDateTime(r.createdAt)}
                        <span className="block font-mono text-[10px] text-stone-400">{shortId(r.id)}</span>
                      </Td>
                      <Td className="font-mono text-xs font-semibold">{r.targetSeq}</Td>
                      <Td className="max-w-[180px]">
                        <Link to={`/admin/users/${r.userId}`} className="block truncate text-stone-900 hover:text-amber-700">
                          {r.userEmail ?? r.userId}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">{formatSignedMg(r.availableDeltaMg)}</Td>
                      <Td className="whitespace-nowrap text-right tabular-nums">{formatSignedMg(r.lockedDeltaMg)}</Td>
                      <Td className="max-w-[240px] text-xs">
                        <span className="line-clamp-3" title={r.reason}>
                          {r.reason}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {r.requestedBy.username}
                        {isRequester && <span className="ml-1 text-xs text-stone-400">(you)</span>}
                      </Td>
                      <Td>
                        <ReversalStatusBadge status={r.status} />
                        {r.status !== 'PENDING' && (
                          <span className="mt-1 block whitespace-nowrap text-[11px] text-stone-500">
                            by {(r.approvedBy ?? r.rejectedBy)?.username ?? '—'}
                            {r.decidedAt ? ` · ${formatDateTime(r.decidedAt)}` : ''}
                            {r.postedSeq !== null ? ` · seq ${r.postedSeq}` : ''}
                          </span>
                        )}
                      </Td>
                      <Td className="text-right">
                        {r.status !== 'PENDING' ? (
                          <span className="text-xs text-stone-400">—</span>
                        ) : !isFinance ? (
                          <span className="text-xs text-stone-400">FINANCE only</span>
                        ) : isRequester ? (
                          <span className="whitespace-nowrap text-xs font-medium text-amber-700">Awaiting another finance admin</span>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="dark"
                              disabled={decide.pending}
                              onClick={() => {
                                decide.clearError();
                                setNotice(null);
                                setDecision({ kind: 'approve', reversal: r });
                              }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={decide.pending}
                              onClick={() => {
                                decide.clearError();
                                setNotice(null);
                                setDecision({ kind: 'reject', reversal: r });
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>
      </div>

      <ConfirmDialog
        open={decision !== null}
        title={decision?.kind === 'approve' ? 'Approve and post reversal?' : 'Reject reversal?'}
        confirmLabel={decision?.kind === 'approve' ? 'Approve & post' : 'Reject'}
        tone={decision?.kind === 'approve' ? 'dark' : 'danger'}
        busy={decide.pending}
        error={decision && decide.error ? decide.error.message : null}
        onCancel={() => {
          if (!decide.pending) setDecision(null);
        }}
        onConfirm={() => decision && void decide.run(decision)}
      >
        {decision && (
          <>
            <p>
              Target seq <span className="font-mono font-semibold">{decision.reversal.targetSeq}</span> for{' '}
              {decision.reversal.userEmail ?? decision.reversal.userId}, requested by {decision.reversal.requestedBy.username}.
            </p>
            <p className="rounded-lg bg-stone-50 px-3 py-2 font-mono text-xs">
              available {formatSignedMg(decision.reversal.availableDeltaMg)} · locked {formatSignedMg(decision.reversal.lockedDeltaMg)}
            </p>
            <p className="text-xs italic text-stone-500">“{decision.reversal.reason}”</p>
            {decision.kind === 'approve' && (
              <p>This posts a new REVERSAL ledger entry. Existing entries are never edited.</p>
            )}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

function RequestForm({ onCreated }: { onCreated(r: Reversal): void }) {
  const [targetSeq, setTargetSeq] = useState('');
  const [available, setAvailable] = useState('');
  const [locked, setLocked] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const submit = useAction(async (key, body: ReversalRequestBody) => {
    const r = await adminApi.requestReversal(body, key);
    setTargetSeq('');
    setAvailable('');
    setLocked('');
    setReason('');
    setTouched(false);
    onCreated(r);
  });

  const seq = /^\d+$/.test(targetSeq.trim()) ? Number(targetSeq.trim()) : null;
  const availableMg = available.trim() === '' ? 0 : parseSignedGramsToMg(available);
  const lockedMg = locked.trim() === '' ? 0 : parseSignedGramsToMg(locked);

  const errors = {
    targetSeq: seq === null || seq < 1 || !Number.isSafeInteger(seq) ? 'Enter the ledger seq to correct' : null,
    available: availableMg === null ? 'Grams with up to 3 decimals, e.g. -0.250' : null,
    locked: lockedMg === null ? 'Grams with up to 3 decimals, e.g. 1.000' : null,
    deltas: availableMg === 0 && lockedMg === 0 ? 'At least one delta must be non-zero' : null,
    reason: reason.trim().length < 5 ? 'Explain why this correction is needed' : null,
  };
  const valid = Object.values(errors).every((e) => e === null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || seq === null || availableMg === null || lockedMg === null) return;
    void submit.run({ targetSeq: seq, availableDeltaMg: availableMg, lockedDeltaMg: lockedMg, reason: reason.trim() });
  };

  return (
    <Card className="h-fit">
      <CardTitle>Request a reversal</CardTitle>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Target ledger seq"
          inputMode="numeric"
          value={targetSeq}
          onChange={(e) => setTargetSeq(e.target.value.replace(/\D/g, ''))}
          error={touched ? errors.targetSeq : null}
          className="font-mono"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Available Δ (g)"
            inputMode="decimal"
            placeholder="-0.250"
            value={available}
            onChange={(e) => setAvailable(sanitizeDecimalInput(e.target.value, true))}
            error={touched ? errors.available : null}
            className="font-mono"
          />
          <Input
            label="Locked Δ (g)"
            inputMode="decimal"
            placeholder="0.000"
            value={locked}
            onChange={(e) => setLocked(sanitizeDecimalInput(e.target.value, true))}
            error={touched ? errors.locked : null}
            className="font-mono"
          />
        </div>
        {availableMg !== null && lockedMg !== null && (availableMg !== 0 || lockedMg !== 0) && (
          <p className="rounded-lg bg-stone-50 px-3 py-2 font-mono text-xs text-stone-600">
            available {formatSignedMg(availableMg)} ({availableMg} mg) · locked {formatSignedMg(lockedMg)} ({lockedMg} mg)
          </p>
        )}
        {touched && errors.deltas && <p className="text-xs font-medium text-red-600">{errors.deltas}</p>}
        <Textarea
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={touched ? errors.reason : null}
          placeholder="e.g. Duplicate credit on seq 42 confirmed with gateway statement #123"
        />
        {submit.error && <Banner tone="error">{submit.error.message}</Banner>}
        <Button type="submit" variant="dark" fullWidth loading={submit.pending}>
          Submit for approval
        </Button>
        <p className="text-xs text-stone-500">A different FINANCE admin must approve before anything is posted.</p>
      </form>
    </Card>
  );
}
