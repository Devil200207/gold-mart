import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

/** Desktop-friendly table that scrolls horizontally on small screens. */
export function Table({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/80">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`whitespace-nowrap border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`border-b border-stone-100 px-4 py-3 align-top text-stone-700 ${className}`} {...rest}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-stone-500">
        {children}
      </td>
    </tr>
  );
}

export function LoadingRows({ colSpan, rows = 5 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          <td colSpan={colSpan} className="border-b border-stone-100 px-4 py-3">
            <div className="h-4 w-full animate-pulse rounded bg-stone-200/70" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="font-mono text-xs text-stone-600" title={title}>
      {children}
    </span>
  );
}

/** Filter bar wrapper for admin list pages. */
export function FilterBar({ children, onSubmit }: { children: ReactNode; onSubmit(): void }) {
  return (
    <form
      className="mb-4 grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/80 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}
