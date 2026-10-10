import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeftIcon } from './icons';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  right?: ReactNode;
}

export function PageHeader({ title, subtitle, backTo, right }: PageHeaderProps) {
  return (
    <header className="mb-5 flex items-center gap-3">
      {backTo && (
        <Link
          to={backTo}
          className="-ml-1 flex h-9 w-9 flex-none items-center justify-center rounded-full text-stone-600 hover:bg-stone-200/60"
          aria-label="Back"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
