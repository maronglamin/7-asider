import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OtpInput } from '../../components/OtpInput';
import { useAuth } from '../../context/AuthContext';
import { verifyAppLockPin } from '../../lib/app-lock-credential';
import { PIN_LENGTH, markPinReauth } from '../../lib/pin-setup';

export function VerifyPinScreen({ navigation }: { navigation?: any }) {
  const { token } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (value: string) => {
    if (value.length !== PIN_LENGTH || checking || !token) return;
    setChecking(true);
    setError('');
    try {
      const ok = await verifyAppLockPin(value, token);
      if (!ok) {
        setError('Incorrect PIN');
        setPin('');
        return;
      }
      markPinReauth(value);
      navigation?.replace('SetPin', { mode: 'change' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify PIN');
      setPin('');
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <ChevronLeft size={20} color="#16a34a" />
        </TouchableOpacity>
        <Text style={styles.title}>Current PIN</Text>
        <Text style={styles.subtitle}>Enter your current PIN to continue</Text>
      </View>
      <View style={styles.body}>
        <OtpInput
          length={PIN_LENGTH}
          value={pin}
          onChange={(value) => {
            setPin(value);
            setError('');
          }}
          onComplete={(value) => void submit(value)}
          disabled={checking}
          error={!!error}
          secure
          autoFocus
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {checking ? <ActivityIndicator style={styles.spinner} color="#16a34a" /> : null}
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
  error: {
    marginTop: 16,
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
  },
  spinner: { marginTop: 24 },
});
