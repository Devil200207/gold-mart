import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ padded = true, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/80 ${padded ? 'p-5' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{children}</h2>
      {action}
    </div>
  );
}

/** Label / value row used in quote cards and summaries. */
export function Row({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? 'text-base' : 'text-sm'}`}>
      <dt className={muted ? 'text-stone-400' : 'text-stone-500'}>{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'font-semibold text-stone-900' : 'text-stone-800'}`}>{value}</dd>
    </div>
  );
}
