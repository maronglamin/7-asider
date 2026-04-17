import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronLeft, Link2, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth, apiPostAuth } from '../api/client';

type OnboardingStatus = {
  serverConfigured: boolean;
  linked: boolean;
  businessId?: string | null;
  slug?: string | null;
  hasApprovedField: boolean;
  hint?: string;
};

export default function LinkEasypayScreen() {
  const navigation = useNavigation();
  const { token } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setStatus(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await apiGetAuth<OnboardingStatus>('/easypay/onboarding', token as string);
      setStatus(res);
    } catch (e: any) {
      Alert.alert('Unable to load Easypay', e?.message || 'Please try again.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onLink = async () => {
    if (!token || linking) return;
    try {
      setLinking(true);
      await apiPostAuth<{ ok: boolean; businessId?: string; slug?: string }>(
        '/easypay/onboarding',
        {},
        token as string,
      );
      await refresh();
      Alert.alert('Easypay', 'Your merchant account is linked. You can receive in-app payments for your fields.');
    } catch (e: any) {
      Alert.alert('Could not complete linking', e?.message || 'Please try again.');
    } finally {
      setLinking(false);
    }
  };

  const linked = !!status?.linked;
  const serverOk = !!status?.serverConfigured;

  return (
    <SafeAreaView style={styles.safeTop} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()} style={styles.backBtn} hitSlop={12}>
          <ChevronLeft size={28} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Link To EasyPay</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#16a34a" />
            <Text style={styles.muted}>Checking Easypay status…</Text>
          </View>
        ) : !status ? (
          <Text style={styles.muted}>Sign in to manage Easypay.</Text>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Link2 size={22} color="#16a34a" />
                <Text style={styles.cardTitle}>Easypay for field owners</Text>
              </View>
              <Text style={styles.body}>
                Linking creates your Easypay merchant tenant so customers can pay bookings with Wave, Yonna, or other
                wallets your Easypay operator enables. Checkout opens in your phone browser; when payment succeeds, the
                booking is marked paid automatically.
              </Text>
            </View>

            {!serverOk ? (
              <View style={[styles.banner, styles.bannerWarn]}>
                <AlertCircle size={20} color="#92400e" />
                <Text style={[styles.bannerText, { color: '#92400e' }]}>
                  This app server is not configured for Easypay yet (missing API URL or partner secret). Ask your
                  administrator to set EASYPAY_API_BASE_URL and INTERNAL_PARTNER_API_SECRET.
                </Text>
              </View>
            ) : null}

            <View style={[styles.statusPill, linked ? styles.pillOk : styles.pillPending]}>
              {linked ? <CheckCircle2 size={18} color="#166534" /> : <AlertCircle size={18} color="#92400e" />}
              <Text style={[styles.statusLabel, linked ? styles.statusOk : styles.statusPending]}>
                {linked ? 'Linked to Easypay' : 'Not linked yet'}
              </Text>
            </View>

            {linked && status.businessId ? (
              <View style={styles.metaBox}>
                <Text style={styles.metaLabel}>Business ID</Text>
                <Text style={styles.metaValue} selectable>
                  {status.businessId}
                </Text>
                {status.slug ? (
                  <>
                    <Text style={[styles.metaLabel, { marginTop: 10 }]}>Slug</Text>
                    <Text style={styles.metaValue} selectable>
                      {status.slug}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}

            {!!status.hint && <Text style={styles.hint}>{status.hint}</Text>}

            {!linked && serverOk ? (
              <TouchableOpacity
                style={[styles.primary, (!status.hasApprovedField || linking) && { opacity: 0.55 }]}
                disabled={!status.hasApprovedField || linking}
                onPress={onLink}
              >
                {linking ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryText}>Prepare / link Easypay account</Text>
                )}
              </TouchableOpacity>
            ) : null}

            {linked ? (
              <Text style={styles.footerNote}>
                Configure wallet gateways (Wave, Yonna, APS, etc.) in Easypay for this business ID. Webhooks should
                point to your 7-aside API at /webhooks/easypay-partner with INTERNAL_PARTNER_WEBHOOK_SECRET set on both
                sides.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#f9fafb' }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeTop: { flex: 1, backgroundColor: '#f9fafb' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: { padding: 4 },
  topTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  scroll: { padding: 20, paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  muted: { color: '#6b7280', fontSize: 15, textAlign: 'center' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  body: { fontSize: 14, color: '#4b5563', lineHeight: 21 },
  banner: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 10, marginBottom: 16 },
  bannerWarn: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d' },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 19 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 14,
  },
  pillOk: { backgroundColor: '#dcfce7' },
  pillPending: { backgroundColor: '#fef9c3' },
  statusLabel: { fontWeight: '800', fontSize: 14 },
  statusOk: { color: '#166534' },
  statusPending: { color: '#92400e' },
  metaBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  metaLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' },
  metaValue: { fontSize: 14, color: '#111827', fontWeight: '600', marginTop: 4 },
  hint: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 18 },
  primary: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  primaryText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  footerNote: { marginTop: 20, fontSize: 12, color: '#9ca3af', lineHeight: 18 },
});
