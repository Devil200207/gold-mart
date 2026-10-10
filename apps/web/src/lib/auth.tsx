import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, refreshSession, setSessionListener, setUserUnauthorizedHandler, type Me } from './api';
import { FullScreenSpinner } from '../components/Spinner';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: Me | null;
  /** Called after a successful OTP verification. */
  signIn(user: Me): void;
  /** Replace the cached profile (after KYC / bank account updates). */
  setUser(user: Me): void;
  reloadUser(): Promise<Me | null>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<Me | null>(null);
  const navigate = useNavigate();

  // Restore the session from the refresh cookie on app start.
  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((session) => {
        if (cancelled) return;
        if (session) {
          setUserState(session.user);
          setStatus('authenticated');
        } else {
          setStatus('anonymous');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSessionListener((next) => {
      if (next) {
        setUserState(next);
        setStatus('authenticated');
      } else {
        setUserState(null);
        setStatus('anonymous');
      }
    });
    setUserUnauthorizedHandler(() => {
      const from = `${window.location.pathname}${window.location.search}`;
      if (window.location.pathname !== '/login') {
        navigate('/login', { replace: true, state: { from, expired: true } });
      }
    });
    return () => {
      setSessionListener(null);
      setUserUnauthorizedHandler(null);
    };
  }, [navigate]);

  const signIn = useCallback((next: Me) => {
    setUserState(next);
    setStatus('authenticated');
  }, []);

  const setUser = useCallback((next: Me) => setUserState(next), []);

  const reloadUser = useCallback(async () => {
    try {
      const me = await api.getMe();
      setUserState(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Even if the request fails, drop the local session.
    }
    setUserState(null);
    setStatus('anonymous');
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, setUser, reloadUser, logout }),
    [status, user, signIn, setUser, reloadUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Layout route element that provides the user session to its children. */
export function UserRoot() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Same as useAuth but asserts a signed-in user (use inside <RequireAuth>). */
export function useUser(): Me {
  const { user } = useAuth();
  if (!user) throw new Error('useUser requires a signed-in user');
  return user;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenSpinner label="Restoring your session…" />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}
