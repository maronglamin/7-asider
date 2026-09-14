import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { assetUrl, fetchFieldOwners, type FieldOwnerItem } from '../lib/api';
import { getAdminToken } from '../lib/auth-storage';

export function FieldKycPage() {
  const [items, setItems] = useState<FieldOwnerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = getAdminToken();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const resp = await fetchFieldOwners(token);
      setItems(resp.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Asset owners</h1>
      <p className="mt-1 text-sm text-slate-500">Owners with field KYC submissions</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const field = item.fields[0];
            return (
              <div
                key={item.owner.id}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4"
              >
                {field?.thumbnail ? (
                  <img
                    src={assetUrl(field.thumbnail) || undefined}
                    alt=""
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-slate-100" />
                )}
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">{item.owner.name || item.owner.email}</div>
                  <div className="text-sm text-slate-500">
                    {item.owner.email} · {item.owner.fieldCount} field(s)
                  </div>
                  {field && (
                    <div className="mt-1 text-sm text-slate-600">
                      Latest: {field.name} · {field.status}
                    </div>
                  )}
                </div>
                {field && (
                  <Link
                    to={`/field-kyc/${field.id}`}
                    className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Review
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
