import { KeyRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import {
  clearPendingCredentialPrompt,
  hasPendingCredentialPrompt,
} from '../lib/app-lock-storage';
import { navigationRef } from '../navigation/navigationRef';

export function SetCredentialPrompt() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || !hasPendingCredentialPrompt()) return;

    clearPendingCredentialPrompt();
    if (!user.appLockType) {
      setVisible(true);
    }
  }, [user]);

  const dismiss = () => setVisible(false);

  const openSetPin = () => {
    setVisible(false);
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('SetPin');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropHit} onPress={dismiss} accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.iconRing}>
            <KeyRound size={40} color="#16a34a" strokeWidth={1.75} />
          </View>
          <Text style={styles.title}>Set a PIN</Text>
          <Text style={styles.message}>
            If Face ID or fingerprint isn&apos;t available, you can unlock with your PIN instead of
            waiting for an email code.
          </Text>
          <Pressable
            onPress={openSetPin}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>Set now</Text>
          </Pressable>
          <Pressable onPress={dismiss} hitSlop={12}>
            <Text style={styles.dismissLink}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  backdropHit: { flex: 1 },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 32,
    paddingTop: 8,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    marginBottom: 24,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 32,
    maxWidth: 320,
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonPressed: { backgroundColor: '#15803d' },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  dismissLink: {
    fontSize: 14,
    color: '#6b7280',
    paddingVertical: 8,
  },
});
