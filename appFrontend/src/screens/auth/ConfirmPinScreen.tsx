import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CheckCircle2, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OtpInput } from '../../components/OtpInput';
import { useAppLock } from '../../context/AppLockContext';
import { PIN_LENGTH, clearPinSetupSession, getStagedPin } from '../../lib/pin-setup';

export function ConfirmPinScreen({ navigation }: { navigation?: any }) {
  const { setPin } = useAppLock();
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!getStagedPin() && !saved) {
      navigation?.goBack();
    }
  }, [navigation, saved]);

  const confirm = async (value: string) => {
    const expected = getStagedPin();
    if (!expected || saving || saved) return;
    if (value !== expected) {
      setError('PINs do not match');
      setPinValue('');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await setPin(value);
      clearPinSetupSession();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save PIN');
      setPinValue('');
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    navigation?.navigate('Main');
  };

  if (saved) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.title}>Success</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.successIcon}>
            <CheckCircle2 size={40} color="#16a34a" />
          </View>
          <Text style={styles.successTitle}>PIN saved</Text>
          <Text style={styles.successSubtitle}>Use this PIN to unlock the app when biometrics are not available.</Text>
          <Pressable style={styles.primaryButton} onPress={leave}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <ChevronLeft size={20} color="#16a34a" />
        </TouchableOpacity>
        <Text style={styles.title}>Confirm PIN</Text>
        <Text style={styles.subtitle}>Re-enter your PIN</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.prompt}>Re-enter your PIN</Text>
        <OtpInput
          length={PIN_LENGTH}
          value={pin}
          onChange={(value) => {
            setPinValue(value);
            setError('');
          }}
          onComplete={(value) => void confirm(value)}
          disabled={saving}
          error={!!error}
          secure
          autoFocus
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saving ? <ActivityIndicator style={styles.spinner} color="#16a34a" /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#16a34a' },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#dcfce7', fontSize: 14 },
  body: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  prompt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 24,
  },
  error: {
    marginTop: 16,
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
  },
  spinner: { marginTop: 24 },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#16a34a',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
