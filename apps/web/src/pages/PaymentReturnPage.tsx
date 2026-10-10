import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, type Payment } from '../lib/api';
import { usePrice } from '../lib/price';
import { formatMg, formatMoney } from '../lib/units';
import { Card } from '../components/Card';
import { Button, LinkButton } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { CheckIcon, ClockIcon, XCircleIcon } from '../components/icons';

const POLL_MS = 1500;
const GIVE_UP_MS = 60_000;
const TERMINAL = new Set<Payment['status']>(['PAID', 'FAILED', 'LATE_PAID_REFUND']);

type Phase = 'polling' | 'done' | 'timeout' | 'error';

/**
 * Landing page after the hosted checkout. It ONLY reads the payment status;
 * gold is credited by the server when the signed webhook arrives.
 */
export function PaymentReturnPage() {
  const [params] = useSearchParams();
  const orderId = params.get('orderId') ?? params.get('paymentId') ?? '';
  const { decimals } = usePrice();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [phase, setPhase] = useState<Phase>(orderId ? 'polling' : 'error');
  const [errorText, setErrorText] = useState<string | null>(orderId ? null : 'Missing payment reference.');
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  const restart = useCallback(() => {
    setPhase('polling');
    setErrorText(null);
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    if (!orderId) return undefined;
    let cancelled = false;
    const startedAt = Date.now();
    let notFoundCount = 0;

    const poll = async () => {
      try {
        const p = await api.getPayment(orderId);
        if (cancelled) return;
        setPayment(p);
        if (TERMINAL.has(p.status)) {
          setPhase('done');
          return;
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) return; // redirected to /login
        if (e instanceof ApiError && e.status === 404) {
          notFoundCount += 1;
          if (notFoundCount >= 3) {
            setPhase('error');
            setErrorText('We could not find this payment.');
            return;
          }
        }
        // Other errors (network, 5xx) are transient: keep polling until the deadline.
      }
      if (Date.now() - startedAt >= GIVE_UP_MS) {
        setPhase('timeout');
        return;
      }
      timer.current = window.setTimeout(() => void poll(), POLL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [orderId, attempt]);

  const money = (minor: number, currency: string) => formatMoney(minor, currency, decimals);
  const isDelivery = payment?.purpose === 'DELIVERY_CHARGES';
  const deliveryLink = payment?.deliveryId ? `/deliveries/${payment.deliveryId}` : '/deliver';

  return (
    <div className="flex min-h-[70vh] items-center">
      <Card className="w-full p-7 text-center">
        {phase === 'polling' && (
          <div className="flex flex-col items-center py-6">
            <Spinner className="h-10 w-10 text-amber-500" />
            <h1 className="mt-5 text-lg font-semibold text-stone-900">Confirming your payment…</h1>
            <p className="mt-1 text-sm text-stone-500">
              Waiting for the payment gateway to confirm.
              {payment ? ` ${money(payment.amountMinor, payment.currency)}` : ''}
            </p>
            <p className="mt-4 text-xs text-stone-400">Please keep this page open. It updates automatically.</p>
          </div>
        )}

        {phase === 'done' && payment && payment.status === 'PAID' && (
          <ResultLayout tone="success" title={isDelivery ? 'Delivery charges paid' : 'Payment successful'}>
            {isDelivery ? (
              <>
                <p className="text-sm text-stone-600">
                  {money(payment.amountMinor, payment.currency)} received. Your delivery code is now available on the
                  tracking page.
                </p>
                <div className="mt-6 space-y-2">
                  <LinkButton to={deliveryLink} size="lg" fullWidth>
                    Track delivery
                  </LinkButton>
                  <LinkButton to="/" variant="secondary" fullWidth>
                    Home
                  </LinkButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-3xl font-semibold tabular-nums text-emerald-600">
                  +{formatMg(payment.goldMg ?? 0)} g <span className="text-lg font-medium">added</span>
                </p>
                <p className="mt-2 text-sm text-stone-500">Paid {money(payment.amountMinor, payment.currency)}</p>
                <div className="mt-6 space-y-2">
                  <LinkButton to="/" size="lg" fullWidth>
                    View wallet
                  </LinkButton>
                  <LinkButton to="/history" variant="secondary" fullWidth>
                    View receipt in History
                  </LinkButton>
                </div>
              </>
            )}
          </ResultLayout>
        )}

        {phase === 'done' && payment && payment.status === 'FAILED' && (
          <ResultLayout tone="failure" title="Payment failed">
            <p className="text-sm text-stone-600">
              {isDelivery
                ? 'The delivery charges were not paid. If they are not paid in time the request is cancelled and your gold is released back to your wallet.'
                : 'No money was taken and no gold was added. You can try again with a new price.'}
            </p>
            <div className="mt-6 space-y-2">
              {isDelivery ? (
                <LinkButton to={deliveryLink} size="lg" fullWidth>
                  Back to delivery
                </LinkButton>
              ) : (
                <LinkButton to="/buy" size="lg" fullWidth>
                  Try again
                </LinkButton>
              )}
              <LinkButton to="/" variant="secondary" fullWidth>
                Home
              </LinkButton>
            </div>
          </ResultLayout>
        )}

        {phase === 'done' && payment && payment.status === 'LATE_PAID_REFUND' && (
          <ResultLayout tone="pending" title="Refund will be issued">
            <p className="text-sm text-stone-600">
              Your payment of {money(payment.amountMinor, payment.currency)} could not be applied
              {isDelivery ? ' to this delivery' : ''}. A full refund will be issued to your original payment method.
              {isDelivery ? '' : ' No gold was added.'}
            </p>
            <div className="mt-6 space-y-2">
              <LinkButton to={isDelivery ? deliveryLink : '/buy'} size="lg" fullWidth>
                {isDelivery ? 'Back to delivery' : 'Buy again'}
              </LinkButton>
              <LinkButton to="/" variant="secondary" fullWidth>
                Home
              </LinkButton>
            </div>
          </ResultLayout>
        )}

        {phase === 'timeout' && (
          <ResultLayout tone="pending" title="Still processing">
            <p className="text-sm text-stone-600">
              Still processing — check History later. Gold is only added once the gateway confirms your payment.
            </p>
            <div className="mt-6 space-y-2">
              <Button size="lg" fullWidth onClick={restart}>
                Check again
              </Button>
              <LinkButton to="/history" variant="secondary" fullWidth>
                Go to History
              </LinkButton>
            </div>
          </ResultLayout>
        )}

        {phase === 'error' && (
          <ResultLayout tone="failure" title="Something went wrong">
            <p className="text-sm text-stone-600">{errorText}</p>
            <div className="mt-6 space-y-2">
              {orderId && (
                <Button size="lg" fullWidth onClick={restart}>
                  Try again
                </Button>
              )}
              <LinkButton to="/" variant="secondary" fullWidth>
                Home
              </LinkButton>
            </div>
          </ResultLayout>
        )}
      </Card>
    </div>
  );
}

function ResultLayout({
  tone,
  title,
  children,
}: {
  tone: 'success' | 'failure' | 'pending';
  title: string;
  children: ReactNode;
}) {
  const icon =
    tone === 'success' ? (
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckIcon className="h-7 w-7" />
      </span>
    ) : tone === 'failure' ? (
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
        <XCircleIcon className="h-7 w-7" />
      </span>
    ) : (
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <ClockIcon className="h-7 w-7" />
      </span>
    );
  return (
    <div className="flex flex-col items-center py-2">
      {icon}
      <h1 className="mb-2 mt-4 text-xl font-semibold text-stone-900">{title}</h1>
      <div className="w-full">{children}</div>
    </div>
  );
}
