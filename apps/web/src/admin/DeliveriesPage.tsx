import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi, DELIVERY_STATUSES, type AdminDelivery, type DeliveryStatus } from '../lib/api';
import { useAdminAuth } from '../lib/adminAuth';
import { useAction, useLoader } from '../lib/hooks';
import { usePrice } from '../lib/price';
import { formatMg, formatMoney } from '../lib/units';
import { DELIVERY_STATUS_LABEL, formatDateTime } from '../lib/labels';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Banner } from '../components/Banner';
import { DeliveryStatusBadge, PaymentStatusBadge } from '../components/Badge';
import { ConfirmDialog, Modal } from '../components/Modal';
import { AdminPageHeader, RoleNote } from './AdminLayout';
import { EmptyRow, LoadingRows, Table, Td, Th } from './Table';

type Dialog =
  | { kind: 'pack'; delivery: AdminDelivery }
  | { kind: 'ship'; delivery: AdminDelivery }
  | { kind: 'complete'; delivery: AdminDelivery }
  | { kind: 'cancel'; delivery: AdminDelivery };

type ActionInput =
  | { kind: 'pack'; id: string }
  | { kind: 'ship'; id: string; trackingNo: string }
  | { kind: 'complete'; id: string; otp: string }
  | { kind: 'cancel'; id: string };

const TABS: (DeliveryStatus | '')[] = ['', ...DELIVERY_STATUSES.filter((s) => s !== 'REQUESTED')];

