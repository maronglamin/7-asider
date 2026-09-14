import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { OtpInput } from '../components/OtpInput';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { setupAdminTotp } from '../lib/api';
import { getPreAuthToken } from '../lib/auth-storage';

export function TotpSetupPage() {
  const navigate = useNavigate();
  const { isAuthenticated, preAuthToken, confirmTotpSetup } = useAdminAuth();
  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const preAuth = preAuthToken || getPreAuthToken();
    if (!preAuth) return;
    setupAdminTotp(preAuth)
      .then((result) => {
        setSecret(result.secret);
        setQrDataUrl(result.qrDataUrl);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to start setup'));
  }, [preAuthToken]);

  if (isAuthenticated) return <Navigate to="/" replace />;
  if (!preAuthToken && !getPreAuthToken()) return <Navigate to="/login" replace />;

  async function handleConfirm() {
    if (code.length !== 6 || !secret) return;
    setBusy(true);
    setError('');
    try {
      await confirmTotpSetup(secret, code);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-extrabold text-slate-900">Set up authenticator</h1>
        <p className="mt-2 text-sm text-slate-600">
          Scan the QR code with Google Authenticator, 1Password, or a similar app.
        </p>
        {qrDataUrl && (
          <img src={qrDataUrl} alt="TOTP QR code" className="mx-auto mt-6 h-48 w-48 rounded-lg border" />
        )}
        {secret && (
          <p className="mt-3 break-all text-center text-xs text-slate-500">
            Manual key: <span className="font-mono">{secret}</span>
          </p>
        )}
        <div className="mt-6 space-y-4">
          <OtpInput value={code} onChange={setCode} onComplete={handleConfirm} disabled={busy} autoFocus />
          <button
            type="button"
            disabled={busy || code.length !== 6}
            onClick={handleConfirm}
            className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            Confirm and continue
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
