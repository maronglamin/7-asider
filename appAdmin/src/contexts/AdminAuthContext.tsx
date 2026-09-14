import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  confirmAdminTotp,
  fetchAdminMe,
  sendAdminOtp,
  verifyAdminOtp,
  verifyAdminTotp,
  type AdminProfile,
} from '../lib/api';
import {
  clearAdminSession,
  clearPreAuthToken,
  getAdminToken,
  getPreAuthToken,
  setAdminToken,
  setPreAuthToken,
} from '../lib/auth-storage';

type AdminAuthContextValue = {
  admin: AdminProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  preAuthToken: string | null;
  hasPermission: (moduleKey: string, actionKey?: string) => boolean;
  refreshUser: () => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<{ totpEnrolled: boolean }>;
  verifyTotp: (code: string) => Promise<void>;
  confirmTotpSetup: (secret: string, code: string) => Promise<void>;
  signOut: () => void;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function checkPermission(
  admin: AdminProfile | null,
  moduleKey: string,
  actionKey = 'view',
): boolean {
  if (!admin) return false;
  if (admin.adminUserType === 'OWNER' || admin.permissions.includes('*')) return true;
  return admin.permissions.includes(`${moduleKey}:${actionKey}`);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [preAuthToken, setPreAuth] = useState<string | null>(getPreAuthToken());
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAdminToken()));

  const refreshUser = useCallback(async () => {
    const token = getAdminToken();
    if (!token) return;
    const { admin: profile } = await fetchAdminMe(token);
    setAdmin(profile);
  }, []);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    fetchAdminMe(token)
      .then(({ admin: profile }) => {
        setAdmin(profile);
        setIsAuthenticated(true);
      })
      .catch(() => {
        clearAdminSession();
        setAdmin(null);
        setIsAuthenticated(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const hasPermission = useCallback(
    (moduleKey: string, actionKey = 'view') => checkPermission(admin, moduleKey, actionKey),
    [admin],
  );

  const sendOtp = useCallback(async (email: string) => {
    await sendAdminOtp(email);
  }, []);

  const verifyOtp = useCallback(async (email: string, code: string) => {
    const result = await verifyAdminOtp(email, code);
    setPreAuthToken(result.preAuthToken);
    setPreAuth(result.preAuthToken);
    if (result.admin) setAdmin(result.admin);
    return { totpEnrolled: result.totpEnrolled };
  }, []);

  const verifyTotp = useCallback(async (code: string) => {
    const preAuth = getPreAuthToken();
    if (!preAuth) throw new Error('Verification session expired');
    const result = await verifyAdminTotp(preAuth, code);
    setAdminToken(result.token);
    setAdmin(result.admin);
    setIsAuthenticated(true);
    clearPreAuthToken();
    setPreAuth(null);
  }, []);

  const confirmTotpSetup = useCallback(async (secret: string, code: string) => {
    const preAuth = getPreAuthToken();
    if (!preAuth) throw new Error('Verification session expired');
    const result = await confirmAdminTotp(preAuth, secret, code);
    setAdminToken(result.token);
    setAdmin(result.admin);
    setIsAuthenticated(true);
    clearPreAuthToken();
    setPreAuth(null);
  }, []);

  const signOut = useCallback(() => {
    clearAdminSession();
    setAdmin(null);
    setPreAuth(null);
    setIsAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({
      admin,
      loading,
      isAuthenticated,
      preAuthToken,
      hasPermission,
      refreshUser,
      sendOtp,
      verifyOtp,
      verifyTotp,
      confirmTotpSetup,
      signOut,
    }),
    [
      admin,
      loading,
      isAuthenticated,
      preAuthToken,
      hasPermission,
      refreshUser,
      sendOtp,
      verifyOtp,
      verifyTotp,
      confirmTotpSetup,
      signOut,
    ],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
