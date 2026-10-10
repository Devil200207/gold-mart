import { useEffect, useState, type ReactElement } from 'react';
import { api, errorMessage, type EntryType, type LedgerEntry } from '../lib/api';
import { useLoader } from '../lib/hooks';
import { usePrice } from '../lib/price';
import { formatMoney, formatSignedMg } from '../lib/units';
import { ENTRY_TYPE_LABEL, formatDateTime } from '../lib/labels';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button, LinkButton } from '../components/Button';
import { Banner } from '../components/Banner';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import { EmptyState, Skeleton } from '../components/Skeleton';
import { CenteredSpinner } from '../components/Spinner';
import { BuyIcon, DeliverIcon, DownloadIcon, LockIcon, ReceiptIcon, SellIcon, ShieldIcon } from '../components/icons';

const PAGE_SIZE = 20;

const TYPE_STYLE: Record<EntryType, { bg: string; icon: ReactElement }> = {
  BUY: { bg: 'bg-emerald-50 text-emerald-600', icon: <BuyIcon className="h-5 w-5" /> },
  SELL: { bg: 'bg-sky-50 text-sky-600', icon: <SellIcon className="h-5 w-5" /> },
  DELIVERY_LOCK: { bg: 'bg-amber-50 text-amber-600', icon: <LockIcon className="h-5 w-5" /> },
  DELIVERY_RELEASE: { bg: 'bg-stone-100 text-stone-600', icon: <LockIcon className="h-5 w-5" /> },
  DELIVERY_COMPLETE: { bg: 'bg-violet-50 text-violet-600', icon: <DeliverIcon className="h-5 w-5" /> },
  REVERSAL: { bg: 'bg-red-50 text-red-600', icon: <ShieldIcon className="h-5 w-5" /> },
};

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const list = useLoader(() => api.listTransactions(page, PAGE_SIZE), [page]);
  const [receiptSeq, setReceiptSeq] = useState<number | null>(null);
  const { decimals, currency } = usePrice();

  const items = list.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="History" subtitle="Every change to your gold balance" />

      {list.error && (
        <Banner
          tone="error"
          action={
            <Button size="sm" variant="secondary" onClick={() => void list.reload()}>
              Retry
            </Button>
          }
        >
          {list.error.message}
        </Banner>
      )}

      {list.loading && !list.data ? (
        <Card padded={false}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-stone-100 px-4 py-4 last:border-0">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : items.length === 0 && !list.error ? (
        <EmptyState
          title="No transactions yet"
          action={
            <LinkButton to="/buy" size="sm">
              Buy your first gram
            </LinkButton>
          }
        >
          Purchases, sales and deliveries will show up here with a downloadable receipt.
        </EmptyState>
      ) : (
        <>
          <Card padded={false} className={list.loading ? 'opacity-60 transition-opacity' : ''}>
            <ul className="divide-y divide-stone-100">
              {items.map((entry) => (
                <EntryRow
                  key={entry.seq}
                  entry={entry}
                  decimals={decimals}
                  fallbackCurrency={currency}
                  onOpen={() => setReceiptSeq(entry.seq)}
                />
              ))}
            </ul>
          </Card>
          {list.data && (
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              onPage={setPage}
              disabled={list.loading}
              newerOlder
            />
          )}
        </>
      )}

      <ReceiptModal seq={receiptSeq} onClose={() => setReceiptSeq(null)} />
    </div>
  );
}

function EntryRow({
  entry,
  decimals,
  fallbackCurrency,
  onOpen,
}: {
  entry: LedgerEntry;
  decimals: number;
  fallbackCurrency: string;
  onOpen(): void;
}) {
  const style = TYPE_STYLE[entry.type];
  const hasAvailable = entry.availableDeltaMg !== 0;
  const hasLocked = entry.lockedDeltaMg !== 0;
  const primaryDelta = hasAvailable ? entry.availableDeltaMg : entry.lockedDeltaMg;
  const primaryLabel = hasAvailable ? null : 'locked';

  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-stone-50">
        <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${style.bg}`}>{style.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-stone-900">{ENTRY_TYPE_LABEL[entry.type]}</span>
          <span className="block text-xs text-stone-500">
            {formatDateTime(entry.createdAt)}
            {entry.amountMinor !== null && (
              <> · {formatMoney(entry.amountMinor, entry.currency ?? fallbackCurrency, decimals)}</>
            )}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <span
            className={`text-sm font-semibold tabular-nums ${
              primaryDelta > 0 ? 'text-emerald-600' : primaryDelta < 0 ? 'text-stone-900' : 'text-stone-500'
            }`}
          >
            {formatSignedMg(primaryDelta)}
            {primaryLabel && <span className="ml-1 text-[10px] font-medium uppercase text-stone-400">{primaryLabel}</span>}
          </span>
          {hasAvailable && hasLocked && (
            <span className="text-[11px] tabular-nums text-stone-500">
              {formatSignedMg(entry.lockedDeltaMg)} <span className="uppercase">locked</span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function ReceiptModal({ seq, onClose }: { seq: number | null; onClose(): void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setHtml(null);
    setError(null);
    setDownloadError(null);
    if (seq === null) return undefined;
    let cancelled = false;
    api
      .getReceiptHtml(seq)
      .then((text) => {
        if (!cancelled) setHtml(text);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [seq]);

  const download = async () => {
    if (seq === null || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await api.downloadReceipt(seq);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${seq}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setDownloadError(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={seq !== null}
      title={
        <span className="flex items-center gap-2">
          <ReceiptIcon className="h-5 w-5 text-amber-600" /> Receipt #{seq}
        </span>
      }
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => void download()} loading={downloading} disabled={!html}>
            <DownloadIcon className="h-4 w-4" /> Download
          </Button>
        </>
      }
    >
      {downloadError && (
        <Banner tone="error" className="mb-3">
          {downloadError}
        </Banner>
      )}
      {error ? (
        <Banner tone="error">{error}</Banner>
      ) : html === null ? (
        <CenteredSpinner label="Loading receipt…" />
      ) : (
        <iframe
          title={`Receipt ${seq ?? ''}`}
          srcDoc={html}
          sandbox=""
          className="h-[60vh] w-full rounded-xl border border-stone-200 bg-white"
        />
      )}
    </Modal>
  );
}
