import type { ComponentType, SVGProps } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BuyIcon, DeliverIcon, HistoryIcon, HomeIcon, SellIcon } from '../components/icons';

interface Tab {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  match(pathname: string): boolean;
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: HomeIcon, match: (p) => p === '/' },
  { to: '/buy', label: 'Buy', icon: BuyIcon, match: (p) => p.startsWith('/buy') || p.startsWith('/payment') },
  { to: '/sell', label: 'Sell', icon: SellIcon, match: (p) => p.startsWith('/sell') },
  { to: '/deliver', label: 'Deliver', icon: DeliverIcon, match: (p) => p.startsWith('/deliver') },
  { to: '/history', label: 'History', icon: HistoryIcon, match: (p) => p.startsWith('/history') },
];

/** Mobile-first shell: centered column (max ~28rem) and a fixed bottom tab bar. */
export function UserLayout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-stone-100">
      <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-28 pt-5 sm:pt-8">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <ul className="mx-auto grid max-w-md grid-cols-5 px-2 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition ${
                    active ? 'text-amber-600' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
                      active ? 'bg-amber-100' : ''
                    }`}
                  >
                    <Icon className="h-[22px] w-[22px]" />
                  </span>
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
