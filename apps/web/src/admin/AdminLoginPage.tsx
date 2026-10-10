import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { adminApi } from '../lib/api';
import { useAdminAuth } from '../lib/adminAuth';
import { useAction } from '../lib/hooks';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Banner } from '../components/Banner';
import { GoldBarIcon } from '../components/icons';

interface AdminLoginState {
  from?: string;
  reason?: string;
}

function safeAdminRedirect(from: string | undefined): string {
  if (!from || !from.startsWith('/admin') || from.startsWith('/admin/login')) return '/admin';
  return from;
}

export function AdminLoginPage() {
  const { status, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as AdminLoginState;
  const redirectTo = safeAdminRedirect(state.from);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [devCode, setDevCode] = useState<{ username: string; code: string } | null>(null);
  const [devLoading, setDevLoading] = useState(false);

  const submit = useAction(async (_key) => {
    await login(username.trim(), password, totp);
    navigate(redirectTo, { replace: true });
  });

  const fetchDevCode = async () => {
    const name = username.trim();
    if (!name || devLoading) return;
    setDevLoading(true);
    const res = await adminApi.devTotp(name); // null on 404 (dev mode off) — ignored
    setDevCode(res);
    setDevLoading(false);
  };

  if (status === 'authenticated') return <Navigate to={redirectTo} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || !/^\d{6}$/.test(totp)) return;
    void submit.run();
  };

  const expired = state.reason === 'SESSION_EXPIRED' || state.reason === 'UNAUTHENTICATED';

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-stone-950">
            <GoldBarIcon className="h-7 w-7" />
          </span>
          <h1 className="text-xl font-semibold text-white">Admin console</h1>
          <p className="mt-1 text-sm text-stone-400">Password and authenticator code required</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl" noValidate>
          {expired && state.from && (
            <Banner tone="warning">Your session expired after inactivity. Please sign in again.</Banner>
          )}
          <Input
            label="Username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setDevCode(null);
            }}
            onBlur={() => void fetchDevCode()}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Authenticator code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="font-mono tracking-[0.3em]"
          />
          <div className="flex items-center justify-between text-xs">
            {devCode ? (
              <span className="rounded-lg bg-sky-50 px-2 py-1 text-sky-800 ring-1 ring-sky-200">
                Dev: current code <span className="font-mono font-semibold">{devCode.code}</span>
                <button type="button" className="ml-2 font-semibold underline" onClick={() => setTotp(devCode.code)}>
                  Use
                </button>
              </span>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="font-medium text-stone-500 hover:text-stone-800 disabled:opacity-50"
              disabled={!username.trim() || devLoading}
              onClick={() => void fetchDevCode()}
            >
              {devLoading ? 'Checking…' : 'Show dev code'}
            </button>
          </div>
          {submit.error && <Banner tone="error">{submit.error.message}</Banner>}
          <Button
            type="submit"
            variant="dark"
            size="lg"
            fullWidth
            loading={submit.pending}
            disabled={!username.trim() || !password || totp.length !== 6}
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
