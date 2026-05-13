import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, ChevronRight, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, apiPatchAuth, resolveMediaUrl } from '../../api/client';

type DatePreset = 'today' | 'yesterday' | 'week' | 'month';
type PaymentScope = 'all' | 'paid' | 'unpaid';
type ViewMode = 'report' | 'list';

type OwnerSummary = {
  bookingCount: number;
  paidCount: number;
  unpaidCount: number;
  collectedGmd: number;
  outstandingGmd: number;
};

function localDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function getRangeForPreset(preset: DatePreset): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (preset === 'today') {
    const start = localDayStart(now);
    return { start, end: addDays(start, 1), label: 'Today' };
  }
  if (preset === 'yesterday') {
    const start = localDayStart(addDays(now, -1));
    return { start, end: addDays(start, 1), label: 'Yesterday' };
  }
  if (preset === 'week') {
    const end = addDays(localDayStart(now), 1);
    const start = localDayStart(addDays(now, -6));
    return { start, end, label: 'Last 7 days' };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end, label: 'This month' };
}

function formatDalasi(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `D ${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatReportDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function buildQuery(params: { start: Date; end: Date; payment: PaymentScope; limit: number; cursor?: string | null }): string {
  const q = new URLSearchParams();
  q.set('limit', String(params.limit));
  q.set('start', params.start.toISOString());
  q.set('end', params.end.toISOString());
  q.set('payment', params.payment);
  if (params.cursor) q.set('cursor', params.cursor);
  return `/bookings/owner?${q.toString()}`;
}

export default function OwnerBookingsScreen() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('report');
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [paymentScope, setPaymentScope] = useState<PaymentScope>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [summary, setSummary] = useState<OwnerSummary | null>(null);
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const [listItems, setListItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const range = useMemo(() => getRangeForPreset(datePreset), [datePreset]);

  const overviewContextLine = useMemo(() => {
    if (datePreset === 'month') {
      return range.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (datePreset === 'week') {
      const last = addDays(range.end, -1);
      return `${formatReportDate(range.start)} – ${formatReportDate(last)}`;
    }
    return formatReportDate(range.start);
  }, [datePreset, range.start, range.end]);

  const fetchReport = useCallback(async () => {
    if (!token) {
      setSummary(null);
      setRecentItems([]);
      return;
    }
    const path = buildQuery({ start: range.start, end: range.end, payment: paymentScope, limit: 5 });
    const resp = await apiGetAuth<{ items: any[]; nextCursor: string | null; summary?: OwnerSummary }>(path, token);
    setRecentItems(resp.items || []);
    setSummary(resp.summary ?? null);
  }, [token, range.start, range.end, paymentScope]);

  const fetchListInitial = useCallback(async () => {
    if (!token) {
      setListItems([]);
      setNextCursor(null);
      return;
    }
    const path = buildQuery({ start: range.start, end: range.end, payment: paymentScope, limit: 10 });
    const resp = await apiGetAuth<{ items: any[]; nextCursor: string | null; summary?: OwnerSummary }>(path, token);
    setListItems(resp.items || []);
    setNextCursor(resp.nextCursor || null);
  }, [token, range.start, range.end, paymentScope]);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      if (viewMode === 'report') {
        await fetchReport();
      } else {
        await fetchListInitial();
      }
    } finally {
      setLoading(false);
    }
  }, [token, viewMode, fetchReport, fetchListInitial]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      (async () => {
        try {
          if (viewMode === 'report') await fetchReport();
          else await fetchListInitial();
        } catch {
          /* keep */
        }
      })();
    }, [token, viewMode, fetchReport, fetchListInitial]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (viewMode === 'report') await fetchReport();
      else await fetchListInitial();
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || viewMode !== 'list') return;
    try {
      setLoadingMore(true);
      const path = buildQuery({
        start: range.start,
        end: range.end,
        payment: paymentScope,
        limit: 10,
        cursor: nextCursor,
      });
      const resp = await apiGetAuth<{ items: any[]; nextCursor: string | null }>(path, token as string);
      setListItems((prev) => [...prev, ...(resp.items || [])]);
      setNextCursor(resp.nextCursor || null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, token, range.start, range.end, paymentScope, viewMode]);

  const paymentLabel = paymentScope === 'all' ? 'All payments' : paymentScope === 'paid' ? 'Paid only' : 'Unpaid only';

  const renderFullCard = ({ item }: { item: any }) => {
    const field = item.field;
    const imgRel = field?.images?.[0]?.url;
    const img = resolveMediaUrl(imgRel) || 'https://via.placeholder.com/600x300?text=Field';
    const start = new Date(item.startAt);
    const end = new Date(item.endAt);
    const hours = Math.max(1, Math.round((+end - +start) / 3600000));
    const typeLabel = String(item.type || '').replace('_', ' ') || 'Hourly';

    const statusStyle = (() => {
      const s = String(item.status || '').toUpperCase();
      if (s === 'CONFIRMED') return { bg: '#dcfce7', fg: '#166534' };
      if (s === 'PENDING') return { bg: '#fef3c7', fg: '#92400e' };
      if (s === 'COMPLETED') return { bg: '#e0f2fe', fg: '#075985' };
      if (s === 'CANCELLED') return { bg: '#fee2e2', fg: '#991b1b' };
      return { bg: '#e5e7eb', fg: '#374151' };
    })();

    const canMarkPaid = String(item.paymentStatus || '').toUpperCase() !== 'PAID';

    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('OwnerBookingDetail', { booking: item })}>
        <View style={styles.imageWrap}>
          <Image source={{ uri: img }} style={styles.image} />
          <View style={[styles.badgePill, { backgroundColor: statusStyle.bg, borderColor: statusStyle.fg }]}>
            <Text style={[styles.badgePillText, { color: statusStyle.fg }]}>{String(item.status || '').toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.title} numberOfLines={1}>{field?.name || 'Field'}</Text>
            <Text style={styles.priceRight}>{formatDalasi(Number(item.totalAmount))}</Text>
          </View>
          <Text style={styles.sub} numberOfLines={1}>{field?.address || field?.city || ''}</Text>
          <View style={styles.chipsRow}>
            <Text style={[styles.chip]}>{typeLabel}</Text>
            <Text style={[styles.chip]}>{hours}h</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta} numberOfLines={1}>From: {start.toLocaleString()}</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.meta} numberOfLines={1}>To: {end.toLocaleString()}</Text>
          </View>
          <Text style={styles.customer} numberOfLines={1}>By: {item.user?.name || item.user?.email || item.userId}</Text>
          <View style={{ marginTop: 8 }}>
            {!canMarkPaid ? (
              <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' }}>
                <Text style={{ color: '#166534', fontWeight: '800' }}>Paid</Text>
              </View>
            ) : item?.hasReceipt ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {item.latestReceiptUrl ? (
                  <Image source={{ uri: resolveMediaUrl(item.latestReceiptUrl) || undefined }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: '#f3f4f6' }} />
                ) : null}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#166534', fontWeight: '800' }}>Receipt uploaded</Text>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        setUpdatingId(item.id);
                        await apiPatchAuth(`/bookings/${item.id}/payment`, {}, token as string);
                        const patch = (rows: any[]) => rows.map((it) => (it.id === item.id ? { ...it, paymentStatus: 'PAID' } : it));
                        setListItems((prev) => patch(prev));
                        setRecentItems((prev) => patch(prev));
                        await fetchReport();
                      } finally {
                        setUpdatingId(null);
                      }
                    }}
                    style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, opacity: updatingId === item.id ? 0.6 : 1 }}
                    disabled={updatingId === item.id}
                  >
                    <Text style={{ color: '#ffffff', fontWeight: '800' }}>{updatingId === item.id ? 'Marking...' : 'Mark as Paid'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '600' }}>Awaiting customer payment (directPay updates automatically)</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRecentRow = (item: any, isLast: boolean) => {
    const field = item.field;
    const start = new Date(item.startAt);
    const paid = String(item.paymentStatus || '').toUpperCase() === 'PAID';
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.recentRow, isLast && styles.recentRowLast]}
        onPress={() => navigation.navigate('OwnerBookingDetail', { booking: item })}
        activeOpacity={0.65}
      >
        <View style={styles.recentRowMain}>
          <Text style={styles.recentTitle} numberOfLines={1}>{field?.name || 'Field'}</Text>
          <Text style={styles.recentSub} numberOfLines={1}>
            {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {String(item.status || '').toUpperCase()}
          </Text>
        </View>
        <View style={styles.recentRowRight}>
          <Text style={styles.recentAmount}>{formatDalasi(Number(item.totalAmount))}</Text>
          <View style={[styles.payDot, { backgroundColor: paid ? '#22c55e' : '#eab308' }]} />
        </View>
        <ChevronRight size={18} color="#a1a1aa" />
      </TouchableOpacity>
    );
  };

  const datePresets: { id: DatePreset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'week', label: 'Last 7 days' },
    { id: 'month', label: 'This month' },
  ];

  const paymentOptions: { id: PaymentScope; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'paid', label: 'Paid' },
    { id: 'unpaid', label: 'Unpaid' },
  ];

  const reportBody = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#15803d" colors={['#15803d']} />}
    >
      <View style={styles.reportPaper}>
        <Text style={styles.overviewTitle}>Bookings overview</Text>
        <Text style={styles.overviewDateLine}>{overviewContextLine}</Text>
        <Text style={styles.overviewFootnote}>
          Slot start in range · Cancelled excluded from totals
        </Text>

        {!filtersOpen ? (
          <TouchableOpacity
            style={styles.filterCollapsed}
            onPress={() => setFiltersOpen(true)}
            activeOpacity={0.65}
            accessibilityRole="button"
            accessibilityLabel="Show filter options"
          >
            <View style={styles.filterCollapsedIcon}>
              <SlidersHorizontal size={18} color="#374151" />
            </View>
            <View style={styles.filterCollapsedText}>
              <Text style={styles.filterCollapsedLabel}>Filters</Text>
              <Text style={styles.filterCollapsedValue} numberOfLines={1}>
                {range.label} · {paymentLabel}
              </Text>
            </View>
            <ChevronDown size={20} color="#9ca3af" />
          </TouchableOpacity>
        ) : (
          <View style={styles.filterExpanded}>
            <View style={styles.filterExpandedHeader}>
              <Text style={styles.filterExpandedTitle}>Filter options</Text>
              <TouchableOpacity onPress={() => setFiltersOpen(false)} hitSlop={12} accessibilityLabel="Hide filters">
                <ChevronUp size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.filterGroupLabel}>Period</Text>
            <View style={styles.chipWrap}>
              {datePresets.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.filterChip, datePreset === p.id && styles.filterChipOn]}
                  onPress={() => setDatePreset(p.id)}
                >
                  <Text style={[styles.filterChipText, datePreset === p.id && styles.filterChipTextOn]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>Payments</Text>
            <View style={styles.chipWrap}>
              {paymentOptions.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.filterChip, paymentScope === p.id && styles.filterChipOn]}
                  onPress={() => setPaymentScope(p.id)}
                >
                  <Text style={[styles.filterChipText, paymentScope === p.id && styles.filterChipTextOn]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.hideFiltersBtn} onPress={() => setFiltersOpen(false)}>
              <Text style={styles.hideFiltersBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {summary ? (
          <View style={styles.summaryStrip}>
            <View style={[styles.summaryCol, styles.summaryColBookings]}>
              <Text style={styles.summaryStripLabel}>Bookings</Text>
              <Text style={styles.summaryStripValue}>{summary.bookingCount}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={[styles.summaryCol, styles.summaryColMoney]}>
              <Text style={styles.summaryStripLabel}>Collected</Text>
              <Text style={[styles.summaryStripValueMoney, styles.summaryStripCollected]}>
                {formatDalasi(summary.collectedGmd)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={[styles.summaryCol, styles.summaryColMoney]}>
              <Text style={styles.summaryStripLabel}>Outstanding</Text>
              <Text style={[styles.summaryStripValueMoney, styles.summaryStripOutstanding]}>
                {formatDalasi(summary.outstandingGmd)}
              </Text>
            </View>
          </View>
        ) : loading ? null : (
          <Text style={styles.muted}>No summary for this range.</Text>
        )}

        {paymentScope === 'all' && summary ? (
          <Text style={styles.paidUnpaidCaption}>
            Paid {summary.paidCount} · Unpaid {summary.unpaidCount}
          </Text>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.recentHeaderRow}>
          <View>
            <Text style={styles.recentSectionTitle}>Recent</Text>
            <Text style={styles.recentSectionSub}>Newest first</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              setViewMode('list');
              setListItems([]);
              setNextCursor(null);
            }}
            style={styles.seeAllLink}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Text style={styles.seeAllLinkText}>See all</Text>
            <ChevronRight size={16} color="#15803d" />
          </TouchableOpacity>
        </View>
        {recentItems.length === 0 && !loading ? (
          <Text style={styles.muted}>No bookings in this period.</Text>
        ) : (
          <View style={styles.recentListWrap}>
            {recentItems.map((item, i) => renderRecentRow(item, i === recentItems.length - 1))}
          </View>
        )}
      </View>
    </ScrollView>
  );

  const listBanner = (
    <View style={styles.listBanner}>
      <View style={{ flex: 1 }}>
        <Text style={styles.listBannerLabel}>Active filters</Text>
        <Text style={styles.listBannerValue}>{range.label} · {paymentLabel}</Text>
      </View>
      <TouchableOpacity onPress={() => setViewMode('report')} style={styles.adjustFiltersBtn}>
        <Text style={styles.adjustFiltersBtnText}>Edit</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => (viewMode === 'list' ? setViewMode('report') : navigation.goBack())}
            style={styles.backBtn}
          >
            <ChevronLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>{viewMode === 'report' ? 'Bookings' : 'All bookings'}</Text>
            {viewMode === 'list' ? <Text style={styles.headerSubtitle}>{range.label} · {paymentLabel}</Text> : null}
          </View>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>
      <SafeAreaView style={styles.safeBottom} edges={['bottom']}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#15803d" />
          </View>
        ) : viewMode === 'report' ? (
          reportBody
        ) : (
          <FlatList
            data={listItems}
            keyExtractor={(it) => it.id}
            renderItem={renderFullCard}
            ListHeaderComponent={listBanner}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}
            onEndReachedThreshold={0.5}
            onEndReached={() => void loadMore()}
            ListFooterComponent={loadingMore ? <ActivityIndicator color="#15803d" style={{ marginVertical: 16 }} /> : null}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#15803d" colors={['#15803d']} />}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  safeTop: { backgroundColor: '#15803d' },
  safeBottom: { flex: 1, backgroundColor: '#f4f4f5' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 10,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  headerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 3,
    letterSpacing: 0.1,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },

  reportPaper: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
  },
  overviewTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#18181b',
    letterSpacing: -0.35,
  },
  overviewDateLine: {
    fontSize: 15,
    fontWeight: '400',
    color: '#52525b',
    marginTop: 6,
    lineHeight: 21,
  },
  overviewFootnote: {
    fontSize: 12,
    fontWeight: '400',
    color: '#a1a1aa',
    marginTop: 8,
    lineHeight: 16,
  },

  filterCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
    gap: 10,
  },
  filterCollapsedIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
  },
  filterCollapsedText: { flex: 1, minWidth: 0 },
  filterCollapsedLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#71717a',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  filterCollapsedValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#27272a',
    marginTop: 3,
  },

  filterExpanded: {
    marginTop: 18,
    paddingTop: 4,
    paddingBottom: 4,
  },
  filterExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterExpandedTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#27272a',
    letterSpacing: -0.1,
  },
  filterGroupLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#71717a',
    marginBottom: 8,
    marginTop: 4,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fafafa',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
  },
  filterChipOn: { backgroundColor: '#ecfdf5', borderColor: '#86efac' },
  filterChipText: { fontSize: 14, fontWeight: '500', color: '#3f3f46' },
  filterChipTextOn: { color: '#166534', fontWeight: '600' },
  hideFiltersBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  hideFiltersBtnText: { fontSize: 15, fontWeight: '600', color: '#15803d' },

  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 20,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
    overflow: 'hidden',
  },
  summaryCol: { justifyContent: 'center', alignItems: 'center' },
  summaryColBookings: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 64,
    maxWidth: 88,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  summaryColMoney: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#e4e4e7' },
  summaryStripLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  summaryStripValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#18181b',
    textAlign: 'center',
  },
  summaryStripValueMoney: {
    width: '100%',
    fontSize: 12,
    fontWeight: '600',
    color: '#18181b',
    textAlign: 'center',
    lineHeight: 17,
  },
  summaryStripCollected: { color: '#166534' },
  summaryStripOutstanding: { color: '#a16207' },
  paidUnpaidCaption: {
    fontSize: 12,
    fontWeight: '400',
    color: '#71717a',
    marginTop: 10,
    textAlign: 'center',
  },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e4e4e7', marginVertical: 20 },

  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  recentSectionTitle: { fontSize: 17, fontWeight: '600', color: '#18181b', letterSpacing: -0.2 },
  recentSectionSub: { fontSize: 12, fontWeight: '400', color: '#a1a1aa', marginTop: 2 },
  seeAllLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllLinkText: { fontSize: 15, fontWeight: '600', color: '#15803d' },

  muted: { fontSize: 14, fontWeight: '400', color: '#71717a', marginTop: 8 },

  recentListWrap: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
    backgroundColor: '#fafafa',
    overflow: 'hidden',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e4e7',
    gap: 8,
  },
  recentRowLast: { borderBottomWidth: 0 },
  recentRowMain: { flex: 1 },
  recentTitle: { fontSize: 15, fontWeight: '500', color: '#18181b', letterSpacing: -0.1 },
  recentSub: { fontSize: 13, fontWeight: '400', color: '#71717a', marginTop: 3 },
  recentRowRight: { alignItems: 'flex-end' },
  recentAmount: { fontSize: 15, fontWeight: '600', color: '#166534', letterSpacing: -0.1 },
  payDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },

  listBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
    gap: 12,
  },
  listBannerLabel: { fontSize: 11, fontWeight: '500', color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.35 },
  listBannerValue: { fontSize: 14, fontWeight: '500', color: '#27272a', marginTop: 4 },
  adjustFiltersBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f4f4f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d8',
  },
  adjustFiltersBtnText: { color: '#3f3f46', fontWeight: '600', fontSize: 13 },

  card: { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#e4e4e7' },
  imageWrap: { position: 'relative', height: 140 },
  image: { width: '100%', height: '100%' },
  badgePill: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  badgePillText: { fontSize: 11, fontWeight: '600' },
  body: { padding: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '600', color: '#18181b', letterSpacing: -0.1 },
  priceRight: { fontSize: 16, fontWeight: '600', color: '#166534' },
  sub: { fontSize: 13, fontWeight: '400', color: '#71717a', marginTop: 2 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  chip: { backgroundColor: '#f4f4f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '500', color: '#52525b', overflow: 'hidden' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  meta: { fontSize: 12, fontWeight: '400', color: '#71717a', flexShrink: 1 },
  dot: { color: '#d4d4d8' },
  customer: { fontSize: 12, fontWeight: '400', color: '#71717a', marginTop: 6 },
});
