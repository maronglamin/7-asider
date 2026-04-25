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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronLeft, Link2, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth, apiPostAuth } from '../api/client';
import { easypayBrandLogos } from '../utils/easypayWalletLogos';

type OnboardingStatus = {
  serverConfigured: boolean;
  linked: boolean;
  businessId?: string | null;
  slug?: string | null;
  hasApprovedField: boolean;
  hint?: string;
};

/** Same inline row layout as Book → directPay payment sheet (logo + title + subtitle). */
const easypayMark = require('../../assets/easypay_logo_file2.jpeg');

const LINK_WALLET_ROWS = [
  { key: 'aps', name: 'APS Wallet', subtitle: 'Pay in app', source: easypayBrandLogos.aps },
  { key: 'wave', name: 'Wave', subtitle: 'Tap to pay', source: easypayBrandLogos.wave },
  { key: 'yonna', name: 'Yonna Wallet', subtitle: 'Tap to pay', source: easypayBrandLogos.yonna },
] as const;

function friendlyPostError(message: string): string {
  const m = String(message || '');
  if (/not configured|503/i.test(m)) {
    return 'Online payments are not available in this app yet. Please try again later or contact support.';
  }
  if (/approved field|linking (easypay|directpay)/i.test(m)) {
    return 'Once your first field is approved, you can connect directPay here.';
  }
  return 'We could not finish connecting. Please try again in a moment.';
}

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
    } catch {
      Alert.alert('directPay', 'We could not load your status. Check your connection and try again.');
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
      await apiPostAuth<{ ok: boolean }>('/easypay/onboarding', {}, token as string);
      await refresh();
      Alert.alert('All set', 'You can now receive payments from bookings.');
    } catch (e: any) {
      Alert.alert('directPay', friendlyPostError(e?.message));
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
        <Text style={styles.topTitle}>directPay</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, !loading && styles.scrollFill]}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#16a34a" />
            <Text style={styles.muted}>Loading…</Text>
          </View>
        ) : !status ? (
          <Text style={styles.muted}>Sign in to continue.</Text>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Receive booking payments</Text>
              <Text style={styles.heroSub}>
                Connect once. When players pay, their booking is marked paid for you.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Customers can pay with</Text>
              <View style={styles.walletList}>
                {LINK_WALLET_ROWS.map((row) => (
                  <View key={row.key} style={styles.walletOptionRow}>
                    <Image
                      source={row.source}
                      style={styles.walletLogoThumb}
                      resizeMode="contain"
                      accessibilityLabel={row.name}
                    />
                    <View style={styles.walletTextCol}>
                      <Text style={styles.walletName}>{row.name}</Text>
                      <Text style={styles.walletMeta}>{row.subtitle}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {!serverOk ? (
              <View style={[styles.banner, styles.bannerWarn]}>
                <AlertCircle size={20} color="#92400e" />
                <Text style={[styles.bannerText, styles.bannerTextWarn]}>
                  Online payments are not turned on for this app yet. Please try again later or contact support.
                </Text>
              </View>
            ) : null}

            <View style={[styles.statusCard, linked ? styles.statusCardOk : styles.statusCardPending]}>
              <View style={styles.statusCardRow}>
                {linked ? <CheckCircle2 size={22} color="#166534" /> : <Link2 size={22} color="#92400e" />}
                <View style={styles.statusCardTextCol}>
                  <Text style={[styles.statusHeadline, linked ? styles.statusHeadlineOk : styles.statusHeadlinePending]}>
                    {linked ? 'Connected' : 'Not connected'}
                  </Text>
                  <Text style={styles.statusSub}>
                    {linked
                      ? 'You are ready to accept Wave, Yonna Wallet, or APS Wallet.'
                      : status.hasApprovedField
                        ? 'Tap below to connect your account.'
                        : 'After your first field is approved, you can connect here.'}
                  </Text>
                </View>
              </View>
            </View>

            {!linked && serverOk ? (
              <TouchableOpacity
                style={[styles.primary, (!status.hasApprovedField || linking) && styles.primaryDisabled]}
                disabled={!status.hasApprovedField || linking}
                onPress={onLink}
              >
                {linking ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryText}>Connect directPay</Text>
                )}
              </TouchableOpacity>
            ) : null}

            {linked ? (
              <View style={styles.doneFoot}>
                <Text style={styles.doneFootText}>Paid bookings update automatically after the customer pays.</Text>
              </View>
            ) : null}
          </>
        )}
        {!loading ? (
          <>
            <View style={styles.footerSpacer} />
            <View style={styles.easypayFooter}>
              <View style={styles.easypayFooterDivider} />
              <Text style={styles.easypayFooterLabel}>Payments powered by</Text>
              <View style={styles.easypayFooterLogoCard}>
                <Image
                  source={easypayMark}
                  style={styles.easypayFooterLogo}
                  resizeMode="contain"
                  accessibilityLabel="directPay"
                />
              </View>
            </View>
          </>
        ) : null}
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
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: { padding: 4 },
  topTitle: { fontSize: 18, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },
  scroll: { padding: 20, paddingBottom: 28 },
  scrollFill: { flexGrow: 1 },
  footerSpacer: { flexGrow: 1, minHeight: 32 },
  easypayFooter: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 4,
    paddingBottom: 8,
    marginTop: 8,
  },
  easypayFooterDivider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#d1d5db',
    marginBottom: 20,
  },
  easypayFooterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  easypayFooterLogoCard: {
    width: '100%',
    maxWidth: 308,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  easypayFooterLogo: {
    width: '100%',
    height: 52,
  },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 14 },
  muted: { color: '#6b7280', fontSize: 15, textAlign: 'center' },
  hero: {
    marginBottom: 20,
    paddingBottom: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  walletList: { gap: 10 },
  walletOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  walletLogoThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  walletTextCol: { flex: 1, minWidth: 0 },
  walletName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  walletMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  banner: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, marginBottom: 16, alignItems: 'flex-start' },
  bannerWarn: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20 },
  bannerTextWarn: { color: '#78350f' },
  statusCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  statusCardOk: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statusCardPending: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusCardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statusCardTextCol: { flex: 1 },
  statusHeadline: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  statusHeadlineOk: { color: '#14532d' },
  statusHeadlinePending: { color: '#78350f' },
  statusSub: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  primary: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#16a34a', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
    }),
  },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  doneFoot: { marginTop: 8, paddingHorizontal: 4, marginBottom: 8 },
  doneFootText: { fontSize: 14, color: '#6b7280', lineHeight: 21, textAlign: 'center' },
});
