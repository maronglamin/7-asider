import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { apiGetAuth, registerCurrentDevice } from '../api/client';
import { deleteAuthStorageItem, getAuthStorageItem, setAuthStorageItem } from '../utils/authStorage';
import { registerOwnerPushForCurrentSession } from '../utils/registerOwnerPush';
import { markPendingCredentialPrompt, markSkipNextAppLock } from '../lib/app-lock-storage';
import { clearRegisteredDeviceId, setRegisteredDeviceId } from '../utils/device-storage';

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  username?: string | null;
  supadmin?: boolean;
  provider?: string | null;
  appLockType?: 'pin' | null;
  hasPassword?: boolean;
  deviceLockEnabled?: boolean;
  deviceLockActiveOnThisDevice?: boolean;
  monthlyDevicesUsed?: number;
  monthlyDevicesLimit?: number;
} | null;

type AuthContextType = {
  user: AuthUser;
  token: string | null;
  setAuth: (u: NonNullable<AuthUser>, t: string, options?: { fromSignIn?: boolean; deviceId?: string }) => void;
  updateUser: (fields: Partial<NonNullable<AuthUser>>) => void;
  refreshUser: () => Promise<void>;
  clearAuth: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function needsDisplayName(user: AuthUser): boolean {
  return Boolean(user) && !String(user?.name || '').trim();
}

async function syncRegisteredDevice(token: string): Promise<void> {
  try {
    const { device } = await registerCurrentDevice(token);
    if (device?.id) {
      await setRegisteredDeviceId(device.id);
    }
  } catch (error) {
    console.warn('Failed to register device', error);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const persistUser = (next: AuthUser) => {
    if (!next) {
      deleteAuthStorageItem('auth_user').catch(() => {});
      return;
    }
    setAuthStorageItem('auth_user', JSON.stringify(next)).catch(() => {});
  };

  const setAuth = (u: NonNullable<AuthUser>, t: string, options?: { fromSignIn?: boolean; deviceId?: string }) => {
    setUser(u);
    setToken(t);
    persistUser(u);
    setAuthStorageItem('auth_token', t).catch(() => {});
    if (options?.fromSignIn) {
      markSkipNextAppLock();
      markPendingCredentialPrompt();
    }
    if (options?.deviceId) {
      setRegisteredDeviceId(options.deviceId).catch(() => {});
    } else {
      void syncRegisteredDevice(t);
    }
  };

  const updateUser = (fields: Partial<NonNullable<AuthUser>>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...fields };
      persistUser(next);
      return next;
    });
  };

  const clearAuth = () => {
    setUser(null);
    setToken(null);
    deleteAuthStorageItem('auth_user').catch(() => {});
    deleteAuthStorageItem('auth_token').catch(() => {});
    clearRegisteredDeviceId().catch(() => {});
  };

  const refreshUser = useCallback(async () => {
    const storedToken = token || (await getAuthStorageItem('auth_token'));
    if (!storedToken) {
      setUser(null);
      setToken(null);
      return;
    }
    try {
      const me = await apiGetAuth<NonNullable<AuthUser>>('/auth/me', storedToken);
      setUser(me);
      setToken(storedToken);
      persistUser(me);
      await syncRegisteredDevice(storedToken);
    } catch {
      setUser(null);
      setToken(null);
      deleteAuthStorageItem('auth_user').catch(() => {});
      deleteAuthStorageItem('auth_token').catch(() => {});
      clearRegisteredDeviceId().catch(() => {});
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const [u, t] = await Promise.all([
          getAuthStorageItem('auth_user'),
          getAuthStorageItem('auth_token'),
        ]);
        if (u && t) {
          try {
            setUser(JSON.parse(u));
            setToken(t);
          } catch {
            setUser(null);
            setToken(null);
          }
          try {
            const me = await apiGetAuth<NonNullable<AuthUser>>('/auth/me', t);
            setUser(me);
            persistUser(me);
            await syncRegisteredDevice(t);
          } catch (error) {
            const message = error instanceof Error ? error.message : '';
            if (/401|unauthorized|session is no longer valid|invalid token/i.test(message)) {
              setUser(null);
              setToken(null);
              deleteAuthStorageItem('auth_user').catch(() => {});
              deleteAuthStorageItem('auth_token').catch(() => {});
              clearRegisteredDeviceId().catch(() => {});
            }
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!token || !user?.id) return undefined;
    const handle = setTimeout(() => {
      void registerOwnerPushForCurrentSession(token);
    }, 1200);
    return () => clearTimeout(handle);
  }, [token, user?.id]);

  return (
    <AuthContext.Provider value={{ user, token, setAuth, updateUser, refreshUser, clearAuth }}>
      {ready ? (
        children
      ) : (
        <View style={authLoadingStyles.root}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
    </AuthContext.Provider>
  );
}

const authLoadingStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
