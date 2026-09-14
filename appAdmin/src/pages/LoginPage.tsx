import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';

import { OtpInput, type OtpInputRef } from '../components/OtpInput';
import { useAdminAuth } from '../contexts/AdminAuthContext';

type Step = 'email' | 'otp' | 'totp';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const navigate = useNavigate();
  const { loading, isAuthenticated, sendOtp, verifyOtp, verifyTotp } = useAdminAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const otpRef = useRef<OtpInputRef>(null);
  const totpRef = useRef<OtpInputRef>(null);

  useEffect(() => {
    if (!loading && isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, loading, navigate]);

  const trimmedEmail = email.trim().toLowerCase();

  const handleSendOtp = useCallback(async () => {
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await sendOtp(trimmedEmail);
      setEmail(trimmedEmail);
      setStep('otp');
      setOtp('');
      window.setTimeout(() => otpRef.current?.focus(), 300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setBusy(false);
    }
  }, [sendOtp, trimmedEmail]);

  const handleVerifyOtp = useCallback(
    async (code?: string) => {
      const value = code ?? otp;
      if (value.length !== 6) return;
      setError('');
      setBusy(true);
      try {
        const { totpEnrolled } = await verifyOtp(email, value);
        if (!totpEnrolled) {
          navigate('/setup-totp', { replace: true });
          return;
        }
        setStep('totp');
        setTotp('');
        window.setTimeout(() => totpRef.current?.focus(), 300);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed');
        setOtp('');
      } finally {
        setBusy(false);
      }
    },
    [email, navigate, otp, verifyOtp],
  );

  const handleVerifyTotp = useCallback(
    async (code?: string) => {
      const value = code ?? totp;
      if (value.length !== 6) return;
      setError('');
      setBusy(true);
      try {
        await verifyTotp(value);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid authenticator code');
        setTotp('');
      } finally {
        setBusy(false);
      }
    },
    [navigate, totp, verifyTotp],
  );

  if (!loading && isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-600 text-white">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">7-aside Admin</h1>
            <p className="text-sm text-slate-500">Secure operations console</p>
          </div>
        </div>

        {step === 'email' && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Work email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-green-600"
                placeholder="you@company.com"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={handleSendOtp}
              className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send verification code'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Enter the 6-digit code sent to <strong>{email}</strong>
            </p>
            <OtpInput
              ref={otpRef}
              value={otp}
              onChange={setOtp}
              onComplete={handleVerifyOtp}
              disabled={busy}
              autoFocus
            />
            <button
              type="button"
              disabled={busy || otp.length !== 6}
              onClick={() => handleVerifyOtp()}
              className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              Continue
            </button>
            <button
              type="button"
              className="w-full text-sm text-slate-500"
              onClick={() => setStep('email')}
            >
              Use a different email
            </button>
          </div>
        )}

        {step === 'totp' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Enter the code from your authenticator app</p>
            <OtpInput
              ref={totpRef}
              value={totp}
              onChange={setTotp}
              onComplete={handleVerifyTotp}
              disabled={busy}
              autoFocus
            />
            <button
              type="button"
              disabled={busy || totp.length !== 6}
              onClick={() => handleVerifyTotp()}
              className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              Sign in
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
