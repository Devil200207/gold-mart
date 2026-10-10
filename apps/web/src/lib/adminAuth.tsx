import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { adminApi, getAdminToken, setAdminToken, setAdminUnauthorizedHandler, type Admin, type AdminRole } from './api';
import { FullScreenSpinner } from '../components/Spinner';

type AdminStatus = 'loading' | 'authenticated' | 'anonymous';

interface AdminAuthContextValue {
  status: AdminStatus;
  admin: Admin | null;
  login(username: string, password: string, totp: string): Promise<Admin>;
  logout(): Promise<void>;
  hasRole(role: AdminRole): boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminStatus>(() => (getAdminToken() ? 'loading' : 'anonymous'));
  const [admin, setAdmin] = useState<Admin | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setAdminUnauthorizedHandler((error) => {
      setAdmin(null);
      setStatus('anonymous');
      const from = `${window.location.pathname}${window.location.search}`;
      if (window.location.pathname !== '/admin/login') {
        navigate('/admin/login', { replace: true, state: { from, reason: error.code } });
      }
    });
    return () => setAdminUnauthorizedHandler(null);
  }, [navigate]);

  // Restore the admin profile if a token survives in sessionStorage.
  useEffect(() => {
    if (!getAdminToken()) return undefined;
    let cancelled = false;
    adminApi
      .me()
      .then((me) => {
        if (cancelled) return;
        setAdmin(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setAdminToken(null);
        setAdmin(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string, totp: string) => {
    const res = await adminApi.login(username, password, totp);
    setAdmin(res.admin);
    setStatus('authenticated');
    return res.admin;
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminApi.logout();
    } catch {
      // Token is cleared regardless.
    }
    setAdmin(null);
    setStatus('anonymous');
    navigate('/admin/login', { replace: true });
  }, [navigate]);

  const hasRole = useCallback((role: AdminRole) => Boolean(admin?.roles.includes(role)), [admin]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ status, admin, login, logout, hasRole }),
    [status, admin, login, logout, hasRole],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function AdminRoot() {
  return (
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>');
  return ctx;
}

export function useAdmin(): Admin {
  const { admin } = useAdminAuth();
  if (!admin) throw new Error('useAdmin requires a signed-in admin');
  return admin;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAdminAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenSpinner label="Loading admin session…" />;
  if (status === 'anonymous') {
    return <Navigate to="/admin/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}
