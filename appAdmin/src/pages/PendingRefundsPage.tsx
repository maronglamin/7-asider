import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  fetchPendingRefundDetail,
  fetchPendingRefunds,
  markBookingRefunded,
} from '../lib/api';
import { getAdminToken } from '../lib/auth-storage';
import { useAdminAuth } from '../contexts/AdminAuthContext';

export function PendingRefundsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const token = getAdminToken();

  useEffect(() => {
    if (!token) return;
    fetchPendingRefunds(token)
      .then((resp) => setItems(resp.items || (resp as any).bookings || []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [token]);

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Pending refunds</h1>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 space-y-2">
        {items.map((item) => {
          const id = item.id || item.bookingId;
          return (
            <Link
              key={id}
              to={`/pending-refunds/${id}`}
              className="block rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-green-300"
            >
              <div className="font-semibold text-slate-900">
                {item.fieldName || item.field?.name || id}
              </div>
              <div className="text-sm text-slate-500">
                {item.totalAmount != null ? Number(item.totalAmount).toLocaleString() : ''}{' '}
                {item.currency || ''}
              </div>
            </Link>
          );
        })}
        {!items.length && !error && <p className="text-sm text-slate-500">No pending refunds</p>}
      </div>
    </div>
  );
}

export function PendingRefundDetailPage() {
  const { id = '' } = useParams();
  const { hasPermission } = useAdminAuth();
  const [booking, setBooking] = useState<any>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const token = getAdminToken();

  const load = useCallback(async () => {
    if (!token || !id) return;
    const resp = await fetchPendingRefundDetail(token, id);
    setBooking(resp.booking);
  }, [token, id]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [load]);

  async function markDone() {
    if (!token || !hasPermission('pending-refunds', 'edit')) return;
    setBusy(true);
    setError('');
    try {
      await markBookingRefunded(token, id, note);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Link to="/pending-refunds" className="text-sm font-medium text-green-700">
        ← Back
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-slate-900">Refund review</h1>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {booking && (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div>
            <span className="text-slate-500">Booking:</span> {booking.id}
          </div>
          <div>
            <span className="text-slate-500">Field:</span> {booking.field?.name || booking.fieldName}
          </div>
          <div>
            <span className="text-slate-500">Amount:</span>{' '}
            {Number(booking.totalAmount || 0).toLocaleString()} {booking.currency}
          </div>
          <div>
            <span className="text-slate-500">Status:</span> {booking.status} / {booking.paymentStatus}
          </div>
          {hasPermission('pending-refunds', 'edit') && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                rows={3}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void markDone()}
                className="rounded-lg bg-green-600 px-3 py-2 font-semibold text-white"
              >
                Mark refunded
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
