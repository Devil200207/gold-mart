import { Route, Routes } from 'react-router-dom';
import { PriceProvider } from './lib/price';
import { RequireAuth, UserRoot } from './lib/auth';
import { AdminRoot, RequireAdmin } from './lib/adminAuth';
import { UserLayout } from './pages/UserLayout';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { BuyPage } from './pages/BuyPage';
import { PaymentReturnPage } from './pages/PaymentReturnPage';
import { SellPage } from './pages/SellPage';
import { DeliverPage } from './pages/DeliverPage';
import { DeliveryTrackingPage } from './pages/DeliveryTrackingPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminLayout } from './admin/AdminLayout';
import { AdminLoginPage } from './admin/AdminLoginPage';
import { DashboardPage } from './admin/DashboardPage';
import { UserDetailPage, UsersPage } from './admin/UsersPage';
import { LedgerPage } from './admin/LedgerPage';
import { DeliveriesPage } from './admin/DeliveriesPage';
import { ReversalsPage } from './admin/ReversalsPage';
import { AuditPage } from './admin/AuditPage';

export function App() {
  return (
    <PriceProvider>
      <Routes>
        {/* User app: session restored from the refresh cookie on load */}
        <Route element={<UserRoot />}>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <UserLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/buy" element={<BuyPage />} />
            <Route path="/payment/return" element={<PaymentReturnPage />} />
            <Route path="/sell" element={<SellPage />} />
            <Route path="/deliver" element={<DeliverPage />} />
            <Route path="/deliveries/:id" element={<DeliveryTrackingPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        {/* Admin console: separate session (token in sessionStorage) */}
        <Route path="/admin" element={<AdminRoot />}>
          <Route path="login" element={<AdminLoginPage />} />
          <Route
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<UserDetailPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="deliveries" element={<DeliveriesPage />} />
            <Route path="reversals" element={<ReversalsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="*" element={<NotFoundPage admin />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </PriceProvider>
  );
}
