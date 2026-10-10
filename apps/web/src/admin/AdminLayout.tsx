import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { adminApi, type AdminIntegrityResponse } from '../lib/api';
import { useAdmin, useAdminAuth } from '../lib/adminAuth';
import { formatDateTime } from '../lib/labels';
import { Badge } from '../components/Badge';
import { GoldBarIcon, LogoutIcon, MenuIcon, CloseIcon } from '../components/icons';

interface IntegrityContextValue {
  integrity: AdminIntegrityResponse | null;
  refreshIntegrity(): Promise<void>;
}

const IntegrityContext = createContext<IntegrityContextValue | null>(null);

export function useIntegrity(): IntegrityContextValue {
  const ctx = useContext(IntegrityContext);
  if (!ctx) throw new Error('useIntegrity must be used inside <AdminLayout>');
  return ctx;
}

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/users', label: 'Users', end: false },
  { to: '/admin/ledger', label: 'Ledger', end: false },
  { to: '/admin/deliveries', label: 'Deliveries', end: false },
  { to: '/admin/reversals', label: 'Reversals', end: false },
  { to: '/admin/audit', label: 'Audit log', end: false },
];

function NavItems({ onNavigate }: { onNavigate?(): void }) {
  return (
    <ul className="space-y-1">
      {NAV.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-amber-500/15 text-amber-300' : 'text-stone-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function AdminIdentity() {
  const admin = useAdmin();
  const { logout } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-t border-white/10 pt-4">
      <p className="text-sm font-semibold text-white">{admin.username}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {admin.roles.map((r) => (
          <span key={r} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-stone-200">
            {r}
          </span>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void logout();
        }}
        className="mt-3 flex items-center gap-2 text-sm text-stone-400 hover:text-white disabled:opacity-50"
      >
        <LogoutIcon className="h-4 w-4" /> Log out
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-600 text-stone-950">
        <GoldBarIcon className="h-5 w-5" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">Gold Wallet</p>
        <p className="text-[11px] text-stone-400">Admin console</p>
      </div>
    </div>
  );
}

function IntegrityBanner({ integrity }: { integrity: AdminIntegrityResponse | null }) {
  const latest = integrity?.latest;
  if (!latest || latest.ok !== false) return null;
  return (
    <div role="alert" className="bg-red-600 px-4 py-3 text-white sm:px-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">
          Ledger integrity check FAILED · {formatDateTime(latest.finishedAt)} · {latest.failures.length} issue
          {latest.failures.length === 1 ? '' : 's'}
        </p>
        <ul className="list-inside list-disc text-xs text-red-50">
          {latest.failures.slice(0, 8).map((f, i) => (
            <li key={`${f.check}-${f.seq ?? ''}-${f.userId ?? ''}-${i}`}>
              <span className="font-semibold">{f.check}</span>
              {f.seq !== undefined ? ` · seq ${f.seq}` : ''}
              {f.userId ? ` · user ${f.userId}` : ''} — {f.message}
            </li>
          ))}
          {latest.failures.length > 8 && <li>…and {latest.failures.length - 8} more (see dashboard)</li>}
        </ul>
      </div>
    </div>
  );
}

/** Admin shell: sidebar on desktop, top bar + drawer on mobile, integrity banner on every page. */
export function AdminLayout() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [integrity, setIntegrity] = useState<AdminIntegrityResponse | null>(null);

  const refreshIntegrity = useCallback(async () => {
    try {
      setIntegrity(await adminApi.integrity());
    } catch {
      // A failure here is shown by the page itself (or redirects on 401).
    }
  }, []);

  // Every admin page checks the latest integrity result.
  useEffect(() => {
    void refreshIntegrity();
    setDrawerOpen(false);
  }, [location.pathname, refreshIntegrity]);

  return (
    <IntegrityContext.Provider value={{ integrity, refreshIntegrity }}>
      <div className="min-h-screen bg-stone-100 lg:flex">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 flex-none flex-col justify-between bg-stone-950 px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-screen">
          <div className="space-y-8">
            <Brand />
            <nav>
              <NavItems />
            </nav>
          </div>
          <AdminIdentity />
        </aside>

        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between bg-stone-950 px-4 py-3 lg:hidden">
          <Brand />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-stone-300 hover:bg-white/10 hover:text-white"
            aria-label="Open menu"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
        </div>
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-stone-950/60" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-slide-up flex-col justify-between bg-stone-950 px-4 py-5">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <Brand />
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-white/10 hover:text-white"
                    aria-label="Close menu"
                  >
                    <CloseIcon className="h-5 w-5" />
                  </button>
                </div>
                <nav>
                  <NavItems onNavigate={() => setDrawerOpen(false)} />
                </nav>
              </div>
              <AdminIdentity />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <IntegrityBanner integrity={integrity} />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </IntegrityContext.Provider>
  );
}

export function AdminPageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function RoleNote({ role }: { role: string }) {
  return <Badge tone="gray">View only · requires {role}</Badge>;
}
