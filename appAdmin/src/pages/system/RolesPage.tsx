import { useCallback, useEffect, useState } from 'react';

import {
  createRole,
  deleteRole,
  fetchPermissionsCatalog,
  fetchRole,
  fetchRoles,
  setRolePermissions,
  type PermissionRow,
  type RoleSummary,
} from '../../lib/api';
import { getAdminToken } from '../../lib/auth-storage';
import { useAdminAuth } from '../../contexts/AdminAuthContext';

export function RolesPage() {
  const { hasPermission } = useAdminAuth();
  const token = getAdminToken();
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [roleList, catalog] = await Promise.all([
      fetchRoles(token),
      hasPermission('system-config-roles', 'view')
        ? fetchPermissionsCatalog(token).catch(() => ({ permissions: [] as PermissionRow[] }))
        : Promise.resolve({ permissions: [] as PermissionRow[] }),
    ]);
    setRoles(roleList);
    setPermissions(catalog.permissions || []);
  }, [token, hasPermission]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [load]);

  useEffect(() => {
    if (!token || !selectedId) return;
    fetchRole(token, selectedId)
      .then((role) => setSelectedIds(role.permissionIds))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load role'));
  }, [token, selectedId]);

  async function create() {
    if (!token || !name.trim()) return;
    setBusy(true);
    try {
      const role = await createRole(token, { name: name.trim() });
      setName('');
      await load();
      setSelectedId(role.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function savePermissions() {
    if (!token || !selectedId) return;
    setBusy(true);
    try {
      await setRolePermissions(token, selectedId, selectedIds);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!token || !window.confirm('Delete this role?')) return;
    try {
      await deleteRole(token, id);
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Roles</h1>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {hasPermission('system-config-roles', 'edit') && (
            <div className="mb-4 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New role name"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void create()}
                className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Add
              </button>
            </div>
          )}
          <div className="space-y-2">
            {roles.map((role) => (
              <div
                key={role.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  selectedId === role.id ? 'border-green-500 bg-green-50' : 'border-slate-200'
                }`}
              >
                <button type="button" className="text-left" onClick={() => setSelectedId(role.id)}>
                  <div className="font-semibold">{role.name}</div>
                  <div className="text-xs text-slate-500">
                    {role.permissionCount} permissions · {role.groupCount} groups
                  </div>
                </button>
                {role.name !== 'Owner' && hasPermission('system-config-roles', 'delete') && (
                  <button
                    type="button"
                    onClick={() => void remove(role.id)}
                    className="text-xs font-semibold text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-bold text-slate-900">Permissions</h2>
          {!selectedId ? (
            <p className="mt-2 text-sm text-slate-500">Select a role</p>
          ) : (
            <>
              <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
                {permissions.map((perm) => (
                  <label key={perm.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(perm.id)}
                      disabled={!hasPermission('system-config-roles', 'edit')}
                      onChange={(e) => {
                        setSelectedIds((prev) =>
                          e.target.checked
                            ? [...prev, perm.id]
                            : prev.filter((id) => id !== perm.id),
                        );
                      }}
                    />
                    {perm.moduleKey}:{perm.actionKey}
                  </label>
                ))}
              </div>
              {hasPermission('system-config-roles', 'edit') && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void savePermissions()}
                  className="mt-4 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  Save permissions
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
