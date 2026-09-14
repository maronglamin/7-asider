import { useCallback, useEffect, useState } from 'react';

import {
  createGroup,
  deleteGroup,
  fetchGroups,
  fetchRoles,
  type GroupSummary,
  type RoleSummary,
} from '../../lib/api';
import { getAdminToken } from '../../lib/auth-storage';
import { useAdminAuth } from '../../contexts/AdminAuthContext';

export function GroupsPage() {
  const { hasPermission } = useAdminAuth();
  const token = getAdminToken();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    const [groupList, roleList] = await Promise.all([fetchGroups(token), fetchRoles(token)]);
    setGroups(groupList);
    const usable = roleList.filter((r) => r.name !== 'Owner');
    setRoles(usable);
    setRoleId((current) => current || usable.find((r) => r.name === 'Full Admin')?.id || usable[0]?.id || '');
  }, [token]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [load]);

  async function create() {
    if (!token || !name.trim() || !roleId) return;
    try {
      await createGroup(token, { name: name.trim(), roleId });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function remove(id: string) {
    if (!token || !window.confirm('Delete this group?')) return;
    try {
      await deleteGroup(token, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Groups</h1>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {hasPermission('system-config-groups', 'edit') && (
        <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void create()}
            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Create group
          </button>
        </div>
      )}
      <div className="mt-4 space-y-2">
        {groups.map((group) => (
          <div
            key={group.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <div>
              <div className="font-semibold">{group.name}</div>
              <div className="text-sm text-slate-500">
                Role: {group.role.name} · {group.memberCount} members
              </div>
            </div>
            {hasPermission('system-config-groups', 'delete') && (
              <button
                type="button"
                onClick={() => void remove(group.id)}
                className="text-sm font-semibold text-red-600"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
