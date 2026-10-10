import { useState } from 'react';
import { adminApi, AUDIT_ACTOR_TYPES, type AuditActorType, type AuditQuery } from '../lib/api';
import { useLoader } from '../lib/hooks';
import { formatDateTime, shortId } from '../lib/labels';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { Banner } from '../components/Banner';
import { Badge, type BadgeTone } from '../components/Badge';
import { Pagination } from '../components/Pagination';
import { AdminPageHeader } from './AdminLayout';
import { EmptyRow, FilterBar, LoadingRows, Mono, Table, Td, Th } from './Table';

const PAGE_SIZE = 50;

interface Filters {
  action: string;
  actorType: AuditActorType | '';
  from: string;
  to: string;
}

const ACTOR_TONE: Record<AuditActorType, BadgeTone> = {
  user: 'blue',
  admin: 'violet',
  system: 'gray',
  anonymous: 'amber',
  gateway: 'green',
};

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function AuditPage() {
  const empty: Filters = { action: '', actorType: '', from: '', to: '' };
  const [draft, setDraft] = useState<Filters>(empty);
  const [filters, setFilters] = useState<Filters>(empty);
  const [page, setPage] = useState(1);

  const query: AuditQuery = {
    action: filters.action.trim() || undefined,
    actorType: filters.actorType || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const logs = useLoader(() => adminApi.auditLogs(query), [filters, page]);

  return (
    <div>
      <AdminPageHeader title="Audit log" subtitle="Logins, admin views, reversals and delivery changes — insert-only" />

      <FilterBar
        onSubmit={() => {
          setPage(1);
          setFilters({ ...draft });
        }}
      >
        <Input label="Action" placeholder="e.g. admin.login" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
        <Select
          label="Actor type"
          value={draft.actorType}
          onChange={(e) => setDraft({ ...draft, actorType: e.target.value as AuditActorType | '' })}
        >
          <option value="">All actors</option>
          {AUDIT_ACTOR_TYPES.map((t) => (
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
              setDraft(empty);
              setFilters(empty);
              setPage(1);
            }}
          >
            Reset
          </Button>
        </div>
      </FilterBar>

      {logs.error && (
        <Banner tone="error" className="mb-4">
          {logs.error.message}
        </Banner>
      )}

      <Table minWidth={1100}>
        <thead>
          <tr>
            <Th>Time</Th>
            <Th>Actor</Th>
            <Th>Action</Th>
            <Th>Target</Th>
            <Th>IP</Th>
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody className={logs.loading && logs.data ? 'opacity-60' : ''}>
          {logs.loading && !logs.data ? (
            <LoadingRows colSpan={6} />
          ) : (logs.data?.items.length ?? 0) === 0 ? (
            <EmptyRow colSpan={6}>No audit events match these filters.</EmptyRow>
          ) : (
            logs.data?.items.map((log) => {
              const details = log.details ? compactJson(log.details) : null;
              return (
                <tr key={log.id} className="hover:bg-stone-50">
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(log.createdAt)}</Td>
                  <Td className="whitespace-nowrap">
                    <Badge tone={ACTOR_TONE[log.actorType] ?? 'gray'}>{log.actorType}</Badge>
                    <span className="ml-2 text-sm text-stone-800" title={log.actorId ?? ''}>
                      {log.actorLabel ?? (log.actorId ? shortId(log.actorId) : '—')}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs font-semibold text-stone-900">{log.action}</Td>
                  <Td className="whitespace-nowrap text-xs" title={log.targetId ?? ''}>
                    {log.targetType ? `${log.targetType}${log.targetId ? `:${shortId(log.targetId)}` : ''}` : '—'}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{log.ip ?? '—'}</Td>
                  <Td className="max-w-[360px]">
                    {details ? (
                      <Mono title={details}>
                        <span className="block truncate">{details}</span>
                      </Mono>
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
      {logs.data && (
        <Pagination page={logs.data.page} pageSize={logs.data.pageSize} total={logs.data.total} onPage={setPage} disabled={logs.loading} />
      )}
    </div>
  );
}
