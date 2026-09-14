import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { assetUrl, fetchFieldDetail, updateFieldStatus } from '../lib/api';
import { getAdminToken } from '../lib/auth-storage';
import { useAdminAuth } from '../contexts/AdminAuthContext';

export function FieldDetailPage() {
  const { id = '' } = useParams();
  const { hasPermission } = useAdminAuth();
  const [field, setField] = useState<any>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const token = getAdminToken();

  useEffect(() => {
    if (!token || !id) return;
    fetchFieldDetail(token, id)
      .then(setField)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [token, id]);

  async function setStatus(status: string) {
    if (!token || !hasPermission('field-kyc', 'edit')) return;
    if ((status === 'REJECTED' || status === 'SUSPENDED') && !reason.trim()) {
      setError('Reason is required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateFieldStatus(token, id, { status, reason: reason.trim() || undefined });
      const updated = await fetchFieldDetail(token, id);
      setField(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  if (!field && !error) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div>
      <Link to="/field-kyc" className="text-sm font-medium text-green-700">
        ← Back
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-slate-900">{field?.name || 'Field'}</h1>
      <p className="text-sm text-slate-500">
        {field?.city} · {field?.status} · Owner {field?.user?.email}
      </p>
      {field?.status === 'APPROVED' && (
        <Link
          to={`/field-flyers?fieldId=${encodeURIComponent(field.id)}`}
          className="mt-3 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
        >
          Create field flyer
        </Link>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(field?.images || []).map((img: any) => (
          <img
            key={img.id}
            src={assetUrl(img.url) || undefined}
            alt=""
            className="h-40 w-full rounded-lg object-cover"
          />
        ))}
      </div>
      {hasPermission('field-kyc', 'edit') && (
        <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for reject/suspend"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void setStatus('APPROVED')}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setStatus('REJECTED')}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setStatus('SUSPENDED')}
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white"
            >
              Suspend
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
