import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, type Price } from '../lib/api';
import { useUser } from '../lib/auth';
import { useInterval, useLoader } from '../lib/hooks';
import { PRICE_POLL_MS, usePrice } from '../lib/price';
import { formatMg, formatMoney } from '../lib/units';
import { formatTime } from '../lib/labels';
import { Card, CardTitle } from '../components/Card';
import { LinkButton } from '../components/Button';
import { Banner } from '../components/Banner';
import { DeliveryStatusBadge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import { BuyIcon, ChevronRightIcon, DeliverIcon, LockIcon, SellIcon } from '../components/icons';

const DEFAULT_DELIVERY_MIN_MG = 10_000;

function Direction({ direction }: { direction: Price['direction'] }) {
  if (direction === 'up') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600" title="Price went up">
        ▲ <span className="sr-only">up</span>
      </span>
    );
  }
  if (direction === 'down') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600" title="Price went down">
        ▼ <span className="sr-only">down</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-500" title="No change">
      — <span className="sr-only">flat</span>
    </span>
  );
}

export function HomePage() {
  const user = useUser();
  const { price, error: priceError, decimals } = usePrice();
  const wallet = useLoader(() => api.getWallet(), []);
  const deliveries = useLoader(() => api.listDeliveries(), []);
  const products = useLoader(() => api.getDeliveryProducts(), []);

  // Keep the balance value in step with the live price.
  useInterval(() => void wallet.refresh(), PRICE_POLL_MS);

  const w = wallet.data;
  const minMg = products.data?.minMg ?? DEFAULT_DELIVERY_MIN_MG;
  const canDeliver = w ? w.availableMg >= minMg : false;
  const activeDeliveries = (deliveries.data?.items ?? []).filter((d) => d.status !== 'DELIVERED' && d.status !== 'CANCELLED');
  const allDeliveries = deliveries.data?.items ?? [];
  const initial = user.email.charAt(0).toUpperCase();

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-500">Welcome back</p>
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">Your gold</h1>
        </div>
        <Link
          to="/profile"
          aria-label="Profile"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-amber-300 shadow-sm ring-2 ring-white hover:bg-stone-800"
        >
          {initial}
        </Link>
      </header>

      {/* Balance card */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 p-6 text-stone-950 shadow-lg shadow-amber-500/20">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-900/70">Available gold</p>
        {wallet.loading && !w ? (
          <Skeleton className="mt-2 h-10 w-40 bg-white/40" />
        ) : w ? (
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
            {formatMg(w.availableMg)}
            <span className="ml-1 text-xl font-medium text-stone-900/70">g</span>
          </p>
        ) : (
          <p className="mt-2 text-sm">—</p>
        )}
        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="flex items-center gap-1.5 text-sm text-stone-900/80">
            <LockIcon className="h-4 w-4" />
            <span>
              Locked: <span className="font-semibold tabular-nums">{w ? `${formatMg(w.lockedMg)} g` : '—'}</span>
            </span>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-900/60">Current value</p>
            <p className="text-lg font-semibold tabular-nums">{w ? formatMoney(w.totalValueMinor, w.currency, decimals) : '—'}</p>
          </div>
        </div>
      </section>
      {wallet.error && <Banner tone="error">{wallet.error.message}</Banner>}

      {/* Live price */}
      <Card>
        <CardTitle
          action={
            <span className="flex items-center gap-1.5 text-xs text-stone-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live{price ? ` · ${formatTime(price.updatedAt)}` : ''}
            </span>
          }
        >
          Gold price per gram
        </CardTitle>
        {price ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="text-xs text-stone-500">You buy at</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-semibold tabular-nums text-stone-900">
                  {formatMoney(price.buyPerGramMinor, price.currency, price.currencyDecimals)}
                </p>
                <Direction direction={price.direction} />
              </div>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="text-xs text-stone-500">You sell at</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-semibold tabular-nums text-stone-900">
                  {formatMoney(price.sellPerGramMinor, price.currency, price.currencyDecimals)}
                </p>
                <Direction direction={price.direction} />
              </div>
            </div>
          </div>
        ) : priceError ? (
          <p className="text-sm text-red-600">{priceError}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <QuickAction to="/buy" label="Buy" icon={<BuyIcon className="h-6 w-6" />} />
        <QuickAction to="/sell" label="Sell" icon={<SellIcon className="h-6 w-6" />} />
        <QuickAction
          to="/deliver"
          label="Deliver"
          icon={<DeliverIcon className="h-6 w-6" />}
          disabled={!canDeliver}
          note={w && !canDeliver ? `Min ${formatMg(minMg)} g` : undefined}
        />
      </div>

      {/* Deliveries */}
      {allDeliveries.length > 0 && (
        <Card>
          <CardTitle
            action={
              <Link to="/deliver" className="text-xs font-semibold text-amber-700 hover:text-amber-800">
                All deliveries
              </Link>
            }
          >
            {activeDeliveries.length > 0 ? 'Active deliveries' : 'Deliveries'}
          </CardTitle>
          <ul className="-mx-2 divide-y divide-stone-100">
            {(activeDeliveries.length > 0 ? activeDeliveries : allDeliveries).slice(0, 3).map((d) => (
              <li key={d.id}>
                <Link to={`/deliveries/${d.id}`} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-900">{d.productName}</p>
                    <p className="text-xs text-stone-500 tabular-nums">{formatMg(d.goldMg)} g</p>
                  </div>
                  <DeliveryStatusBadge status={d.status} />
                  <ChevronRightIcon className="h-4 w-4 text-stone-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {user.kycStatus !== 'VERIFIED' && (
        <Banner
          tone="warning"
          title="Verify your identity"
          action={
            <LinkButton to="/profile" size="sm" variant="dark">
              Verify now
            </LinkButton>
          }
        >
          KYC is required to sell gold and for larger purchases.
        </Banner>
      )}
    </div>
  );
}

function QuickAction({
  to,
  label,
  icon,
  disabled = false,
  note,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  note?: string;
}) {
  const content = (
    <>
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          disabled ? 'bg-stone-100 text-stone-400' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {icon}
      </span>
      <span className={`text-sm font-semibold ${disabled ? 'text-stone-400' : 'text-stone-800'}`}>{label}</span>
      {note && <span className="text-[10px] text-stone-400">{note}</span>}
    </>
  );
  const cls =
    'flex flex-col items-center gap-1.5 rounded-2xl bg-white px-2 py-4 shadow-sm ring-1 ring-stone-200/80 transition';
  if (disabled) {
    return (
      <button type="button" disabled aria-disabled="true" className={`${cls} cursor-not-allowed opacity-80`} title={note}>
        {content}
      </button>
    );
  }
  return (
    <Link to={to} className={`${cls} hover:-translate-y-0.5 hover:shadow-md`}>
      {content}
    </Link>
  );
}
