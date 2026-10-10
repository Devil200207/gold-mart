import { Button } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage(page: number): void;
  disabled?: boolean;
  newerOlder?: boolean;
}

export function Pagination({ page, pageSize, total, onPage, disabled = false, newerOlder = false }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize && page <= 1) {
    return <p className="py-2 text-center text-xs text-stone-400">{total === 1 ? '1 item' : `${total} items`}</p>;
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <Button variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        {newerOlder ? '← Newer' : '← Previous'}
      </Button>
      <span className="text-xs text-stone-500 tabular-nums">
        Page {page} of {pages} · {total} total
      </span>
      <Button variant="secondary" size="sm" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>
        {newerOlder ? 'Older →' : 'Next →'}
      </Button>
    </div>
  );
}
