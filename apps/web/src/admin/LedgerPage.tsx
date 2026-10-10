import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi, ENTRY_TYPES, type AdminLedgerQuery, type EntryType } from '../lib/api';
import { useLoader } from '../lib/hooks';
import { usePrice } from '../lib/price';
import { formatMg, formatMoney, formatSignedMg } from '../lib/units';
import { ENTRY_TYPE_LABEL, formatDateTime, shortHash } from '../lib/labels';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { Banner } from '../components/Banner';
import { Badge } from '../components/Badge';
import { Pagination } from '../components/Pagination';
import { AdminPageHeader } from './AdminLayout';
import { EmptyRow, FilterBar, LoadingRows, Mono, Table, Td, Th } from './Table';

const PAGE_SIZE = 50;

interface Filters {
  userId: string;
  type: EntryType | '';
  from: string;
  to: string;
}

export function LedgerPage() {
  const [searchParams] = useSearchParams();
  const initial: Filters = {
    userId: searchParams.get('userId') ?? '',
    type: (searchParams.get('type') as EntryType | null) ?? '',
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
  };
  const [draft, setDraft] = useState<Filters>(initial);
  const [filters, setFilters] = useState<Filters>(initial);
  const [page, setPage] = useState(1);
  const { decimals, currency } = usePrice();

  const query: AdminLedgerQuery = {
    userId: filters.userId.trim() || undefined,
    type: filters.type || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const ledger = useLoader(() => adminApi.ledger(query), [filters, page]);

  const apply = () => {
    setPage(1);
    setFilters({ ...draft });
  };

  return (
    <div>
      <AdminPageHeader title="Ledger" subtitle="Append-only, hash-chained record of every gold movement" />

      <FilterBar onSubmit={apply}>
        <Input
          label="User ID"
          placeholder="ObjectId"
          value={draft.userId}
          onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
          className="font-mono text-xs"
        />
        <Select label="Type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as EntryType | '' })}>
          <option value="">All types</option>
          {ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Input label="From" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        <Input label="To" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        <div className="flex gap-2">
          <Button type="submit" variant="dark" className="flex-1">
            Apply
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const empty: Filters = { userId: '', type: '', from: '', to: '' };
              setDraft(empty);
              setFilters(empty);
              setPage(1);
            }}
          >
            Reset
          </Button>
        </div>
      </FilterBar>

      {ledger.error && (
        <Banner tone="error" className="mb-4">
          {ledger.error.message}
        </Banner>
      )}

      <Table minWidth={1240}>
        <thead>
          <tr>
            <Th>Seq</Th>
            <Th>Time</Th>
            <Th>User</Th>
            <Th>Type</Th>
            <Th className="text-right">Available Δ</Th>
            <Th className="text-right">Locked Δ</Th>
            <Th className="text-right">Amount</Th>
            <Th className="text-right">Balance after</Th>
            <Th>Hash</Th>
            <Th>Prev hash</Th>
            <Th>Created by</Th>
          </tr>
        </thead>
        <tbody className={ledger.loading && ledger.data ? 'opacity-60' : ''}>
          {ledger.loading && !ledger.data ? (
            <LoadingRows colSpan={11} />
          ) : (ledger.data?.items.length ?? 0) === 0 ? (
            <EmptyRow colSpan={11}>No entries match these filters.</EmptyRow>
          ) : (
            ledger.data?.items.map((e) => (
              <tr key={e.seq} className="hover:bg-stone-50">
                <Td className="font-mono text-xs font-semibold text-stone-900">{e.seq}</Td>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt)}</Td>
                <Td className="max-w-[200px]">
                  <Link to={`/admin/users/${e.userId}`} className="block truncate text-stone-900 hover:text-amber-700" title={e.userId}>
                    {e.userEmail ?? e.userId}
                  </Link>
                </Td>
                <Td>
                  <Badge tone={e.type === 'REVERSAL' ? 'red' : e.type === 'BUY' ? 'green' : 'gray'} title={ENTRY_TYPE_LABEL[e.type]}>
                    {e.type}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-right tabular-nums">{e.availableDeltaMg ? formatSignedMg(e.availableDeltaMg) : '—'}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums">{e.lockedDeltaMg ? formatSignedMg(e.lockedDeltaMg) : '—'}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums">
                  {e.amountMinor !== null ? formatMoney(e.amountMinor, e.currency ?? currency, decimals) : '—'}
                </Td>
                <Td className="whitespace-nowrap text-right text-xs tabular-nums" title="available / locked">
                  {formatMg(e.balanceAfter.availableMg)} / {formatMg(e.balanceAfter.lockedMg)}
                </Td>
                <Td>
                  <Mono title={e.hash}>{shortHash(e.hash)}</Mono>
                </Td>
                <Td>
                  <Mono title={e.prevHash}>{shortHash(e.prevHash)}</Mono>
                </Td>
                <Td className="whitespace-nowrap text-xs" title={e.idempotencyKey}>
                  {e.createdBy}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {ledger.data && (
        <Pagination page={ledger.data.page} pageSize={ledger.data.pageSize} total={ledger.data.total} onPage={setPage} disabled={ledger.loading} />
      )}
    </div>
  );
}
