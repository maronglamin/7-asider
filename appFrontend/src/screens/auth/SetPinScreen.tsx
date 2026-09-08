import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { OtpInput } from '../../components/OtpInput';
import { PIN_LENGTH, clearStagedPin, stagePin, validatePin } from '../../lib/pin-setup';

export function SetPinScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const isChange = route?.params?.mode === 'change';
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const advancing = useRef(false);

  useFocusEffect(
    useCallback(() => {
      advancing.current = false;
      setPin('');
      setError('');
    }, []),
  );

  const goToConfirm = (value: string) => {
    if (advancing.current) return;
    const validationError = validatePin(value);
    if (validationError) {
      setError(validationError);
      return;
    }
    advancing.current = true;
    stagePin(value);
    navigation?.navigate('ConfirmPin');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            clearStagedPin();
            navigation?.goBack();
          }}
        >
          <ChevronLeft size={20} color="#16a34a" />
        </TouchableOpacity>
        <Text style={styles.title}>{isChange ? 'Change PIN' : 'Set PIN'}</Text>
        <Text style={styles.subtitle}>Enter a 4-digit PIN to unlock the app</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.prompt}>Enter a 4-digit PIN</Text>
        <OtpInput
          length={PIN_LENGTH}
          value={pin}
          onChange={(value) => {
            setPin(value);
            setError('');
          }}
          onComplete={goToConfirm}
          error={!!error}
          secure
          autoFocus
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.primaryButton, pin.length !== PIN_LENGTH && styles.buttonDisabled]}
          onPress={() => goToConfirm(pin)}
          disabled={pin.length !== PIN_LENGTH}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </Pressable>
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
  primaryButton: {
    marginTop: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#16a34a',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
