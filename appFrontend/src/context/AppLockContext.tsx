import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from './AuthContext';
import { setAppLockPin, verifyAppLockPin } from '../lib/app-lock-credential';
import { consumeSkipNextAppLock } from '../lib/app-lock-storage';
import {
  authenticateWithBiometrics,
  resolveBiometricMethod,
  waitForAppActive,
  type BiometricMethod,
} from '../lib/biometrics';

const BACKGROUND_LOCK_DELAY_MS = 60_000;

type AppLockContextValue = {
  isLocked: boolean;
  isChecking: boolean;
  biometricsAvailable: boolean;
  biometricMethod: BiometricMethod;
  hasCredential: boolean;
  pinFallback: boolean;
  unlock: () => Promise<boolean>;
  unlockWithPin: (secret: string) => Promise<boolean>;
  setPin: (secret: string) => Promise<void>;
  lock: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { user, token, updateUser } = useAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [biometricMethod, setBiometricMethod] = useState<BiometricMethod>('none');
  const [biometricsReady, setBiometricsReady] = useState(false);
  const [pinFallback, setPinFallback] = useState(false);
  const isAuthenticating = useRef(false);
  const autoPromptCancelled = useRef(false);
  const isUnlockedRef = useRef(isUnlocked);
  const backgroundSince = useRef<number | null>(null);
  const sessionLockInitialized = useRef(false);

  useEffect(() => {
    isUnlockedRef.current = isUnlocked;
  }, [isUnlocked]);

  const biometricsAvailable = biometricMethod !== 'none';
  const hasCredential = user?.appLockType === 'pin';
  const lockRequired = Boolean(user && token);

  const lock = useCallback(() => {
    setIsUnlocked(false);
    setPinFallback(false);
    autoPromptCancelled.current = false;
  }, []);

  const refreshBiometrics = useCallback(async () => {
    const method = await resolveBiometricMethod();
    setBiometricMethod(method);
    setBiometricsReady(true);
    return method;
  }, []);

  const unlock = useCallback(async (): Promise<boolean> => {
    if (!lockRequired) {
      setIsUnlocked(true);
      return true;
    }
    if (!biometricsAvailable || isAuthenticating.current) return false;

    isAuthenticating.current = true;
    setIsChecking(true);
    try {
      const result = await authenticateWithBiometrics(biometricMethod);
      if (result.success) {
        setIsUnlocked(true);
        setPinFallback(false);
        return true;
      }
      setIsUnlocked(false);
      setPinFallback(true);
      return false;
    } finally {
      isAuthenticating.current = false;
      setIsChecking(false);
    }
  }, [lockRequired, biometricsAvailable, biometricMethod]);

  const unlockWithPin = useCallback(
    async (secret: string): Promise<boolean> => {
      if (!lockRequired || !token) {
        setIsUnlocked(true);
        return true;
      }
      if (!hasCredential || isAuthenticating.current) return false;

      isAuthenticating.current = true;
      setIsChecking(true);
      try {
        const ok = await verifyAppLockPin(secret, token);
        if (ok) {
          setIsUnlocked(true);
          setPinFallback(false);
          return true;
        }
        setIsUnlocked(false);
        return false;
      } catch (error) {
        setIsUnlocked(false);
        throw error;
      } finally {
        isAuthenticating.current = false;
        setIsChecking(false);
      }
    },
    [lockRequired, hasCredential, token],
  );

  const setPin = useCallback(
    async (secret: string) => {
      if (!token) throw new Error('Not signed in');
      await setAppLockPin(secret, token);
      updateUser({ appLockType: 'pin' });
    },
    [token, updateUser],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const method = await resolveBiometricMethod();
        if (cancelled) return;

        setBiometricMethod(method);
        setBiometricsReady(true);

        if (!user || !token) {
          sessionLockInitialized.current = false;
          setIsUnlocked(true);
          setIsChecking(false);
          return;
        }

        if (sessionLockInitialized.current) {
          setIsChecking(false);
          return;
        }

        sessionLockInitialized.current = true;

        if (consumeSkipNextAppLock()) {
          setIsUnlocked(true);
          setIsChecking(false);
          return;
        }

        setIsUnlocked(false);
        setIsChecking(false);
      } catch (error) {
        console.warn('App lock init failed', error);
        if (!cancelled) {
          setIsUnlocked(true);
          setIsChecking(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  useEffect(() => {
    if (!lockRequired || isUnlocked || !biometricsReady || !biometricsAvailable) return;

    autoPromptCancelled.current = false;

    async function autoPrompt() {
      await waitForAppActive();
      if (autoPromptCancelled.current || isUnlockedRef.current) return;
      await unlock();
    }

    autoPrompt();
    return () => {
      autoPromptCancelled.current = true;
    };
  }, [lockRequired, isUnlocked, biometricsReady, biometricsAvailable, unlock]);

  useEffect(() => {
    if (!lockRequired) return;

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        backgroundSince.current = Date.now();
        return;
      }

      if (nextAppState === 'active') {
        void refreshBiometrics();
        if (backgroundSince.current === null) return;
        const elapsed = Date.now() - backgroundSince.current;
        backgroundSince.current = null;
        if (elapsed >= BACKGROUND_LOCK_DELAY_MS) lock();
      }
    });

    return () => subscription.remove();
  }, [lockRequired, lock, refreshBiometrics]);

  useEffect(() => {
    if (!user) {
      setIsUnlocked(true);
      autoPromptCancelled.current = false;
      sessionLockInitialized.current = false;
    }
  }, [user]);

  const isLocked = lockRequired && !isUnlocked;

  const value = useMemo(
    () => ({
      isLocked,
      isChecking: isChecking && lockRequired && (biometricsAvailable || hasCredential),
      biometricsAvailable,
      biometricMethod,
      hasCredential,
      pinFallback,
      unlock,
      unlockWithPin,
      setPin,
      lock,
    }),
    [
      isLocked,
      isChecking,
      lockRequired,
      biometricsAvailable,
      biometricMethod,
      hasCredential,
      pinFallback,
      unlock,
      unlockWithPin,
      setPin,
      lock,
    ],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error('useAppLock must be used within AppLockProvider');
  }
  return context;
}
