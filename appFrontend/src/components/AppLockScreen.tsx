import { Fingerprint, Lock, ScanFace } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OtpInput } from './OtpInput';
import { useAppLock } from '../context/AppLockContext';
import { useAuth } from '../context/AuthContext';
import { PIN_LENGTH } from '../lib/pin-setup';
import { getBiometricLabel, getLockHint } from '../lib/biometrics';
import type { BiometricMethod } from '../lib/biometrics';
import { navigationRef } from '../navigation/navigationRef';

function BiometricGlyph({ method, dimmed }: { method: BiometricMethod; dimmed?: boolean }) {
  const color = dimmed ? '#d1d5db' : '#16a34a';
  const size = 56;
  if (method === 'faceId') return <ScanFace size={size} color={color} strokeWidth={1.5} />;
  if (method === 'touchId' || method === 'androidBiometric') {
    return <Fingerprint size={size} color={color} strokeWidth={1.5} />;
  }
  return <Lock size={size} color={color} strokeWidth={1.5} />;
}

export function AppLockScreen() {
  const insets = useSafeAreaInsets();
  const { clearAuth } = useAuth();
  const {
    isChecking,
    biometricsAvailable,
    biometricMethod,
    hasCredential,
    pinFallback,
    unlock,
    unlockWithPin,
  } = useAppLock();

  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');

  const showPinUnlock = hasCredential && (!biometricsAvailable || pinFallback);
  const biometricLabel = getBiometricLabel(biometricMethod);
  const hint = getLockHint(biometricMethod, showPinUnlock);

  const handleSignInAgain = () => {
    clearAuth();
    if (navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: 'Login' as never }] });
    }
  };

  const tryBiometrics = async () => {
    if (isChecking) return;
    setError('');
    await unlock();
  };

  const submitPin = useCallback(
    async (value: string) => {
      if (!value || isChecking) return;
      setError('');
      try {
        const ok = await unlockWithPin(value);
        if (!ok) {
          setError('Incorrect PIN');
          setSecret('');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not unlock');
        setSecret('');
      }
    },
    [isChecking, unlockWithPin],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inner}>
          <Text style={styles.brand}>7a-side</Text>

          <View style={styles.center}>
            {biometricsAvailable ? (
              <Pressable
                onPress={() => void tryBiometrics()}
                disabled={isChecking}
                accessibilityRole="button"
                accessibilityLabel={`Unlock with ${biometricLabel}`}
                style={({ pressed }) => [
                  styles.glyphRing,
                  pressed && !isChecking && styles.glyphRingPressed,
                ]}
              >
                {isChecking && !showPinUnlock ? (
                  <ActivityIndicator size="large" color="#16a34a" />
                ) : (
                  <BiometricGlyph method={biometricMethod} />
                )}
              </Pressable>
            ) : (
              <View style={[styles.glyphRing, styles.glyphRingMuted]}>
                <BiometricGlyph method="none" dimmed />
              </View>
            )}

            <Text style={styles.title}>Locked</Text>
            <Text style={styles.hint}>{hint}</Text>

            {biometricsAvailable && !isChecking ? (
              <Text style={styles.retryHint}>Tap the icon to try again</Text>
            ) : null}

            {showPinUnlock ? (
              <View style={styles.pinForm}>
                <OtpInput
                  length={PIN_LENGTH}
                  value={secret}
                  onChange={(value) => {
                    setSecret(value);
                    setError('');
                  }}
                  onComplete={(value) => void submitPin(value)}
                  disabled={isChecking}
                  error={!!error}
                  secure
                  autoFocus
                />
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={handleSignInAgain}
            hitSlop={12}
            accessibilityRole="link"
            accessibilityLabel="Sign in with email"
          >
            <Text style={styles.emailLink}>Sign in with email</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    zIndex: 100,
  },
  flex: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 32,
  },
  brand: {
    fontSize: 22,
    fontWeight: '700',
    color: '#16a34a',
    marginTop: 16,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 24,
  },
  glyphRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    borderColor: '#dcfce7',
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  glyphRingPressed: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  glyphRingMuted: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  hint: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 22,
  },
  retryHint: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 4,
  },
  pinForm: {
    width: '100%',
    marginTop: 12,
    gap: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '500',
    textAlign: 'center',
  },
  emailLink: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingBottom: 24,
    textDecorationLine: 'underline',
  },
});
