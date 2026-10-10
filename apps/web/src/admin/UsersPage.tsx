import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, type AdminDelivery, type LedgerEntry } from '../lib/api';
import { useLoader } from '../lib/hooks';
import { usePrice } from '../lib/price';
import { formatMg, formatMoney, formatSignedMg } from '../lib/units';
import { ENTRY_TYPE_LABEL, formatDate, formatDateTime, shortHash } from '../lib/labels';
import { Card, CardTitle, Row } from '../components/Card';
import { Button, LinkButton } from '../components/Button';
import { Input } from '../components/Input';
import { Banner } from '../components/Banner';
import { DeliveryStatusBadge, KycBadge, PaymentStatusBadge } from '../components/Badge';
import { Pagination } from '../components/Pagination';
import { SkeletonCard } from '../components/Skeleton';
import { AdminPageHeader } from './AdminLayout';
import { EmptyRow, LoadingRows, Mono, Table, Td, Th } from './Table';

const PAGE_SIZE = 25;

export function UsersPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const users = useLoader(() => adminApi.users({ q: q || undefined, page, pageSize: PAGE_SIZE }), [q, page]);

  return (
    <div>
      <AdminPageHeader title="Users" subtitle="Search by email and inspect balances" />
      <form
        className="mb-4 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/80 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQ(draft.trim());
        }}
      >
        <Input
          containerClassName="flex-1"
          label="Email contains"
          placeholder="e.g. alice@"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit" variant="dark" loading={users.loading && Boolean(users.data)}>
            Search
          </Button>
          {q && (
            <Button
              variant="secondary"
              onClick={() => {
                setDraft('');
                setQ('');
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </form>

      {users.error && (
        <Banner tone="error" className="mb-4">
          {users.error.message}
        </Banner>
      )}

      <Table minWidth={640}>
        <thead>
          <tr>
            <Th>Email</Th>
            <Th>KYC</Th>
            <Th className="text-right">Available</Th>
            <Th className="text-right">Locked</Th>
            <Th>Joined</Th>
          </tr>
        </thead>
        <tbody>
          {users.loading && !users.data ? (
            <LoadingRows colSpan={5} />
          ) : (users.data?.items.length ?? 0) === 0 ? (
            <EmptyRow colSpan={5}>{q ? `No users matching “${q}”.` : 'No users yet.'}</EmptyRow>
          ) : (
            users.data?.items.map((u) => (
              <tr
                key={u.id}
                className="cursor-pointer hover:bg-amber-50/50"
                onClick={() => navigate(`/admin/users/${u.id}`)}
              >
                <Td>
                  <Link to={`/admin/users/${u.id}`} className="font-medium text-stone-900 hover:text-amber-700" onClick={(e) => e.stopPropagation()}>
                    {u.email}
                  </Link>
                </Td>
                <Td>
                  <KycBadge status={u.kycStatus} />
                </Td>
                <Td className="text-right tabular-nums">{formatMg(u.availableMg)} g</Td>
                <Td className="text-right tabular-nums">{formatMg(u.lockedMg)} g</Td>
                <Td className="whitespace-nowrap">{formatDate(u.createdAt)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {users.data && (
        <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPage={setPage} disabled={users.loading} />
      )}
    </div>
  );
}

export function UserDetailPage() {
  const { id = '' } = useParams();
  const detail = useLoader(() => adminApi.user(id), [id]);
  const d = detail.data;

  return (
    <div>
      <AdminPageHeader
        title={d ? d.user.email : 'User'}
        subtitle={d ? `User ID ${d.user.id}` : undefined}
        right={
          <div className="flex gap-2">
            <LinkButton to="/admin/users" variant="secondary">
              ← Users
            </LinkButton>
            {d && (
              <LinkButton to={`/admin/ledger?userId=${encodeURIComponent(d.user.id)}`} variant="dark">
                Full ledger
              </LinkButton>
            )}
          </div>
        }
      />

      {detail.error && (
        <Banner tone="error" className="mb-4">
          {detail.error.message}
        </Banner>
      )}

      {!d && detail.loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </div>
      ) : d ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle action={<KycBadge status={d.user.kycStatus} />}>Profile</CardTitle>
              <dl className="divide-y divide-stone-100">
                <Row label="Email" value={d.user.email} />
                <Row label="KYC name" value={d.user.kycName ?? '—'} />
                <Row
                  label="Bank account"
                  value={d.user.bankAccount ? `${d.user.bankAccount.holderName} · ${d.user.bankAccount.ibanMasked}` : '—'}
                />
                <Row label="Joined" value={formatDateTime(d.user.createdAt)} />
              </dl>
            </Card>
            <Card>
              <CardTitle>Balance</CardTitle>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase text-amber-800">Available</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{formatMg(d.account.availableMg)} g</p>
                </div>
                <div className="rounded-xl bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase text-stone-500">Locked</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{formatMg(d.account.lockedMg)} g</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-stone-500">Last ledger seq: {d.account.lastSeq}</p>
            </Card>
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Latest ledger entries</h2>
            <UserEntriesTable entries={d.entries} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Deliveries</h2>
            <UserDeliveriesTable deliveries={d.deliveries} />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function UserEntriesTable({ entries }: { entries: LedgerEntry[] }) {
  const { decimals, currency } = usePrice();
  return (
    <Table minWidth={860}>
      <thead>
        <tr>
          <Th>Seq</Th>
          <Th>Time</Th>
          <Th>Type</Th>
          <Th className="text-right">Available Δ</Th>
          <Th className="text-right">Locked Δ</Th>
          <Th className="text-right">Amount</Th>
          <Th className="text-right">Balance after</Th>
          <Th>Hash</Th>
        </tr>
      </thead>
      <tbody>
        {entries.length === 0 ? (
          <EmptyRow colSpan={8}>No ledger entries.</EmptyRow>
        ) : (
          entries.map((e) => (
            <tr key={e.seq}>
              <Td className="font-mono text-xs">{e.seq}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(e.createdAt)}</Td>
              <Td className="whitespace-nowrap">{ENTRY_TYPE_LABEL[e.type]}</Td>
              <Td className="text-right tabular-nums">{e.availableDeltaMg ? formatSignedMg(e.availableDeltaMg) : '—'}</Td>
              <Td className="text-right tabular-nums">{e.lockedDeltaMg ? formatSignedMg(e.lockedDeltaMg) : '—'}</Td>
              <Td className="whitespace-nowrap text-right tabular-nums">
                {e.amountMinor !== null ? formatMoney(e.amountMinor, e.currency ?? currency, decimals) : '—'}
              </Td>
              <Td className="whitespace-nowrap text-right text-xs tabular-nums">
                {formatMg(e.balanceAfter.availableMg)} / {formatMg(e.balanceAfter.lockedMg)}
              </Td>
              <Td>
                <Mono title={e.hash}>{shortHash(e.hash)}</Mono>
              </Td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}

function UserDeliveriesTable({ deliveries }: { deliveries: AdminDelivery[] }) {
  return (
    <Table minWidth={720}>
      <thead>
        <tr>
          <Th>Created</Th>
          <Th>Product</Th>
          <Th className="text-right">Gold</Th>
          <Th>Status</Th>
          <Th>Charges</Th>
          <Th>Tracking</Th>
        </tr>
      </thead>
      <tbody>
        {deliveries.length === 0 ? (
          <EmptyRow colSpan={6}>No deliveries.</EmptyRow>
        ) : (
          deliveries.map((d) => (
            <tr key={d.id}>
              <Td className="whitespace-nowrap">{formatDateTime(d.createdAt)}</Td>
              <Td>{d.productName}</Td>
              <Td className="text-right tabular-nums">{formatMg(d.goldMg)} g</Td>
              <Td>
                <DeliveryStatusBadge status={d.status} />
              </Td>
              <Td>
                <PaymentStatusBadge status={d.chargesStatus} />
              </Td>
              <Td className="font-mono text-xs">{d.trackingNo ?? '—'}</Td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}
