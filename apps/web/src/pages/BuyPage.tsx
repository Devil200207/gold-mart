import { useState, type FormEvent } from 'react';
import { api, type ApiError, type CreateQuoteBody, type Quote } from '../lib/api';
import { useAction } from '../lib/hooks';
import { usePrice } from '../lib/price';
import { formatMoney, parseGramsToMg, parseMoneyToMinor, sanitizeDecimalInput } from '../lib/units';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button, LinkButton } from '../components/Button';
import { Banner } from '../components/Banner';
import { QuoteCard } from '../components/QuoteCard';
import { clockOffsetFrom, useCountdown } from '../components/Countdown';

type Mode = 'amount' | 'grams';

const AMOUNT_PRESETS = ['100', '500', '1000'];
const GRAM_PRESETS = ['1', '5', '10'];

function QuoteErrorBanner({ error }: { error: ApiError }) {
  if (error.code === 'KYC_REQUIRED') {
    return (
      <Banner
        tone="warning"
        title="Identity verification needed"
        action={
          <LinkButton to="/profile" size="sm" variant="dark">
            Verify identity
          </LinkButton>
        }
      >
        {error.message}
      </Banner>
    );
  }
  return <Banner tone="error">{error.message}</Banner>;
}

export function BuyPage() {
  const { price, currency, decimals } = usePrice();
  const [mode, setMode] = useState<Mode>('amount');
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [quoteInvalid, setQuoteInvalid] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const remainingMs = useCountdown(quote?.expiresAt, offsetMs);
  const expired = quote !== null && remainingMs <= 0;

  /** Validates the input and returns the integer request body, or null. */
  const buildQuoteBody = (): CreateQuoteBody | null => {
    if (mode === 'amount') {
      const amountMinor = parseMoneyToMinor(input, decimals);
      if (amountMinor === null) {
        setInputError(`Enter an amount like 250${decimals > 0 ? `.${'0'.repeat(decimals)}` : ''} (max ${decimals} decimals)`);
        return null;
      }
      if (amountMinor <= 0) {
        setInputError('Enter an amount above zero');
        return null;
      }
      return { side: 'BUY', amountMinor };
    }
    const goldMg = parseGramsToMg(input);
    if (goldMg === null) {
      setInputError('Enter grams with up to 3 decimals, e.g. 1.250');
      return null;
    }
    if (goldMg <= 0) {
      setInputError('Enter a weight above zero');
      return null;
    }
    return { side: 'BUY', goldMg };
  };

  const getQuote = useAction(async (key, body: CreateQuoteBody) => {
    const q = await api.createQuote(body, key);
    setOffsetMs(clockOffsetFrom(q.serverTime));
    setQuote(q);
    setQuoteInvalid(false);
  });

  const pay = useAction(async (key, quoteId: string) => {
    try {
      const order = await api.createBuyOrder(quoteId, key);
      setRedirecting(true);
      window.location.href = order.checkoutUrl;
    } catch (e) {
      if ((e as ApiError).code === 'QUOTE_INVALID') setQuoteInvalid(true);
      throw e;
    }
  });

  const requestQuote = () => {
    const body = buildQuoteBody();
    if (!body) return;
    setInputError(null);
    pay.clearError();
    void getQuote.run(body);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    requestQuote();
  };

  const resetQuote = () => {
    setQuote(null);
    setQuoteInvalid(false);
    pay.clearError();
    getQuote.clearError();
  };

  const onModeChange = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setInput('');
    setInputError(null);
    resetQuote();
  };

  const presets = mode === 'amount' ? AMOUNT_PRESETS : GRAM_PRESETS;
  const busy = getQuote.pending || pay.pending || redirecting;
  const needsNewQuote = expired || quoteInvalid;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Buy gold"
        subtitle={
          price
            ? `Live buy price ${formatMoney(price.buyPerGramMinor, price.currency, price.currencyDecimals)} / g`
            : 'Buy any amount, from a fraction of a gram'
        }
      />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-semibold" role="tablist">
            {(['amount', 'grams'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                disabled={busy}
                onClick={() => onModeChange(m)}
                className={`rounded-lg py-2 transition ${
                  mode === m ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                {m === 'amount' ? 'By amount' : 'By grams'}
              </button>
            ))}
          </div>

          <Input
            label={mode === 'amount' ? `Amount (${currency})` : 'Weight (grams)'}
            inputMode="decimal"
            autoComplete="off"
            placeholder={mode === 'amount' ? '250.00' : '1.000'}
            value={input}
            suffix={mode === 'amount' ? currency : 'g'}
            disabled={pay.pending || redirecting}
            onChange={(e) => {
              setInput(sanitizeDecimalInput(e.target.value));
              setInputError(null);
              if (quote) resetQuote();
            }}
            error={inputError}
            className="text-lg font-semibold tabular-nums"
          />

          <div className="flex gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                disabled={busy}
                onClick={() => {
                  setInput(p);
                  setInputError(null);
                  if (quote) resetQuote();
                }}
                className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-amber-100 hover:text-amber-800 disabled:opacity-50"
              >
                {mode === 'amount' ? `${currency} ${p}` : `${p} g`}
              </button>
            ))}
          </div>

          {getQuote.error && <QuoteErrorBanner error={getQuote.error} />}

          {!quote && (
            <Button type="submit" size="lg" fullWidth loading={getQuote.pending} disabled={input.trim() === ''}>
              Get price
            </Button>
          )}
        </form>
      </Card>

      {quote && (
        <QuoteCard quote={quote} decimals={decimals} remainingMs={remainingMs}>
          {needsNewQuote ? (
            <div className="space-y-3">
              <Banner tone="warning" title={quoteInvalid ? 'This price is no longer valid' : 'Quote expired'}>
                Prices are locked for a short time. Get a new price to continue.
              </Banner>
              <Button size="lg" fullWidth loading={getQuote.pending} onClick={requestQuote}>
                Get new price
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {pay.error && pay.error.code !== 'QUOTE_INVALID' && <Banner tone="error">{pay.error.message}</Banner>}
              <Button
                size="lg"
                fullWidth
                loading={pay.pending || redirecting}
                disabled={expired || getQuote.pending}
                onClick={() => void pay.run(quote.id)}
              >
                {redirecting ? 'Opening checkout…' : `Pay ${formatMoney(quote.totalMinor, quote.currency, decimals)}`}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs font-medium text-stone-500 hover:text-stone-800 disabled:opacity-50"
                disabled={busy}
                onClick={resetQuote}
              >
                Change amount
              </button>
              <p className="text-center text-xs text-stone-400">
                Gold is added to your wallet once the payment gateway confirms your payment.
              </p>
            </div>
          )}
        </QuoteCard>
      )}
    </div>
  );
}
