import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type Address, type ApiError, type CreateDeliveryBody, type Delivery, type DeliveryProduct } from '../lib/api';
import { useUser } from '../lib/auth';
import { useAction, useLoader } from '../lib/hooks';
import { usePrice } from '../lib/price';
import { formatMg, formatMoney } from '../lib/units';
import { formatDate } from '../lib/labels';
import { PageHeader } from '../components/PageHeader';
import { Card, CardTitle, Row } from '../components/Card';
import { Input } from '../components/Input';
import { Button, LinkButton } from '../components/Button';
import { Banner } from '../components/Banner';
import { DeliveryStatusBadge } from '../components/Badge';
import { EmptyState, SkeletonCard } from '../components/Skeleton';
import { ChevronRightIcon, GoldBarIcon, LockIcon } from '../components/icons';

interface AddressForm {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  country: string;
  postalCode: string;
}

function validateAddress(a: AddressForm): Partial<Record<keyof AddressForm, string>> {
  const errors: Partial<Record<keyof AddressForm, string>> = {};
  if (a.fullName.trim().length < 2) errors.fullName = 'Enter the recipient name';
  if (!/^\+?[\d\s-]{7,20}$/.test(a.phone.trim())) errors.phone = 'Enter a phone number, e.g. +971 50 123 4567';
  if (a.line1.trim().length < 3) errors.line1 = 'Enter the street address';
  if (a.city.trim().length < 2) errors.city = 'Enter the city';
  if (a.country.trim().length < 2) errors.country = 'Enter the country';
  return errors;
}

function toAddress(a: AddressForm): Address {
  const address: Address = {
    fullName: a.fullName.trim(),
    phone: a.phone.trim(),
    line1: a.line1.trim(),
    city: a.city.trim(),
    country: a.country.trim(),
  };
  if (a.line2.trim()) address.line2 = a.line2.trim();
  if (a.postalCode.trim()) address.postalCode = a.postalCode.trim();
  return address;
}