export function DeliveriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get('status') ?? '') as DeliveryStatus | '';
  const list = useLoader(() => adminApi.deliveries(status), [status]);
  const { hasRole } = useAdminAuth();
  const isOps = hasRole('OPS');
  const { decimals } = usePrice();

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [trackingNo, setTrackingNo] = useState('');
  const [otp, setOtp] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const action = useAction(async (key, input: ActionInput) => {
    let updated: AdminDelivery;
    switch (input.kind) {
      case 'pack':
        updated = await adminApi.setDeliveryStatus(input.id, { status: 'PACKED' }, key);
        break;
      case 'ship':
        updated = await adminApi.setDeliveryStatus(input.id, { status: 'SHIPPED', trackingNo: input.trackingNo }, key);
        break;
      case 'complete':
        updated = await adminApi.completeDelivery(input.id, input.otp, key);
        break;
      case 'cancel':
        updated = await adminApi.setDeliveryStatus(input.id, { status: 'CANCELLED' }, key);
        break;
    }
    setNotice(`${updated.productName} for ${updated.userEmail ?? updated.userId} is now ${DELIVERY_STATUS_LABEL[updated.status]}.`);
    setDialog(null);
    await list.refresh();
  });

  const open = (next: Dialog) => {
    action.clearError();
    setNotice(null);
    setTrackingNo('');
    setOtp('');
    setDialog(next);
  };

  const close = () => {
    if (!action.pending) setDialog(null);
  };

  const items = list.data?.items ?? [];

  return (
    <div>
      <AdminPageHeader
        title="Deliveries"
        subtitle="Pack, ship and hand over physical gold"
        right={!isOps ? <RoleNote role="OPS" /> : undefined}
      />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-stone-200/80">
        {TABS.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => {
              setNotice(null);
              setSearchParams(s ? { status: s } : {});
            }}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              status === s ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {s ? DELIVERY_STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>

      {notice && (
        <Banner tone="success" className="mb-4">
          {notice}
        </Banner>
      )}
      {action.error && !dialog && (
        <Banner tone="error" className="mb-4">
          {action.error.message}
        </Banner>
      )}
      {list.error && (
        <Banner tone="error" className="mb-4">
          {list.error.message}
        </Banner>
      )}

      <Table minWidth={1080}>
        <thead>
          <tr>
            <Th>Created</Th>
            <Th>User</Th>
            <Th>Product</Th>
            <Th className="text-right">Gold</Th>
            <Th>Ship to</Th>
            <Th>Status</Th>
            <Th>Charges</Th>
            <Th>Tracking</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {list.loading && !list.data ? (
            <LoadingRows colSpan={9} />
          ) : items.length === 0 ? (
            <EmptyRow colSpan={9}>No deliveries{status ? ` with status ${DELIVERY_STATUS_LABEL[status]}` : ''}.</EmptyRow>
          ) : (
            items.map((d) => {
              const chargesPaid = d.chargesStatus === 'PAID';
              const canPack = d.status === 'LOCKED' && chargesPaid;
              const canShip = d.status === 'PACKED';
              const canComplete = d.status === 'SHIPPED';
              const canCancel = d.status === 'LOCKED' || d.status === 'PACKED';
              return (
                <tr key={d.id} className="hover:bg-stone-50">
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(d.createdAt)}</Td>
                  <Td className="max-w-[200px]">
                    <Link to={`/admin/users/${d.userId}`} className="block truncate text-stone-900 hover:text-amber-700">
                      {d.userEmail ?? d.userId}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{d.productName}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{formatMg(d.goldMg)} g</Td>
                  <Td className="max-w-[220px] text-xs">
                    <span
                      className="block truncate"
                      title={[d.address.fullName, d.address.line1, d.address.line2, d.address.city, d.address.postalCode, d.address.country, d.address.phone]
                        .filter(Boolean)
                        .join(', ')}
                    >
                      {d.address.fullName} · {d.address.city}, {d.address.country}
                    </span>
                  </Td>
                  <Td>
                    <DeliveryStatusBadge status={d.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <PaymentStatusBadge status={d.chargesStatus} />
                      <span className="text-xs tabular-nums text-stone-500">{formatMoney(d.chargesMinor, d.currency, decimals)}</span>
                    </div>
                  </Td>
                  <Td className="font-mono text-xs">{d.trackingNo ?? '—'}</Td>
                  <Td className="text-right">
                    {isOps ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {canPack && (
                          <Button size="sm" variant="dark" disabled={action.pending} onClick={() => open({ kind: 'pack', delivery: d })}>
                            Mark packed
                          </Button>
                        )}
                        {d.status === 'LOCKED' && !chargesPaid && <span className="self-center text-xs text-stone-400">Awaiting charges</span>}
                        {canShip && (
                          <Button size="sm" variant="dark" disabled={action.pending} onClick={() => open({ kind: 'ship', delivery: d })}>
                            Ship
                          </Button>
                        )}
                        {canComplete && (
                          <Button size="sm" variant="primary" disabled={action.pending} onClick={() => open({ kind: 'complete', delivery: d })}>
                            Complete
                          </Button>
                        )}
                        {canCancel && (
                          <Button size="sm" variant="secondary" disabled={action.pending} onClick={() => open({ kind: 'cancel', delivery: d })}>
                            Cancel
                          </Button>
                        )}
                        {!canPack && !canShip && !canComplete && !canCancel && <span className="text-xs text-stone-400">—</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400">View only</span>
                    )}
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      {/* Pack */}
      <ConfirmDialog
        open={dialog?.kind === 'pack'}
        title="Mark as packed?"
        confirmLabel="Mark packed"
        tone="dark"
        busy={action.pending}
        error={dialog?.kind === 'pack' ? action.error?.message : null}
        onCancel={close}
        onConfirm={() => dialog && void action.run({ kind: 'pack', id: dialog.delivery.id })}
      >
        {dialog && (
          <p>
            {dialog.delivery.productName} ({formatMg(dialog.delivery.goldMg)} g) for {dialog.delivery.userEmail ?? dialog.delivery.userId}.
          </p>
        )}
      </ConfirmDialog>

      {/* Ship */}
      <Modal
        open={dialog?.kind === 'ship'}
        title="Ship delivery"
        onClose={close}
        busy={action.pending}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={action.pending}>
              Cancel
            </Button>
            <Button
              variant="dark"
              loading={action.pending}
              disabled={trackingNo.trim().length < 3}
              onClick={() => dialog && void action.run({ kind: 'ship', id: dialog.delivery.id, trackingNo: trackingNo.trim() })}
            >
              Mark shipped
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (dialog && trackingNo.trim().length >= 3) void action.run({ kind: 'ship', id: dialog.delivery.id, trackingNo: trackingNo.trim() });
          }}
        >
          <Input label="Courier tracking number" autoFocus value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} className="font-mono" />
          {dialog?.kind === 'ship' && action.error && <Banner tone="error">{action.error.message}</Banner>}
        </form>
      </Modal>

      {/* Complete */}
      <Modal
        open={dialog?.kind === 'complete'}
        title="Complete handover"
        onClose={close}
        busy={action.pending}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={action.pending}>
              Cancel
            </Button>
            <Button
              loading={action.pending}
              disabled={!/^\d{6}$/.test(otp)}
              onClick={() => dialog && void action.run({ kind: 'complete', id: dialog.delivery.id, otp })}
            >
              Confirm delivery
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (dialog && /^\d{6}$/.test(otp)) void action.run({ kind: 'complete', id: dialog.delivery.id, otp });
          }}
        >
          <p className="text-sm text-stone-600">
            Enter the 6-digit code the customer gives the courier. This removes {dialog ? formatMg(dialog.delivery.goldMg) : ''} g from their
            locked balance.
          </p>
          <Input
            label="Customer delivery code"
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="text-center font-mono text-xl tracking-[0.4em]"
          />
          {dialog?.kind === 'complete' && action.error && <Banner tone="error">{action.error.message}</Banner>}
        </form>
      </Modal>

      {/* Cancel */}
      <ConfirmDialog
        open={dialog?.kind === 'cancel'}
        title="Cancel delivery?"
        confirmLabel="Cancel delivery"
        cancelLabel="Keep"
        tone="danger"
        busy={action.pending}
        error={dialog?.kind === 'cancel' ? action.error?.message : null}
        onCancel={close}
        onConfirm={() => dialog && void action.run({ kind: 'cancel', id: dialog.delivery.id })}
      >
        {dialog && (
          <p>
            The {formatMg(dialog.delivery.goldMg)} g locked for {dialog.delivery.userEmail ?? dialog.delivery.userId} will be released back to
            their available balance.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
