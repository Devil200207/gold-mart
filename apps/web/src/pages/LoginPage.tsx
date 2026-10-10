import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useNow } from '../lib/hooks';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Banner } from '../components/Banner';
import { Card } from '../components/Card';
import { GoldBarIcon } from '../components/icons';

const RESEND_SECONDS = 30;

interface LoginLocationState {
  from?: string;
  expired?: boolean;
}

function safeRedirect(from: string | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/login') || from.startsWith('/admin')) {
    return '/';
  }
  return from;
}

export function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LoginLocationState;
  const redirectTo = safeRedirect(state.from);

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const now = useNow(500);

  const normalizedEmail = email.trim().toLowerCase();

  const requestOtp = useAction(async (_key, mode: 'send' | 'resend') => {
    const res = await api.requestOtp(normalizedEmail);
    setDevOtp(res.devOtp ?? null);
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
    setStep('otp');
    setOtp('');
    setNotice(mode === 'resend' ? `A new code was sent to ${normalizedEmail}.` : null);
  });

  const verify = useAction(async (_key) => {
    const session = await api.verifyOtp(normalizedEmail, otp);
    signIn(session.user);
    navigate(redirectTo, { replace: true });
  });

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus();
  }, [step]);

  if (status === 'authenticated') return <Navigate to={redirectTo} replace />;

  const onSubmitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('Enter a valid email address');
      return;
    }
    setEmailError(null);
    void requestOtp.run('send');
  };

  const onSubmitOtp = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return;
    void verify.run();
  };

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-amber-50 via-stone-100 to-stone-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 text-white shadow-lg shadow-amber-500/30">
            <GoldBarIcon className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Gold Wallet</h1>
          <p className="mt-1 text-sm text-stone-500">Buy, sell and receive real gold, gram by gram.</p>
        </div>

        <Card className="p-6">
          {state.expired && step === 'email' && (
            <Banner tone="warning" className="mb-4">
              Your session ended. Please sign in again.
            </Banner>
          )}

          {step === 'email' ? (
            <form onSubmit={onSubmitEmail} className="space-y-4" noValidate>
              <Input
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={emailError}
              />
              {requestOtp.error && <Banner tone="error">{requestOtp.error.message}</Banner>}
              <Button type="submit" size="lg" fullWidth loading={requestOtp.pending}>
                Send login code
              </Button>
            </form>
          ) : (
            <form onSubmit={onSubmitOtp} className="space-y-4" noValidate>
              <div>
                <p className="text-sm text-stone-600">
                  Enter the 6-digit code sent to <span className="font-semibold text-stone-900">{normalizedEmail}</span>
                </p>
              </div>
              {devOtp && (
                <Banner tone="info">
                  Dev mode code: <span className="font-mono font-semibold tracking-widest">{devOtp}</span>
                  <button
                    type="button"
                    className="ml-2 text-xs font-semibold underline underline-offset-2"
                    onClick={() => setOtp(devOtp)}
                  >
                    Fill in
                  </button>
                </Banner>
              )}
              {notice && <Banner tone="success">{notice}</Banner>}
              <Input
                ref={otpRef}
                label="Login code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center font-mono text-2xl tracking-[0.5em]"
              />
              {verify.error && <Banner tone="error">{verify.error.message}</Banner>}
              {requestOtp.error && <Banner tone="error">{requestOtp.error.message}</Banner>}
              <Button type="submit" size="lg" fullWidth loading={verify.pending} disabled={otp.length !== 6}>
                Verify and sign in
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="font-medium text-stone-500 hover:text-stone-800"
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                    setDevOtp(null);
                    setNotice(null);
                    requestOtp.clearError();
                    verify.clearError();
                  }}
                >
                  Use a different email
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={secondsLeft > 0}
                  loading={requestOtp.pending}
                  onClick={() => void requestOtp.run('resend')}
                >
                  {secondsLeft > 0 ? `Resend in 0:${String(secondsLeft).padStart(2, '0')}` : 'Resend code'}
                </Button>
              </div>
            </form>
          )}
        </Card>
        <p className="mt-6 text-center text-xs text-stone-400">
          Prototype · mock payments, mock KYC, mock price feed
        </p>
      </div>
    </div>
  );
}
