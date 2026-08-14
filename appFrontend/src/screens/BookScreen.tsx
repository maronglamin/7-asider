import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Map, TrendingUp, Plus, CheckCircle, CreditCard } from 'lucide-react-native';
import { FieldCard } from '../components/FieldCard';
import { EasypayPaySheet } from '../components/EasypayPaySheet';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth, resolveMediaUrl } from '../api/client';
import { isBookingPaid } from '../utils/easypayBookerMessages';

interface BookScreenProps {
  navigation?: any;
  route?: any;
}

export function BookScreen({ navigation, route }: BookScreenProps) {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showComing, setShowComing] = useState(false);
  const [payVisible, setPayVisible] = useState(false);
  const [payBooking, setPayBooking] = useState<any | null>(null);
  const payPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Synchronous guard — React `loading` state can lag and block `load(true)` right after mount/focus. */
  const loadInFlightRef = useRef(false);

  const clearPayPoll = () => {
    if (payPollRef.current) {
      clearInterval(payPollRef.current);
      payPollRef.current = null;
    }
  };

  /** Poll GET /bookings/:id until PAID or timeout (after wallet / APS payment). */
  const pollBookingPaymentStatus = (bookingId: string) => {
    clearPayPoll();
    const started = Date.now();
    payPollRef.current = setInterval(async () => {
      if (!token) {
        clearPayPoll();
        return;
      }
      if (Date.now() - started > 120000) {
        clearPayPoll();
        return;
      }
      try {
        const res = await apiGetAuth<{ booking: any }>(`/bookings/${bookingId}`, token as string);
        const ps = String(res.booking?.paymentStatus || '').toUpperCase();
        setItems((prev) =>
          prev.map((it) =>
            it.id === bookingId
              ? {
                  ...it,
                  paymentStatus: res.booking.paymentStatus,
                  hasReceipt: res.booking.hasReceipt ?? it.hasReceipt,
                }
              : it,
          ),
        );
        if (ps === 'PAID') {
          clearPayPoll();
          return;
        }
      } catch {
        /* ignore transient errors */
      }
    }, 2500);
  };

  useEffect(() => () => clearPayPoll(), []);

  const load = async (reset: boolean, opts?: { force?: boolean }) => {
    if (!token) return;
    if (!opts?.force && loadInFlightRef.current) return;
    loadInFlightRef.current = true;
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
      loadInFlightRef.current = false;
      setLoading(false);
      if (reset) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    void load(true, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads latest nextCursor from render; token is the trigger
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      void load(true, { force: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]),
  );

  const pendingPaymentBookingId = route?.params?.pendingPaymentBookingId as string | undefined;
  useEffect(() => {
    const id = pendingPaymentBookingId ? String(pendingPaymentBookingId) : '';
    if (!id || !token) return;
    pollBookingPaymentStatus(id);
    navigation?.setParams?.({ pendingPaymentBookingId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPaymentBookingId, token]);

  const markItemPaid = (bookingId: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === bookingId ? { ...it, paymentStatus: 'PAID' } : it)),
    );
  };

  const closePaySheet = () => {
    setPayVisible(false);
    setPayBooking(null);
  };

  const openEasypayPay = (b: any) => {
    if (!token) {
      Alert.alert('Sign in required', 'Please sign in to pay for this booking.');
      return;
    }
    if (isBookingPaid(b.paymentStatus)) {
      markItemPaid(b.id);
      return;
    }
    setPayBooking(b);
    setPayVisible(true);
  };

  // no search/filter

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.topSafe} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Book a Field</Text>
      </View>

      <ScrollView
        style={[styles.content, Platform.OS === 'web' ? { minHeight: 0, minWidth: 0 } : null]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true, { force: true }); }} />
        }
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
                <View key={b.id} style={styles.fieldCardColumn}>
                  <FieldCard
                    field={card}
                    showRating={false}
                    onSelect={() => navigation?.navigate('CustomerBookedDetails', { booking: b })}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6 }}>
                    {String(b.status || '').toUpperCase() === 'CANCELLED' ? (
                      <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' }}>
                        <Text style={{ color: '#991b1b', fontWeight: '700', fontSize: 13 }}>Cancelled</Text>
                      </View>
                    ) : String(b.status || '').toUpperCase() === 'COMPLETED' ? (
                      <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#bae6fd' }}>
                        <Text style={{ color: '#075985', fontWeight: '700', fontSize: 13 }}>Completed</Text>
                      </View>
                    ) : isBookingPaid(b.paymentStatus) ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                        <CheckCircle size={16} color="#166534" />
                        <Text style={{ color: '#166534', fontWeight: '800' }}>Paid</Text>
                      </View>
                    ) : (
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
                        <Text style={{ color: '#ffffff', fontWeight: '800' }}>Pay with directPay</Text>
                      </TouchableOpacity>
                    )}
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
      <EasypayPaySheet
        visible={payVisible}
        bookingId={payBooking?.id ?? null}
        token={token}
        onClose={closePaySheet}
        onAlreadyPaid={(id) => {
          markItemPaid(id);
          closePaySheet();
        }}
        onPaymentSubmitted={(id) => {
          closePaySheet();
          void load(true, { force: true });
          pollBookingPaymentStatus(id);
        }}
      />
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
    ...(Platform.OS === 'web'
      ? ({
          alignSelf: 'center',
          width: '100%',
          maxWidth: 1120,
          boxSizing: 'border-box',
        } as any)
      : null),
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
    ...(Platform.OS === 'web'
      ? ({
          alignSelf: 'center',
          width: '100%',
          maxWidth: 1120,
          boxSizing: 'border-box',
        } as any)
      : null),
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
    ...(Platform.OS === 'web'
      ? ({
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'stretch',
        } as any)
      : null),
  },
  fieldCardColumn: {
    ...(Platform.OS === 'web'
      ? ({
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 320,
          minWidth: 0,
          width: '100%',
          maxWidth: 552,
        } as any)
      : null),
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
    zIndex: 0,
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
});