export function Spinner({ className = 'h-5 w-5', label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <svg className={`animate-spin text-current ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-90" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 text-stone-500">
      <Spinner className="h-6 w-6 text-amber-500" label={label} />
    </div>
  );
}

export function CenteredSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-stone-500">
      <Spinner className="h-5 w-5 text-amber-500" label={label} />
    </div>
  );
}
