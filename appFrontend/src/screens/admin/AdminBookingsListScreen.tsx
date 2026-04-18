import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth } from '../../api/client';

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

export default function AdminBookingsListScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const period = (route?.params?.period as 'daily' | 'weekly' | 'monthly') || 'monthly';
  const payment = (route?.params?.payment as 'paid' | 'unpaid' | 'all') || 'paid';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BookingItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
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
      const list = await apiGetAuth<{ items: BookingItem[]; nextCursor?: string | null }>(`/admin/bookings?period=${period}&payment=${payment}&limit=25`, token as string);
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
      const list = await apiGetAuth<{ items: BookingItem[]; nextCursor?: string | null }>(`/admin/bookings?period=${period}&payment=${payment}&limit=25&cursor=${encodeURIComponent(nextCursor)}`, token as string);
      setItems(prev => [...prev, ...(list.items || [])]);
      setNextCursor(list.nextCursor || null);
    } finally {
      setLoadingMore(false);
    }
  }, [token, period, payment, nextCursor, loadingMore]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = ({ item }: { item: BookingItem }) => {
    const start = item.startAt ? new Date(item.startAt) : null;
    const end = item.endAt ? new Date(item.endAt) : null;
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.fieldName || 'Field'}</Text>
          <Text style={styles.meta}>{start ? start.toLocaleString() : ''}{end ? ` → ${end.toLocaleString()}` : ''}</Text>
          <Text style={styles.metaSmall}>{item.paymentStatus} • {item.status}</Text>
        </View>
        <Text style={styles.amount}>GMD {fmt(Number(item.totalAmount || 0))}</Text>
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
          <Text style={styles.titleHeader}>All bookings</Text>
        </View>
        <Text style={styles.subtitle}>Filtered: {period} • {payment}</Text>
      </View>
      <View style={styles.content}>
        {error ? <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View> : null}
        {loading ? (
          <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(b) => b.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 12 }}><ActivityIndicator color="#16a34a" /></View> : null}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  titleHeader: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#dcfce7' },
  content: { flex: 1, padding: 16, backgroundColor: '#f9fafb' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  errorText: { color: '#b91c1c' },
  sep: { height: 1, backgroundColor: '#e5e7eb' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, backgroundColor: '#ffffff', paddingHorizontal: 8, borderRadius: 8 },
  title: { fontSize: 14, fontWeight: '800', color: '#111827' },
  meta: { fontSize: 12, color: '#374151' },
  metaSmall: { fontSize: 12, color: '#6b7280' },
  amount: { fontSize: 14, fontWeight: '900', color: '#111827' },
});


