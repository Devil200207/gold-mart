import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, DELIVERY_STATUSES, type Anchor, type IntegrityResult } from '../lib/api';
import { useAction, useLoader } from '../lib/hooks';
import { formatMg, intDiv } from '../lib/units';
import { DELIVERY_STATUS_LABEL, formatDateTime, shortHash } from '../lib/labels';
import { Card, CardTitle, Row } from '../components/Card';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { Badge, DeliveryStatusBadge } from '../components/Badge';
import { SkeletonCard } from '../components/Skeleton';
import { RefreshIcon } from '../components/icons';
import { AdminPageHeader, useIntegrity } from './AdminLayout';

export function DashboardPage() {
  const dashboard = useLoader(() => adminApi.dashboard(), []);
  const { refreshIntegrity } = useIntegrity();

  const run = useAction(async (key) => {
    await adminApi.runIntegrity(key);
    await Promise.all([dashboard.refresh(), refreshIntegrity()]);
  });

  const d = dashboard.data;

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        subtitle="Gold owed to users, physical backing and ledger health"
        right={
          <Button variant="secondary" onClick={() => void dashboard.reload()} disabled={dashboard.loading}>
            <RefreshIcon className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {dashboard.error && (
        <Banner tone="error" className="mb-4">
          {dashboard.error.message}
        </Banner>
      )}

      {!d && dashboard.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      ) : d ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Total gold owed"
              value={`${formatMg(d.totalOwedMg)} g`}
              sub={`${formatMg(d.totalAvailableMg)} g available + ${formatMg(d.totalLockedMg)} g locked`}
            />
            <Stat label="Total locked" value={`${formatMg(d.totalLockedMg)} g`} sub="Reserved for deliveries" />
            <Stat label="Users" value={String(d.userCount)} sub={<Link to="/admin/users" className="text-amber-700 hover:underline">View users</Link>} />
            <Stat
              label="Pending reversals"
              value={String(d.pendingReversals)}
              sub={<Link to="/admin/reversals" className="text-amber-700 hover:underline">Review</Link>}
              highlight={d.pendingReversals > 0}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StockCard owedMg={d.totalOwedMg} stockMg={d.physicalStockMg} />
            <Card>
              <CardTitle action={<Link to="/admin/deliveries" className="text-xs font-semibold text-amber-700 hover:underline">Open queue</Link>}>
                Deliveries by status
              </CardTitle>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DELIVERY_STATUSES.map((s) => (
                  <Link
                    key={s}
                    to={`/admin/deliveries?status=${s}`}
                    className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 hover:bg-stone-100"
                    title={DELIVERY_STATUS_LABEL[s]}
                  >
                    <DeliveryStatusBadge status={s} />
                    <span className="font-semibold tabular-nums text-stone-900">{d.deliveriesByStatus?.[s] ?? 0}</span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <IntegrityCard result={d.lastIntegrity} onRun={() => void run.run()} running={run.pending} error={run.error?.message ?? null} />
            <AnchorCard anchor={d.lastAnchor} enabled={d.anchorEnabled} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub, highlight = false }: { label: string; value: string; sub?: ReactNode; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'ring-2 ring-amber-400' : ''}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-stone-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
    </Card>
  );
}

function StockCard({ owedMg, stockMg }: { owedMg: number; stockMg: number }) {
  const covered = owedMg <= stockMg;
  // Integer percentage (display only): owed * 100 / stock, floored.
  const pct = stockMg > 0 ? Math.min(100, intDiv(owedMg * 100, stockMg)) : 100;
  const headroom = stockMg - owedMg;
  return (
    <Card>
      <CardTitle action={covered ? <Badge tone="green">Fully backed</Badge> : <Badge tone="red">Shortfall</Badge>}>
        Physical stock vs owed
      </CardTitle>
      <div className="mb-3 h-3 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full ${covered ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <dl className="divide-y divide-stone-100">
        <Row label="Physical stock" value={`${formatMg(stockMg)} g`} />
        <Row label="Owed to users" value={`${formatMg(owedMg)} g`} />
        <Row
          label={covered ? 'Headroom' : 'Shortfall'}
          value={<span className={covered ? 'text-emerald-600' : 'text-red-600'}>{formatMg(Math.abs(headroom))} g</span>}
          strong
        />
        <Row label="Utilisation" value={`${pct}%`} muted />
      </dl>
    </Card>
  );
}

function IntegrityCard({
  result,
  onRun,
  running,
  error,
}: {
  result: IntegrityResult | null;
  onRun(): void;
  running: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <CardTitle
        action={result ? result.ok ? <Badge tone="green">PASS</Badge> : <Badge tone="red">FAIL</Badge> : <Badge>Never run</Badge>}
      >
        Last integrity check
      </CardTitle>
      {result ? (
        <dl className="divide-y divide-stone-100">
          <Row label="Finished" value={formatDateTime(result.finishedAt)} />
          <Row label="Trigger" value={result.trigger} />
          <Row label="Entries checked" value={`${result.entriesChecked} (up to seq ${result.lastSeq})`} />
          <Row label="Users checked" value={result.usersChecked} />
          <Row label="Owed vs stock" value={`${formatMg(result.totalOwedMg)} g / ${formatMg(result.physicalStockMg)} g`} />
        </dl>
      ) : (
        <p className="text-sm text-stone-500">No integrity check has run yet.</p>
      )}
      {result && result.failures.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-xl bg-red-50 p-3 text-xs text-red-800">
          {result.failures.map((f, i) => (
            <li key={i}>
              <span className="font-semibold">{f.check}</span>
              {f.seq !== undefined ? ` · seq ${f.seq}` : ''}
              {f.userId ? ` · user ${f.userId}` : ''} — {f.message}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <Banner tone="error" className="mt-3">
          {error}
        </Banner>
      )}
      <Button className="mt-4" variant="dark" onClick={onRun} loading={running}>
        Run integrity check now
      </Button>
    </Card>
  );
}

function AnchorCard({ anchor, enabled }: { anchor: Anchor | null; enabled: boolean }) {
  const tone = anchor?.status === 'SENT' ? 'green' : anchor?.status === 'FAILED' ? 'red' : 'gray';
  return (
    <Card>
      <CardTitle action={anchor ? <Badge tone={tone}>{anchor.status}</Badge> : undefined}>Last blockchain anchor</CardTitle>
      {!enabled && (
        <p className="mb-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
          On-chain anchoring is disabled (ANCHOR_ENABLED=false); daily Merkle roots are stored locally.
        </p>
      )}
      {anchor ? (
        <dl className="divide-y divide-stone-100">
          <Row label="Date" value={anchor.date} />
          <Row label="Seq range" value={`${anchor.firstSeq} – ${anchor.lastSeq} (${anchor.entryCount} entries)`} />
          <Row label="Merkle root" value={<span className="font-mono text-xs" title={anchor.merkleRoot}>{shortHash(anchor.merkleRoot, 18)}</span>} />
          <Row
            label="Transaction"
            value={
              anchor.explorerUrl ? (
                <a href={anchor.explorerUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-amber-700 hover:underline" title={anchor.txHash ?? ''}>
                  {shortHash(anchor.txHash, 14)} ↗
                </a>
              ) : (
                <span className="font-mono text-xs" title={anchor.txHash ?? ''}>{shortHash(anchor.txHash, 14)}</span>
              )
            }
          />
          {anchor.error && <Row label="Error" value={<span className="text-red-600">{anchor.error}</span>} />}
        </dl>
      ) : (
        <p className="text-sm text-stone-500">No anchor has been created yet.</p>
      )}
    </Card>
  );
}
