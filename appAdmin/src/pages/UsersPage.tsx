import { useCallback, useEffect, useState } from 'react';

import { fetchPortalUsers, unlockUserDevice, type PortalUser } from '../lib/api';
import { getAdminToken } from '../lib/auth-storage';
import { useAdminAuth } from '../contexts/AdminAuthContext';

export function UsersPage() {
  const { hasPermission } = useAdminAuth();
  const [items, setItems] = useState<PortalUser[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const token = getAdminToken();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetchPortalUsers(token, { q: q.trim() || undefined, limit: 50 });
      setItems(resp.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [token, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unlock(user: PortalUser) {
    if (!token || !hasPermission('users', 'edit')) return;
    if (!window.confirm(`Unlock device lock for ${user.email}?`)) return;
    setBusyId(user.id);
    try {
      await unlockUserDevice(token, user.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Users</h1>
      <div className="mt-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email or name"
          className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Search
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Device lock</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{user.name || '—'}</div>
                    <div className="text-slate-500">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">{user.deviceLockEnabled ? 'Locked' : 'Off'}</td>
                  <td className="px-4 py-3 text-right">
                    {user.deviceLockEnabled && hasPermission('users', 'edit') && (
                      <button
                        type="button"
                        disabled={busyId === user.id}
                        onClick={() => void unlock(user)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                      >
                        Unlock
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
