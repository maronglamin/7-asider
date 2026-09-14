import { Link } from 'react-router-dom';
import {
  Building2,
  CalendarCheck,
  Mail,
  Megaphone,
  Shield,
  UserCog,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';

import { useAdminAuth } from '../contexts/AdminAuthContext';

const tiles = [
  { to: '/users', label: 'Users', desc: 'Browse users and unlock devices', icon: Users, module: 'users' },
  { to: '/field-kyc', label: 'Asset owners', desc: 'Review field KYC submissions', icon: Building2, module: 'field-kyc' },
  { to: '/field-flyers', label: 'Field flyers', desc: '3D phone adverts + field deeplinks', icon: Megaphone, module: 'field-kyc' },
  { to: '/bookings', label: 'Bookings', desc: 'Earnings and booking activity', icon: CalendarCheck, module: 'bookings' },
  { to: '/pending-refunds', label: 'Pending refunds', desc: 'Review and mark refunds complete', icon: Wallet, module: 'pending-refunds' },
  { to: '/contracts', label: 'Contracts', desc: 'Send and track invitations', icon: Mail, module: 'contract-invitations' },
  { to: '/system/roles', label: 'Roles', desc: 'Permission roles', icon: Shield, module: 'system-config-roles' },
  { to: '/system/groups', label: 'Groups', desc: 'Operator groups', icon: UsersRound, module: 'system-config-groups' },
  { to: '/system/operators', label: 'Operators', desc: 'Grant admin access', icon: UserCog, module: 'system-config-operators' },
] as const;

export function DashboardPage() {
  const { admin, hasPermission } = useAdminAuth();
  const visible = tiles.filter((t) => hasPermission(t.module));

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Signed in as {admin?.email}
        {admin?.adminUserType === 'OWNER' ? ' (Owner)' : ''}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-green-300"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-700">
              <tile.icon size={20} />
            </div>
            <div className="font-bold text-slate-900">{tile.label}</div>
            <div className="mt-1 text-sm text-slate-500">{tile.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
