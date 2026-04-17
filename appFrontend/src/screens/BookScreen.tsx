import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
  Modal,
  Alert,
  Linking,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Map, TrendingUp, Plus, CheckCircle, CreditCard } from 'lucide-react-native';
import { FieldCard } from '../components/FieldCard';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth, apiPostAuth, resolveMediaUrl } from '../api/client';

interface BookScreenProps {
  navigation?: any;
}

export function BookScreen({ navigation }: BookScreenProps) {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showComing, setShowComing] = useState(false);
  const [payVisible, setPayVisible] = useState(false);
  const [payBooking, setPayBooking] = useState<any | null>(null);
  const [payPrepareLoading, setPayPrepareLoading] = useState(false);
  const [payWalletLoading, setPayWalletLoading] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareHint, setPrepareHint] = useState<string | null>(null);
  const [easypayOrder, setEasypayOrder] = useState<{
    id: string;
    publicCode: string;
    status: string;
    total: number;
    currency: string;
  } | null>(null);
  const [easypayWallets, setEasypayWallets] = useState<
    { gatewayId: string; code: string; name: string; checkoutAdapter: string; hasStoredPayerPhone: boolean }[]
  >([]);
  const [payerPhone, setPayerPhone] = useState('');

  const load = async (reset: boolean, opts?: { force?: boolean }) => {
    if (!token || (!opts?.force && loading)) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '10');
      // no filters
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      const res = await apiGetAuth<{ items: any[]; nextCursor: string | null }>(`/bookings/mine?${params.toString()}`, token);
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor);
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
      if (reset) setRefreshing(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openEasypayPay = async (b: any) => {
    setPayBooking(b);
    setPrepareError(null);
    setPrepareHint(null);
    setEasypayOrder(null);
    setEasypayWallets([]);
    setPayerPhone('');
    setPayVisible(true);
    if (!token) return;
    try {
      setPayPrepareLoading(true);
      const res = await apiPostAuth<{
        ok: boolean;
        order: { id: string; publicCode: string; status: string; total: number; currency: string };
        wallets: { gatewayId: string; code: string; name: string; checkoutAdapter: string; hasStoredPayerPhone: boolean }[];
        prepareHint?: string;
      }>(`/bookings/${b.id}/easypay/prepare`, {}, token as string);
      setEasypayOrder(res.order);
      setEasypayWallets(Array.isArray(res.wallets) ? res.wallets : []);
      setPrepareHint(typeof res.prepareHint === 'string' ? res.prepareHint : null);
    } catch (e: any) {
      setPrepareError(e?.message || 'Could not start Easypay checkout.');
    } finally {
      setPayPrepareLoading(false);
    }
  };

  const startWallet = async (gatewayCode: string) => {
    if (!payBooking || !token) return;
    try {
      setPayWalletLoading(true);
      const body: { gatewayCode: string; payerPhone?: string } = { gatewayCode };
      if (payerPhone.trim()) body.payerPhone = payerPhone.trim();
      const res = await apiPostAuth<{
        ok: boolean;
        launchUrl: string;
        checkoutAdapter?: string;
      }>(`/bookings/${payBooking.id}/easypay/wallet`, body, token as string);
      const url = res.launchUrl;
      if (url && (await Linking.canOpenURL(url))) {
        await Linking.openURL(url);
        Alert.alert(
          'Complete payment',
          'Finish the payment in your wallet app or browser. This screen will show Paid when Easypay confirms the transfer (usually within a minute). Pull to refresh if needed.',
        );
        setPayVisible(false);
        await load(true, { force: true });
      } else {
        Alert.alert('Checkout', 'No valid payment link was returned. Try again or pick another method.');
      }
    } catch (e: any) {
      Alert.alert('Payment', e?.message || 'Could not start payment.');
    } finally {
      setPayWalletLoading(false);
    }
  };

  // no search/filter

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#16a34a" />
      <SafeAreaView edges={["top"]} style={styles.topSafe} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Book a Field</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        onScroll={({ nativeEvent }) => {
          const paddingToBottom = 200;
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const closeToBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
          if (closeToBottom && nextCursor && !loading && !loadingMore) {
            setLoadingMore(true);
            load(false).finally(() => setLoadingMore(false));
          }
        }}
        scrollEventThrottle={16}
      >
        {/* Primary Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.primaryAction} onPress={() => navigation?.navigate('FindField')}>
            <Map size={20} color="#ffffff" />
            <Text style={styles.primaryActionText}>Find Fields Near Me</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.secondaryAction} onPress={() => setShowComing(true)}>
            <TrendingUp size={20} color="#16a34a" />
            <Text style={styles.secondaryActionText}>Join Available Matches</Text>
          </TouchableOpacity>
        </View>

        {/* Recently Booked */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recently Booked</Text>
          </View>

          <View style={styles.fieldsList}>
            {items.map((b) => {
              const field = b.field;
              const imgRel = field?.images?.[0]?.url;
              const image = resolveMediaUrl(imgRel) || 'https://via.placeholder.com/400x200?text=Field';
              const lastPlayed = b.startAt || b.createdAt;
              const price = field?.pricePerHour != null ? `GMD ${Number(field.pricePerHour)}/hour` : '—';
              const card = {
                id: b.id,
                name: field?.name || 'Field',
                image,
                distance: field?.address || field?.city || '',
                lastPlayed,
                rating: 4.8,
                price,
              };
              return (
                <View key={b.id}>
                  <FieldCard
                    field={card}
                    showRating={false}
                    onSelect={() => navigation?.navigate('CustomerBookedDetails', { booking: b })}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6 }}>
                    {String(b.paymentStatus || '').toUpperCase() === 'PAID' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                        <CheckCircle size={16} color="#166534" />
                        <Text style={{ color: '#166534', fontWeight: '800' }}>Paid</Text>
                      </View>
                    ) : String(b.status || '').toUpperCase() !== 'CANCELLED' ? (
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          backgroundColor: '#16a34a',
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 8,
                        }}
                        onPress={() => void openEasypayPay(b)}
                        activeOpacity={0.8}
                      >
                        <CreditCard size={16} color="#ffffff" />
                        <Text style={{ color: '#ffffff', fontWeight: '800' }}>Pay with Easypay</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {(!loading && items.length === 0) && (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <Text style={styles.emptyText}>You have no bookings yet.</Text>
                <TouchableOpacity style={styles.emptyCta} onPress={() => navigation?.navigate('FindField')}>
                  <Plus size={18} color="#ffffff" />
                  <Text style={styles.emptyCtaText}>Book now</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* Infinite scroll handles loading more automatically */}
          </View>
        </View>
      </ScrollView>
      {/* Coming Soon Bottom Sheet */}
      <Modal visible={showComing} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setShowComing(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Coming Soon</Text>
            <Text style={styles.sheetSubtitle}>
              Thanks for your interest — this feature is on the way.{"\n"}
              Soon you’ll browse nearby matches, see player levels, and join in one tap.
            </Text>
            <Text style={styles.sheetNote}>We’ll let you know as soon as it’s ready.</Text>
            <TouchableOpacity onPress={() => setShowComing(false)} style={styles.sheetPrimary}>
              <Text style={styles.sheetPrimaryText}>Got it</Text>
            </TouchableOpacity>
            <SafeAreaView edges={["bottom"]} />
          </View>
        </View>
      </Modal>
      {/* Easypay checkout sheet */}
      <Modal visible={payVisible} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setPayVisible(false)} />
          <View style={[styles.sheetContainer, { maxHeight: '92%' }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Pay with Easypay</Text>
            <Text style={styles.sheetSubtitle}>
              Pay securely through Easypay. Choose a wallet; you will be sent to complete payment. Your booking shows Paid
              when Easypay confirms the transfer.
            </Text>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 16 }}>
              {payPrepareLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
                  <ActivityIndicator size="large" color="#16a34a" />
                  <Text style={{ color: '#6b7280' }}>Preparing checkout…</Text>
                </View>
              ) : prepareError ? (
                <View style={{ paddingVertical: 12 }}>
                  <Text style={{ color: '#b91c1c', fontSize: 14, lineHeight: 20 }}>{prepareError}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 10, lineHeight: 19 }}>
                    Field owners must open Profile → Link To EasyPay (after an approved field) before customers can pay
                    here.
                  </Text>
                </View>
              ) : easypayOrder ? (
                <>
                  <View style={styles.payAmountBox}>
                    <Text style={styles.payAmountLabel}>Amount due</Text>
                    <Text style={styles.payAmountValue}>
                      {easypayOrder.currency || 'GMD'} {Number(easypayOrder.total).toFixed(2)}
                    </Text>
                    <Text style={styles.payRef}>Order {easypayOrder.publicCode}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 8, marginTop: 4 }}>
                    Payment method
                  </Text>
                  {(easypayWallets || []).length === 0 ? (
                    <View style={{ gap: 12 }}>
                      <Text style={{ color: '#6b7280', lineHeight: 20 }}>
                        No payment methods were returned for this checkout. This usually means no gateways are enabled for
                        this merchant in Easypay, or the Easypay API response shape differs from what we expect.
                      </Text>
                      {!!prepareHint && (
                        <Text style={{ color: '#374151', fontSize: 13, lineHeight: 19 }}>{prepareHint}</Text>
                      )}
                      {!!payBooking && (
                        <TouchableOpacity style={styles.sheetPrimary} onPress={() => void openEasypayPay(payBooking)}>
                          <Text style={styles.sheetPrimaryText}>Try again</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {easypayWallets.map((w) => (
                        <TouchableOpacity
                          key={w.gatewayId || w.code}
                          style={[styles.walletRow, payWalletLoading && { opacity: 0.6 }]}
                          disabled={payWalletLoading}
                          onPress={() => void startWallet(w.code)}
                        >
                          <Text style={styles.walletName}>{w.name}</Text>
                          <Text style={styles.walletMeta}>{w.checkoutAdapter}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 14, marginBottom: 6 }}>
                    Optional: payer phone (some gateways, e.g. Yonna)
                  </Text>
                  <TextInput
                    value={payerPhone}
                    onChangeText={setPayerPhone}
                    placeholder="e.g. 7XXXXXXXX"
                    keyboardType="phone-pad"
                    style={styles.phoneInput}
                    placeholderTextColor="#9ca3af"
                  />
                </>
              ) : null}
            </ScrollView>
            <SafeAreaView edges={['bottom']} />
          </View>
        </View>
      </Modal>
      <SafeAreaView edges={["bottom"]} style={styles.bottomSafe} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  topSafe: {
    backgroundColor: '#16a34a',
  },
  header: {
    backgroundColor: '#f9fafb',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 30 : 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  searchContainer: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    top: 12,
    zIndex: 1,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    paddingLeft: 44,
    paddingRight: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    color: '#111827',
  },
  content: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  bottomSafe: {
    backgroundColor: '#f9fafb',
  },
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  recentFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  recentSearchWrap: {
    flex: 1,
    position: 'relative',
  },
  recentSearchIcon: {
    position: 'absolute',
    left: 10,
    top: 10,
  },
  recentSearch: {
    backgroundColor: '#ffffff',
    paddingLeft: 36,
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    color: '#111827',
  },
  monthInput: {
    width: 100,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    color: '#111827',
  },
  primaryAction: {
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryAction: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  secondaryActionText: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16a34a',
  },
  fieldsList: {
    gap: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
  },
  loadMore: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  loadMoreText: {
    color: '#111827',
    fontWeight: '600',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyCtaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  sheetNote: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 16,
  },
  sheetPrimary: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetPrimaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  payAmountBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  payAmountLabel: { fontSize: 12, fontWeight: '700', color: '#166534', textTransform: 'uppercase' },
  payAmountValue: { fontSize: 26, fontWeight: '900', color: '#14532d', marginTop: 4 },
  payRef: { fontSize: 13, color: '#15803d', marginTop: 6 },
  walletRow: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  walletName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  walletMeta: { fontSize: 12, color: '#6b7280', marginTop: 4, textTransform: 'lowercase' },
  phoneInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
});