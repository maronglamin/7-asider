import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchBookings, fetchBookingsSummary } from '../lib/api';
import { getAdminToken } from '../lib/auth-storage';

export function BookingsPage() {
  const [period, setPeriod] = useState('monthly');
  const [payment, setPayment] = useState('paid');
  const [summary, setSummary] = useState<{ items: any[]; total: number } | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const token = getAdminToken();

  useEffect(() => {
    if (!token) return;
    Promise.all([
      fetchBookingsSummary(token, period, payment),
      fetchBookings(token, period, payment),
    ])
      .then(([s, b]) => {
        setSummary(s);
        setItems(b.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [token, period, payment]);

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Bookings</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {(['daily', 'weekly', 'monthly'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              period === p ? 'bg-green-600 text-white' : 'border border-slate-200 bg-white'
            }`}
          >
            {p}
          </button>
        ))}
        {(['paid', 'unpaid'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPayment(p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              payment === p ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm text-slate-500">Total earnings</div>
        <div className="text-2xl font-extrabold text-slate-900">
          {summary ? summary.total.toLocaleString() : '—'}
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Field</th>
              <th className="px-4 py-3">Bookings</th>
              <th className="px-4 py-3">Earnings</th>
            </tr>
          </thead>
          <tbody>
            {(summary?.items || []).map((row) => (
              <tr key={row.fieldId} className="border-t border-slate-100">
                <td className="px-4 py-3">{row.fieldName}</td>
                <td className="px-4 py-3">{row.numBookings}</td>
                <td className="px-4 py-3">{Number(row.totalEarnings).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 text-lg font-bold text-slate-900">Recent bookings</h2>
      <div className="mt-3 space-y-2">
        {items.map((b) => (
          <div key={b.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <div className="font-semibold">{b.fieldName}</div>
            <div className="text-slate-500">
              {b.paymentStatus} · {Number(b.totalAmount).toLocaleString()} {b.currency}
            </div>
          </div>
        ))}
      </div>
      <Link to="/pending-refunds" className="mt-6 inline-block text-sm font-semibold text-green-700">
        View pending refunds →
      </Link>
    </div>
  );
}
