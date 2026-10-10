import { LinkButton } from '../components/Button';

export function NotFoundPage({ admin = false }: { admin?: boolean }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-stone-900">Page not found</h1>
      <p className="mt-1 text-sm text-stone-500">The page you are looking for does not exist.</p>
      <LinkButton to={admin ? '/admin' : '/'} className="mt-6">
        {admin ? 'Back to dashboard' : 'Back to home'}
      </LinkButton>
    </div>
  );
}
