import { useCallback, useEffect, useState } from 'react';

import {
  assignOperator,
  disableOperator,
  enableOperator,
  fetchGroups,
  fetchOperators,
  revokeOperator,
  searchOperatorCandidates,
  updateOperator,
  type GroupSummary,
  type OperatorCandidate,
  type OperatorSummary,
} from '../../lib/api';
import { getAdminToken } from '../../lib/auth-storage';
import { useAdminAuth } from '../../contexts/AdminAuthContext';

export function OperatorsPage() {
  const { hasPermission } = useAdminAuth();
  const token = getAdminToken();
  const [operators, setOperators] = useState<OperatorSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [candidates, setCandidates] = useState<OperatorCandidate[]>([]);
  const [selectedUser, setSelectedUser] = useState<OperatorCandidate | null>(null);
  const [assignGroupIds, setAssignGroupIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [ops, groupList] = await Promise.all([fetchOperators(token), fetchGroups(token)]);
    setOperators(ops);
    setGroups(groupList);
  }, [token]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [load]);

  useEffect(() => {
    if (!token || !showAssign || searchQuery.trim().length < 2) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(() => {
      searchOperatorCandidates(token, searchQuery.trim())
        .then(({ users }) => setCandidates(users))
        .catch(() => setCandidates([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [token, showAssign, searchQuery]);

  async function assign() {
    if (!token || !selectedUser || assignGroupIds.length === 0) return;
    if (selectedUser.adminUserType === 'OWNER') {
      setError('Cannot assign operator access to an owner account');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await assignOperator(token, { userId: selectedUser.id, groupIds: assignGroupIds });
      setShowAssign(false);
      setSelectedUser(null);
      setAssignGroupIds([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(op: OperatorSummary) {
    if (!token) return;
    try {
      if (op.status === 'ACTIVE') await disableOperator(token, op.id);
      else await enableOperator(token, op.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function revoke(op: OperatorSummary) {
    if (!token || !window.confirm(`Revoke admin access for ${op.email}?`)) return;
    try {
      await revokeOperator(token, op.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revoke failed');
    }
  }

  async function saveGroups(op: OperatorSummary, groupIds: string[]) {
    if (!token || groupIds.length === 0) return;
    try {
      await updateOperator(token, op.id, { groupIds });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900">Operators</h1>
        {hasPermission('system-config-operators', 'edit') && (
          <button
            type="button"
            onClick={() => setShowAssign(true)}
            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Assign operator
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Operators get permissions via groups. Owners cannot be managed here.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {showAssign && (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search existing users by email or name"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {candidates.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUser(user)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                  selectedUser?.id === user.id ? 'bg-green-50 text-green-800' : 'hover:bg-slate-50'
                }`}
              >
                {user.name || user.email} · {user.email}
                {user.adminUserType ? ` (${user.adminUserType})` : ''}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {groups.map((group) => (
              <label key={group.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assignGroupIds.includes(group.id)}
                  onChange={(e) => {
                    setAssignGroupIds((prev) =>
                      e.target.checked
                        ? [...prev, group.id]
                        : prev.filter((id) => id !== group.id),
                    );
                  }}
                />
                {group.name} ({group.role.name})
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void assign()}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Assign
            </button>
            <button
              type="button"
              onClick={() => setShowAssign(false)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {operators.map((op) => (
          <div key={op.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{op.name || op.email}</div>
                <div className="text-sm text-slate-500">{op.email}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {op.status} · TOTP {op.totpEnrolled ? 'enrolled' : 'not enrolled'} · Roles:{' '}
                  {op.roles.map((r) => r.name).join(', ') || '—'}
                </div>
              </div>
              {hasPermission('system-config-operators', 'edit') && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleStatus(op)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                  >
                    {op.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                  </button>
                  {hasPermission('system-config-operators', 'delete') && (
                    <button
                      type="button"
                      onClick={() => void revoke(op)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              )}
            </div>
            {hasPermission('system-config-operators', 'edit') && (
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                {groups.map((group) => {
                  const checked = op.groups.some((g) => g.id === group.id);
                  return (
                    <label key={group.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...op.groups.map((g) => g.id), group.id]
                            : op.groups.map((g) => g.id).filter((id) => id !== group.id);
                          void saveGroups(op, next);
                        }}
                      />
                      {group.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
