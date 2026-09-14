import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAdminAuth } from '../contexts/AdminAuthContext';

type RequirePermissionProps = {
  moduleKey: string;
  actionKey?: string;
  children: ReactNode;
};

export function RequirePermission({
  moduleKey,
  actionKey = 'view',
  children,
}: RequirePermissionProps) {
  const { hasPermission, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!hasPermission(moduleKey, actionKey)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
