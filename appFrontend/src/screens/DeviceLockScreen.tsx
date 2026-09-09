import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AlertCircle, ArrowLeft, Smartphone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { updateDeviceLock } from '../api/client';
import { collectDeviceInfo } from '../utils/device-info';

export default function DeviceLockScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, token, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const deviceLockOn = Boolean(user?.deviceLockEnabled && user?.deviceLockActiveOnThisDevice);
  const lockedToAnother = Boolean(user?.deviceLockEnabled && !user?.deviceLockActiveOnThisDevice);
  const used = user?.monthlyDevicesUsed ?? 0;
  const limit = user?.monthlyDevicesLimit ?? 3;

  const handleToggle = async (enabled: boolean) => {
    if (!token || busy) return;
    setError('');
    setBusy(true);
    try {
      const device = enabled ? await collectDeviceInfo() : undefined;
      await updateDeviceLock(token, enabled, device);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update device lock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Device lock</Text>
        <Text style={styles.subtitle}>
          {used}/{limit} devices this month
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconWrap}>
              <Smartphone size={20} color="#16a34a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>This device only</Text>
              <Text style={styles.cardMeta}>
                {Platform.OS === 'web'
                  ? 'Lock this account to this browser (including the PWA).'
                  : 'Lock this account to this phone or tablet.'}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator size="small" color="#16a34a" />
            ) : (
              <Switch
                value={deviceLockOn}
                onValueChange={(value) => void handleToggle(value)}
                trackColor={{ false: '#e5e7eb', true: '#bbf7d0' }}
                thumbColor={deviceLockOn ? '#16a34a' : '#9ca3af'}
              />
            )}
          </View>

          <Text style={styles.help}>
            When this is on, the account only works on this phone, tablet, or web browser. Turn it off
            here before signing in somewhere else. A device can use up to {limit} accounts per month,
            and an account can use up to {limit} devices per month.
          </Text>

          {lockedToAnother ? (
            <View style={styles.warning}>
              <AlertCircle size={16} color="#d97706" />
              <Text style={styles.warningText}>
                This account is locked to another device. Open 7-aside on that device to turn lock off,
                or ask a super admin to unlock it.
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <AlertCircle size={16} color="#dc2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 32, paddingBottom: 32 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#dcfce7', lineHeight: 22 },
  content: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 2, lineHeight: 18 },
  help: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  warning: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
  },
  warningText: { flex: 1, color: '#92400e', fontSize: 13, lineHeight: 18 },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { flex: 1, color: '#b91c1c', fontSize: 13, lineHeight: 18 },
});
