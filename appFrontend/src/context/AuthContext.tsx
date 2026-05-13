import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { deleteAuthStorageItem, getAuthStorageItem, setAuthStorageItem } from '../utils/authStorage';
import { registerOwnerPushForCurrentSession } from '../utils/registerOwnerPush';

type User = { id: string; email: string; name?: string; supadmin?: boolean; provider?: string | null } | null;

type AuthContextType = {
  user: User;
  token: string | null;
  setAuth: (u: User, t: string) => void;
  clearAuth: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const setAuth = (u: User, t: string) => {
    setUser(u);
    setToken(t);
    setAuthStorageItem('auth_user', JSON.stringify(u)).catch(() => {});
    setAuthStorageItem('auth_token', t).catch(() => {});
  };

  const clearAuth = () => {
    setUser(null);
    setToken(null);
    deleteAuthStorageItem('auth_user').catch(() => {});
    deleteAuthStorageItem('auth_token').catch(() => {});
  };

  useEffect(() => {
    (async () => {
      try {
        const [u, t] = await Promise.all([
          getAuthStorageItem('auth_user'),
          getAuthStorageItem('auth_token'),
        ]);
        if (u && t) {
          setUser(JSON.parse(u));
          setToken(t);
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
    <AuthContext.Provider value={{ user, token, setAuth, clearAuth }}>
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


