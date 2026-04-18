import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, CalendarCheck, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth } from '../../api/client';


type Period = 'daily' | 'weekly' | 'monthly';
type Payment = 'all' | 'paid' | 'unpaid';


type BookingItem = {
  id: string;
  fieldId: string;
  fieldName: string;
  startAt: string;
  endAt: string;
  totalAmount: number;
  currency: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
};


type SummaryItem = {
  fieldId: string;
  fieldName: string;
  totalEarnings: number;
  numBookings: number;
};


export default function AdminBookingsScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const [period, setPeriod] = useState<Period>('monthly');
  const [payment, setPayment] = useState<Payment>('paid');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BookingItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<SummaryItem[]>([]);
  const [summaryTotal, setSummaryTotal] = useState<number>(0);
  const fmt = useCallback((n: number) => {
    try {
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
    } catch {
      return String((n || 0).toFixed?.(2) ?? n);
    }
  }, []);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setLoading(true);
      const list = await apiGetAuth<{ items: BookingItem[]; nextCursor?: string | null }>(`/admin/bookings?period=${period}&payment=${payment}&limit=20`, token as string);
      setItems(list.items || []);
      setNextCursor(list.nextCursor || null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [token, period, payment]);

  const loadMore = useCallback(async () => {
    if (!token || !nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const list = await apiGetAuth<{ items: BookingItem[]; nextCursor?: string | null }>(`/admin/bookings?period=${period}&payment=${payment}&limit=20&cursor=${encodeURIComponent(nextCursor)}`, token as string);
      setItems(prev => [...prev, ...(list.items || [])]);
      setNextCursor(list.nextCursor || null);
    } finally {
      setLoadingMore(false);
    }
  }, [token, period, payment, nextCursor, loadingMore]);

  const loadSummary = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingSummary(true);
      const res = await apiGetAuth<{ items: SummaryItem[]; total: number }>(`/admin/bookings/summary?period=${period}&payment=${payment}`, token as string);
      setSummary(res.items || []);
      setSummaryTotal(res.total || 0);
    } catch {
      setSummary([]);
      setSummaryTotal(0);
    } finally {
      setLoadingSummary(false);
    }
  }, [token, period, payment]);

  useEffect(() => {
    load();
    loadSummary();
  }, [load, loadSummary]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadSummary()]);
    setRefreshing(false);
  }, [load, loadSummary]);

  const PaymentButton = ({ label, val }: { label: string; val: Payment }) => {
    const active = payment === val;
    return (
      <TouchableOpacity
        style={[styles.segmentBtn, active && styles.segmentBtnActive]}
        onPress={() => setPayment(val)}
        activeOpacity={0.8}
      >
        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const PeriodButton = ({ label, val }: { label: string; val: Period }) => {
    const active = period === val;
    return (
      <TouchableOpacity
        style={[styles.segmentBtn, active && styles.segmentBtnActive]}
        onPress={() => setPeriod(val)}
        activeOpacity={0.8}
      >
        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderSummaryItem = ({ item }: { item: SummaryItem }) => (
    <View style={styles.summaryRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryName}>{item.fieldName || 'Field'}</Text>
        <Text style={styles.summarySub}>{item.numBookings} booking{item.numBookings === 1 ? '' : 's'}</Text>
      </View>
      <Text style={styles.summaryValue}>GMD {fmt(item.totalEarnings)}</Text>
    </View>
  );

  const renderBookingItem = ({ item }: { item: BookingItem }) => {
    const start = item.startAt ? new Date(item.startAt) : null;
    const end = item.endAt ? new Date(item.endAt) : null;
    const isPaid = String(item.paymentStatus || '').toUpperCase() === 'PAID';
    return (
      <View style={styles.bookingRow}>
        <View style={styles.bookingLeft}>
          <View style={styles.badgeRow}>
            {isPaid ? (
              <View style={[styles.badge, styles.badgePaid]}>
                <CheckCircle2 size={14} color="#065f46" />
                <Text style={[styles.badgeText, { color: '#065f46' }]}>Paid</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeUnpaid]}>
                <XCircle size={14} color="#991b1b" />
                <Text style={[styles.badgeText, { color: '#991b1b' }]}>Unpaid</Text>
              </View>
            )}
            <View style={[styles.badge, styles.badgeStatus]}>
              <Text style={[styles.badgeText, { color: '#374151' }]}>{String(item.status).toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.bookingTitle}>{item.fieldName || 'Field'}</Text>
          <View style={styles.timeRow}>
            <Clock size={14} color="#6b7280" />
            <Text style={styles.bookingMeta}>{start ? start.toLocaleString() : ''}{end ? ` → ${end.toLocaleString()}` : ''}</Text>
          </View>
        </View>
        <View style={styles.amountWrap}>
          <Text style={[styles.bookingAmount, isPaid ? styles.amountPaid : styles.amountUnpaid]}>
            GMD {fmt(Number(item.totalAmount || 0))}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <CalendarCheck size={22} color="#ffffff" />
          <Text style={styles.title}>Bookings</Text>
        </View>
        <Text style={styles.subtitle}>Earnings and booking overview</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Hero total card */}
        <View style={styles.heroCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Total earnings ({period})</Text>
            <Text style={styles.heroValue}>GMD {fmt(summaryTotal)}</Text>
          </View>
          <View style={[styles.heroPill, payment === 'paid' ? styles.heroPillPaid : payment === 'unpaid' ? styles.heroPillUnpaid : styles.heroPillAll]}>
            <Text style={styles.heroPillText}>{payment.toUpperCase()}</Text>
          </View>
        </View>

        {/* Period filters */}
        <View style={styles.periodRow}>
          <PeriodButton label="Daily" val="daily" />
          <PeriodButton label="Weekly" val="weekly" />
          <PeriodButton label="Monthly" val="monthly" />
        </View>
        {/* Payment filters */}
        <View style={[styles.periodRow, { marginTop: 4 }]}>
          <PaymentButton label="Paid" val="paid" />
          <PaymentButton label="Unpaid" val="unpaid" />
          <PaymentButton label="All" val="all" />
        </View>

        {/* Summary by field */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total earnings by field</Text>
          {loadingSummary ? (
            <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
          ) : summary.length === 0 ? (
            <View style={styles.center}><Text style={styles.emptyText}>No data</Text></View>
          ) : (
            <>
              <FlatList
                data={summary}
                keyExtractor={(s) => s.fieldId}
                renderItem={renderSummaryItem}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
              />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>GMD {summaryTotal.toFixed(2)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Bookings list */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Recent bookings</Text>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation?.navigate('AdminBookingsList', { period, payment })}
              activeOpacity={0.8}
            >
              <Text style={styles.linkText}>View all</Text>
              <ArrowRight size={16} color="#111827" />
            </TouchableOpacity>
          </View>
          {error ? (
            <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
          ) : loading ? (
            <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
          ) : (
            <>
              <FlatList
                data={items.slice(0, 5)}
                keyExtractor={(b) => b.id}
                renderItem={renderBookingItem}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
                scrollEnabled={false}
              />
            </>
          )}
        </View>

        {/* no separate unpaid section; use filters above */}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#dcfce7' },
  content: { flex: 1, padding: 16, backgroundColor: '#f9fafb', gap: 12 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },

  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segmentBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  segmentBtnActive: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  segmentText: { fontSize: 12, fontWeight: '800', color: '#374151' },
  segmentTextActive: { color: '#065f46' },

  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 8 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sep: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 8 },
  emptyText: { color: '#6b7280' },
  errorText: { color: '#b91c1c', fontSize: 14, textAlign: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { color: '#111827', fontWeight: '800' },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  summarySub: { fontSize: 12, color: '#6b7280' },
  summaryValue: { fontSize: 14, fontWeight: '800', color: '#111827' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  totalLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  totalValue: { fontSize: 16, fontWeight: '800', color: '#111827' },

  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  bookingLeft: { flex: 1 },
  bookingTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  bookingMeta: { fontSize: 12, color: '#374151' },
  bookingMetaSmall: { fontSize: 12, color: '#6b7280' },
  amountWrap: { alignItems: 'flex-end' },
  bookingAmount: { fontSize: 14, fontWeight: '900' },
  amountPaid: { color: '#065f46' },
  amountUnpaid: { color: '#991b1b' },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  badgePaid: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  badgeUnpaid: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  badgeStatus: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  badgeText: { fontSize: 11, fontWeight: '800' },

  heroCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 },
  heroLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 },
  heroValue: { fontSize: 22, fontWeight: '900', color: '#111827' },
  heroPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  heroPillPaid: { backgroundColor: '#dcfce7' },
  heroPillUnpaid: { backgroundColor: '#fee2e2' },
  heroPillAll: { backgroundColor: '#e5e7eb' },
  heroPillText: { fontSize: 12, fontWeight: '800', color: '#111827' },
});


