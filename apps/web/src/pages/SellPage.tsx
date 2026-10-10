import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type ApiError, type Quote, type SellOrderResponse } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { useAction, useLoader } from '../lib/hooks';
import { usePrice } from '../lib/price';
import { formatMg, formatMoney, mgToGramsInput, parseGramsToMg, sanitizeDecimalInput } from '../lib/units';
import { PageHeader } from '../components/PageHeader';
import { Card, CardTitle, Row } from '../components/Card';
import { Input } from '../components/Input';
import { Button, LinkButton } from '../components/Button';
import { Banner } from '../components/Banner';
import { QuoteCard } from '../components/QuoteCard';
import { ConfirmDialog } from '../components/Modal';
import { clockOffsetFrom, useCountdown } from '../components/Countdown';
import { BankAccountForm, KycForm } from '../components/ProfileForms';
import { SkeletonCard } from '../components/Skeleton';
import { CheckIcon, XCircleIcon, ClockIcon } from '../components/icons';

export function SellPage() {
  const user = useUser();
  const { setUser, reloadUser } = useAuth();
  const { price, decimals } = usePrice();
  const wallet = useLoader(() => api.getWallet(), []);

  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [quoteInvalid, setQuoteInvalid] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<SellOrderResponse | null>(null);

  // Make sure KYC / bank status is current when the screen opens.
  useEffect(() => {
    void reloadUser();
  }, [reloadUser]);

  const remainingMs = useCountdown(quote?.expiresAt, offsetMs);
  const expired = quote !== null && remainingMs <= 0;
  const availableMg = wallet.data?.availableMg ?? 0;

  const getQuote = useAction(async (key, goldMg: number) => {
    const q = await api.createQuote({ side: 'SELL', goldMg }, key);
    setOffsetMs(clockOffsetFrom(q.serverTime));
    setQuote(q);
    setQuoteInvalid(false);
  });

  const sell = useAction(async (key, quoteId: string) => {
    try {
      const res = await api.createSellOrder(quoteId, key);
      setResult(res);
      setConfirmOpen(false);
      setQuote(null);
      setInput('');
      void wallet.refresh();
    } catch (e) {
      const code = (e as ApiError).code;
      if (code === 'QUOTE_INVALID') {
        setQuoteInvalid(true);
        setConfirmOpen(false);
      }
      if (code === 'KYC_REQUIRED' || code === 'BANK_ACCOUNT_REQUIRED') {
        setConfirmOpen(false);
        void reloadUser();
      }
      throw e;
    }
  });

  const resetQuote = () => {
    setQuote(null);
    setQuoteInvalid(false);
    sell.clearError();
    getQuote.clearError();
  };

  const requestQuote = () => {
    const goldMg = parseGramsToMg(input);
    if (goldMg === null) {
      setInputError('Enter grams with up to 3 decimals, e.g. 1.250');
      return;
    }
    if (goldMg <= 0) {
      setInputError('Enter a weight above zero');
      return;
    }
    if (wallet.data && goldMg > wallet.data.availableMg) {
      setInputError(`You only have ${formatMg(wallet.data.availableMg)} g available`);
      return;
    }
    setInputError(null);
    sell.clearError();
    void getQuote.run(goldMg);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    requestQuote();
  };

  const kycDone = user.kycStatus === 'VERIFIED';
  const bankDone = user.bankAccount !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sell gold"
        subtitle={
          price
            ? `Live sell price ${formatMoney(price.sellPerGramMinor, price.currency, price.currencyDecimals)} / g`
            : 'Sell back to your bank account'
        }
      />

      {result && <SellResult result={result} decimals={decimals} onDone={() => setResult(null)} />}

      {!kycDone && (
        <Card>
          <CardTitle>Step 1 · Verify your identity</CardTitle>
          <p className="mb-4 text-sm text-stone-500">Selling gold requires a verified identity (mock KYC, approved instantly).</p>
          <KycForm onDone={setUser} />
        </Card>
      )}

      {kycDone && !bankDone && (
        <Card>
          <CardTitle>{`Step 2 · Add your bank account`}</CardTitle>
          <p className="mb-4 text-sm text-stone-500">Sale proceeds are paid out to this account.</p>
          <BankAccountForm onDone={setUser} defaultHolder={user.kycName ?? ''} />
        </Card>
      )}

      {kycDone && bankDone && !result && (
        <>
          {wallet.loading && !wallet.data ? (
            <SkeletonCard lines={2} />
          ) : (
            <Card>
              {wallet.error && (
                <Banner tone="error" className="mb-4">
                  {wallet.error.message}
                </Banner>
              )}
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-stone-500">Available to sell</span>
                  <span className="font-semibold tabular-nums text-stone-900">{formatMg(availableMg)} g</span>
                </div>
                <div className="flex items-end gap-2">
                  <Input
                    containerClassName="flex-1"
                    label="Weight to sell (grams)"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="1.000"
                    value={input}
                    suffix="g"
                    disabled={sell.pending}
                    onChange={(e) => {
                      setInput(sanitizeDecimalInput(e.target.value));
                      setInputError(null);
                      if (quote) resetQuote();
                    }}
                    className="text-lg font-semibold tabular-nums"
                  />
                  <Button
                    variant="secondary"
                    className="h-[46px]"
                    disabled={availableMg <= 0 || getQuote.pending || sell.pending}
                    onClick={() => {
                      setInput(mgToGramsInput(availableMg));
                      setInputError(null);
                      if (quote) resetQuote();
                    }}
                  >
                    Max
                  </Button>
                </div>
                {inputError && <p className="-mt-2 text-xs font-medium text-red-600">{inputError}</p>}
                {getQuote.error && <Banner tone="error">{getQuote.error.message}</Banner>}
                {!quote && (
                  <Button
                    type="submit"
                    size="lg"
                    fullWidth
                    loading={getQuote.pending}
                    disabled={input.trim() === '' || availableMg <= 0}
                  >
                    Get price
                  </Button>
                )}
                {availableMg <= 0 && (
                  <p className="text-center text-sm text-stone-500">
                    You have no gold available to sell.{' '}
                    <Link to="/buy" className="font-semibold text-amber-700">
                      Buy gold
                    </Link>
                  </p>
                )}
              </form>
              <p className="mt-4 text-xs text-stone-400">
                Payout to {user.bankAccount?.holderName} · {user.bankAccount?.ibanMasked}
              </p>
            </Card>
          )}

          {quote && (
            <QuoteCard quote={quote} decimals={decimals} remainingMs={remainingMs}>
              {expired || quoteInvalid ? (
                <div className="space-y-3">
                  <Banner tone="warning" title={quoteInvalid ? 'This price is no longer valid' : 'Quote expired'}>
                    Get a new price to continue.
                  </Banner>
                  <Button size="lg" fullWidth loading={getQuote.pending} onClick={requestQuote}>
                    Get new price
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sell.error && !confirmOpen && <Banner tone="error">{sell.error.message}</Banner>}
                  <Button size="lg" fullWidth disabled={sell.pending || getQuote.pending} onClick={() => setConfirmOpen(true)}>
                    Sell {formatMg(quote.goldMg)} g
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-xs font-medium text-stone-500 hover:text-stone-800"
                    onClick={resetQuote}
                    disabled={sell.pending}
                  >
                    Change amount
                  </button>
                </div>
              )}
            </QuoteCard>
          )}
        </>
      )}

      {quote && (
        <ConfirmDialog
          open={confirmOpen}
          title="Confirm sale"
          confirmLabel="Sell now"
          busy={sell.pending}
          confirmDisabled={expired}
          error={sell.error && confirmOpen ? sell.error.message : null}
          onCancel={() => {
            if (!sell.pending) setConfirmOpen(false);
          }}
          onConfirm={() => void sell.run(quote.id)}
        >
          <dl className="divide-y divide-stone-100 rounded-xl bg-stone-50 px-3">
            <Row label="You sell" value={`${formatMg(quote.goldMg)} g`} />
            <Row label="Price per gram" value={formatMoney(quote.pricePerGramMinor, quote.currency, decimals)} />
            <Row label="You receive" value={formatMoney(quote.totalMinor, quote.currency, decimals)} strong />
          </dl>
          <p>
            The gold is debited from your wallet now and the payout is sent to{' '}
            <span className="font-medium text-stone-800">{user.bankAccount?.ibanMasked}</span>.
          </p>
          {expired && <p className="font-medium text-red-600">The quote has expired. Close this and get a new price.</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}

function SellResult({ result, decimals, onDone }: { result: SellOrderResponse; decimals: number; onDone(): void }) {
  const amount = formatMoney(result.payout.amountMinor, result.payout.currency, decimals);
  const failed = result.payout.status === 'FAILED';
  const pending = result.payout.status === 'PENDING';

  return (
    <Card className="animate-slide-up p-6 text-center">
      <div className="flex flex-col items-center">
        {failed ? (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
            <XCircleIcon className="h-7 w-7" />
          </span>
        ) : pending ? (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <ClockIcon className="h-7 w-7" />
          </span>
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckIcon className="h-7 w-7" />
          </span>
        )}
        <h2 className="mt-4 text-xl font-semibold text-stone-900">
          {failed ? 'Payout failed' : pending ? 'Payout processing' : 'Sale complete'}
        </h2>
        {failed ? (
          <div className="mt-3 space-y-3 text-sm text-stone-600">
            <p>
              The bank payout of <span className="font-semibold">{amount}</span> could not be completed.
            </p>
            {result.goldRestored ? (
              <Banner tone="success" title="Your gold was returned">
                {formatMg(result.goldMg)} g has been put back into your wallet automatically.
              </Banner>
            ) : (
              <Banner tone="warning">Your gold will be returned to your wallet shortly.</Banner>
            )}
            {result.message && <p className="text-xs text-stone-500">{result.message}</p>}
          </div>
        ) : (
          <div className="mt-3 space-y-1 text-sm text-stone-600">
            <p>
              Sold <span className="font-semibold tabular-nums">{formatMg(result.goldMg)} g</span>
            </p>
            <p>
              {pending ? 'Payout of ' : ''}
              <span className="text-lg font-semibold text-emerald-600">{amount}</span>
              {pending ? ' is on its way to your bank.' : ' paid to your bank account.'}
            </p>
            {result.message && <p className="pt-2 text-xs text-stone-500">{result.message}</p>}
          </div>
        )}
        <div className="mt-6 grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onDone}>
            Sell more
          </Button>
          <LinkButton to="/history">View history</LinkButton>
        </div>
      </div>
    </Card>
  );
}