export function DeliverPage() {
  const user = useUser();
  const { decimals } = usePrice();
  const setup = useLoader(() => Promise.all([api.getDeliveryProducts(), api.getWallet()]), []);
  const deliveries = useLoader(() => api.listDeliveries(), []);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [address, setAddress] = useState<AddressForm>({
    fullName: user.kycName ?? '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    country: 'United Arab Emirates',
    postalCode: '',
  });
  const [touched, setTouched] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const create = useAction(async (key, body: CreateDeliveryBody) => {
    try {
      const res = await api.createDelivery(body, key);
      setRedirecting(true);
      window.location.href = res.checkoutUrl;
    } catch (e) {
      const code = (e as ApiError).code;
      if (code === 'INSUFFICIENT_GOLD' || code === 'DELIVERY_MIN_NOT_MET') void setup.refresh();
      throw e;
    }
  });

  const productsRes = setup.data?.[0];
  const wallet = setup.data?.[1];
  const availableMg = wallet?.availableMg ?? 0;
  const minMg = productsRes?.minMg ?? 10_000;
  const currency = productsRes?.currency ?? wallet?.currency ?? 'AED';
  const eligible = wallet ? availableMg >= minMg : false;
  const selected = productsRes?.products.find((p) => p.code === selectedCode) ?? null;
  const errors = validateAddress(address);
  const addressValid = Object.keys(errors).length === 0;
  const money = (minor: number) => formatMoney(minor, currency, decimals);

  const update = (field: keyof AddressForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setAddress((prev) => ({ ...prev, [field]: e.target.value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!selected || selected.goldMg > availableMg || !addressValid) return;
    void create.run({ product: selected.code, address: toAddress(address) });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Deliver gold" subtitle="Get physical gold delivered to your door" />

      {setup.loading && !setup.data ? (
        <SkeletonCard lines={4} />
      ) : setup.error ? (
        <Banner
          tone="error"
          action={
            <Button size="sm" variant="secondary" onClick={() => void setup.reload()}>
              Retry
            </Button>
          }
        >
          {setup.error.message}
        </Banner>
      ) : !eligible ? (
        <Card className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400">
            <GoldBarIcon className="h-6 w-6" />
          </div>
          <h2 className="font-semibold text-stone-900">Delivery not available yet</h2>
          <p className="mt-1 text-sm text-stone-500">
            You need at least {formatMg(minMg)} g to request delivery; you have {formatMg(availableMg)} g.
          </p>
          <Button className="mt-4" fullWidth disabled>
            Deliver gold
          </Button>
          <LinkButton to="/buy" variant="secondary" fullWidth className="mt-2">
            Buy more gold
          </LinkButton>
        </Card>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Card>
            <CardTitle action={<span className="text-xs text-stone-500 tabular-nums">Available {formatMg(availableMg)} g</span>}>
              1 · Choose a product
            </CardTitle>
            <div className="grid grid-cols-1 gap-3">
              {productsRes?.products.map((p) => (
                <ProductOption
                  key={p.code}
                  product={p}
                  money={money}
                  selected={p.code === selectedCode}
                  affordable={p.goldMg <= availableMg}
                  disabled={create.pending || redirecting}
                  onSelect={() => setSelectedCode(p.code)}
                />
              ))}
            </div>
            {touched && !selected && <p className="mt-2 text-xs font-medium text-red-600">Choose a product</p>}
          </Card>

          <Card>
            <CardTitle>2 · Delivery address</CardTitle>
            <div className="grid grid-cols-1 gap-4">
              <Input label="Full name" autoComplete="name" value={address.fullName} onChange={update('fullName')} error={touched ? errors.fullName : null} />
              <Input label="Phone" type="tel" autoComplete="tel" value={address.phone} onChange={update('phone')} error={touched ? errors.phone : null} />
              <Input label="Address line 1" autoComplete="address-line1" value={address.line1} onChange={update('line1')} error={touched ? errors.line1 : null} />
              <Input label="Address line 2 (optional)" autoComplete="address-line2" value={address.line2} onChange={update('line2')} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="City" autoComplete="address-level2" value={address.city} onChange={update('city')} error={touched ? errors.city : null} />
                <Input label="Postal code" autoComplete="postal-code" value={address.postalCode} onChange={update('postalCode')} hint="Optional" />
              </div>
              <Input label="Country" autoComplete="country-name" value={address.country} onChange={update('country')} error={touched ? errors.country : null} />
            </div>
          </Card>

          <Card>
            <CardTitle>3 · Charges</CardTitle>
            {selected ? (
              <>
                <dl className="divide-y divide-stone-100">
                  <Row label="Gold to lock" value={`${formatMg(selected.goldMg)} g`} />
                  <Row label="Making charge" value={money(selected.makingChargeMinor)} />
                  <Row label="Insured shipping" value={money(selected.shippingMinor)} />
                  <Row label="Total charges" value={money(selected.chargesMinor)} strong />
                </dl>
                <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                  <LockIcon className="mt-0.5 h-4 w-4 flex-none" />
                  <p>
                    {formatMg(selected.goldMg)} g will be locked in your wallet until delivery. Pay the charges within 30
                    minutes, otherwise the request is cancelled and the gold is released.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-stone-500">Choose a product to see the charges.</p>
            )}
            {create.error && (
              <Banner tone="error" className="mt-4">
                {create.error.message}
              </Banner>
            )}
            <Button
              type="submit"
              size="lg"
              fullWidth
              className="mt-4"
              loading={create.pending || redirecting}
              disabled={!selected || selected.goldMg > availableMg}
            >
              {redirecting ? 'Opening checkout…' : selected ? `Pay charges ${money(selected.chargesMinor)}` : 'Pay charges'}
            </Button>
          </Card>
        </form>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Your deliveries</h2>
        {deliveries.loading && !deliveries.data ? (
          <SkeletonCard lines={2} />
        ) : deliveries.error ? (
          <Banner tone="error">{deliveries.error.message}</Banner>
        ) : (deliveries.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="No deliveries yet">Requests you make will appear here with live tracking.</EmptyState>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-stone-100">
              {deliveries.data?.items.map((d) => <DeliveryRow key={d.id} delivery={d} />)}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function ProductOption({
  product,
  money,
  selected,
  affordable,
  disabled,
  onSelect,
}: {
  product: DeliveryProduct;
  money(minor: number): string;
  selected: boolean;
  affordable: boolean;
  disabled: boolean;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!affordable || disabled}
      aria-pressed={selected}
      className={`flex items-center gap-4 rounded-2xl p-4 text-left ring-1 transition ${
        !affordable
          ? 'cursor-not-allowed bg-stone-50 opacity-60 ring-stone-200'
          : selected
            ? 'bg-amber-50 ring-2 ring-amber-500'
            : 'bg-white ring-stone-200 hover:ring-amber-300'
      }`}
    >
      <span
        className={`flex h-12 w-12 flex-none items-center justify-center rounded-xl ${
          affordable ? 'bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950' : 'bg-stone-200 text-stone-400'
        }`}
      >
        <GoldBarIcon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-stone-900">{product.name}</span>
        <span className="block text-xs text-stone-500 tabular-nums">
          {formatMg(product.goldMg)} g · charges {money(product.chargesMinor)}
        </span>
        {!affordable && <span className="mt-0.5 block text-xs font-medium text-stone-500">Not enough gold available</span>}
      </span>
      <span
        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
          selected ? 'border-amber-500 bg-amber-500' : 'border-stone-300'
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
    </button>
  );
}

function DeliveryRow({ delivery }: { delivery: Delivery }) {
  return (
    <li>
      <Link to={`/deliveries/${delivery.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-stone-50">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-900">{delivery.productName}</p>
          <p className="text-xs text-stone-500 tabular-nums">
            {formatMg(delivery.goldMg)} g · {formatDate(delivery.createdAt)}
          </p>
        </div>
        <DeliveryStatusBadge status={delivery.status} />
        <ChevronRightIcon className="h-4 w-4 text-stone-400" />
      </Link>
    </li>
  );
}
