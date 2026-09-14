import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Building2,
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Shield,
  UserCog,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';

import { useAdminAuth } from '../contexts/AdminAuthContext';

const mainNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, moduleKey: 'dashboard' },
  { to: '/users', label: 'Users', icon: Users, moduleKey: 'users' },
  { to: '/field-kyc', label: 'Asset owners', icon: Building2, moduleKey: 'field-kyc' },
  { to: '/field-flyers', label: 'Field flyers', icon: Megaphone, moduleKey: 'field-kyc' },
  { to: '/bookings', label: 'Bookings', icon: CalendarCheck, moduleKey: 'bookings' },
  { to: '/pending-refunds', label: 'Pending refunds', icon: Wallet, moduleKey: 'pending-refunds' },
  { to: '/contracts', label: 'Contracts', icon: Mail, moduleKey: 'contract-invitations' },
] as const;

const systemNav = [
  { to: '/system/roles', label: 'Roles', icon: Shield, moduleKey: 'system-config-roles' },
  { to: '/system/groups', label: 'Groups', icon: UsersRound, moduleKey: 'system-config-groups' },
  { to: '/system/operators', label: 'Operators', icon: UserCog, moduleKey: 'system-config-operators' },
] as const;

export function AdminLayout() {
  const { admin, hasPermission, signOut } = useAdminAuth();
  const navigate = useNavigate();

  const visibleMain = mainNav.filter((item) => hasPermission(item.moduleKey));
  const visibleSystem = systemNav.filter((item) => hasPermission(item.moduleKey));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-5">
          <div className="text-lg font-extrabold text-green-700">7-aside Admin</div>
          <div className="mt-1 truncate text-xs text-slate-500">{admin?.email}</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {admin?.adminUserType || 'OPERATOR'}
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleMain.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-green-50 text-green-700' : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
          {visibleSystem.length > 0 && (
            <>
              <div className="px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                System
              </div>
              {visibleSystem.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-green-50 text-green-700' : 'text-slate-600 hover:bg-slate-50'
                    }`
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <button
          type="button"
          onClick={() => {
            signOut();
            navigate('/login', { replace: true });
          }}
          className="m-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
