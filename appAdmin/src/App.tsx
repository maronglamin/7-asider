import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from './components/AdminLayout';
import { RequirePermission } from './components/RequirePermission';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import { BookingsPage } from './pages/BookingsPage';
import { ContractsPage } from './pages/ContractsPage';
import { DashboardPage } from './pages/DashboardPage';
import { FieldDetailPage } from './pages/FieldDetailPage';
import { FieldFlyersPage } from './pages/FieldFlyersPage';
import { FieldKycPage } from './pages/FieldKycPage';
import { LoginPage } from './pages/LoginPage';
import { PendingRefundDetailPage, PendingRefundsPage } from './pages/PendingRefundsPage';
import { TotpSetupPage } from './pages/TotpSetupPage';
import { UsersPage } from './pages/UsersPage';
import { GroupsPage } from './pages/system/GroupsPage';
import { OperatorsPage } from './pages/system/OperatorsPage';
import { RolesPage } from './pages/system/RolesPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { admin, loading, isAuthenticated } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Restoring session…</p>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup-totp" element={<TotpSetupPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <RequirePermission moduleKey="dashboard">
                  <DashboardPage />
                </RequirePermission>
              }
            />
            <Route
              path="users"
              element={
                <RequirePermission moduleKey="users">
                  <UsersPage />
                </RequirePermission>
              }
            />
            <Route
              path="field-kyc"
              element={
                <RequirePermission moduleKey="field-kyc">
                  <FieldKycPage />
                </RequirePermission>
              }
            />
            <Route
              path="field-kyc/:id"
              element={
                <RequirePermission moduleKey="field-kyc">
                  <FieldDetailPage />
                </RequirePermission>
              }
            />
            <Route
              path="field-flyers"
              element={
                <RequirePermission moduleKey="field-kyc">
                  <FieldFlyersPage />
                </RequirePermission>
              }
            />
            <Route
              path="bookings"
              element={
                <RequirePermission moduleKey="bookings">
                  <BookingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="pending-refunds"
              element={
                <RequirePermission moduleKey="pending-refunds">
                  <PendingRefundsPage />
                </RequirePermission>
              }
            />
            <Route
              path="pending-refunds/:id"
              element={
                <RequirePermission moduleKey="pending-refunds">
                  <PendingRefundDetailPage />
                </RequirePermission>
              }
            />
            <Route
              path="contracts"
              element={
                <RequirePermission moduleKey="contract-invitations">
                  <ContractsPage />
                </RequirePermission>
              }
            />
            <Route
              path="system/roles"
              element={
                <RequirePermission moduleKey="system-config-roles">
                  <RolesPage />
                </RequirePermission>
              }
            />
            <Route
              path="system/groups"
              element={
                <RequirePermission moduleKey="system-config-groups">
                  <GroupsPage />
                </RequirePermission>
              }
            />
            <Route
              path="system/operators"
              element={
                <RequirePermission moduleKey="system-config-operators">
                  <OperatorsPage />
                </RequirePermission>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AdminAuthProvider>
  );
}
