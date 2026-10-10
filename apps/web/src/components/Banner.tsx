import type { ReactNode } from 'react';

export type BannerTone = 'error' | 'warning' | 'success' | 'info';

const tones: Record<BannerTone, { box: string; icon: string; glyph: string }> = {
  error: { box: 'bg-red-50 text-red-800 ring-red-200', icon: 'text-red-500', glyph: '!' },
  warning: { box: 'bg-amber-50 text-amber-900 ring-amber-200', icon: 'text-amber-500', glyph: '!' },
  success: { box: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icon: 'text-emerald-500', glyph: '✓' },
  info: { box: 'bg-sky-50 text-sky-800 ring-sky-200', icon: 'text-sky-500', glyph: 'i' },
};

interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Inline message box for errors, warnings and confirmations. */
export function Banner({ tone = 'info', title, children, action, className = '' }: BannerProps) {
  const t = tones[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${t.box} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white text-xs font-bold ${t.icon}`}
      >
        {t.glyph}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
