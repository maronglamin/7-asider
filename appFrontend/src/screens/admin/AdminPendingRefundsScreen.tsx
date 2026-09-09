import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Wallet, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth } from '../../api/client';

export type PendingRefundItem = {
  id: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  currency: string;
  startAt: string;
  endAt: string;
  slotsLabel?: string;
  customer: { name?: string | null; email?: string | null };
  field: { name: string };
  owner: { name?: string | null; email?: string | null };
  directPay: {
    orderPublicCode?: string | null;
    orderId?: string | null;
    pendingRefundAt?: string | null;
  };
};

export default function AdminPendingRefundsScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PendingRefundItem[]>([]);
  const [count, setCount] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      setError(null);
      if (!isRefresh) setLoading(true);
      const res = await apiGetAuth<{ items: PendingRefundItem[]; count: number }>(
        '/admin/bookings/pending-refunds',
        token as string,
      );
      setItems(res.items || []);
      setCount(res.count || 0);
    } catch (e: any) {
      setError(e?.message || 'Failed to load pending refunds');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const fmt = (n: number) =>
    `GMD ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Wallet size={22} color="#ffffff" />
          <Text style={styles.title}>Pending refunds</Text>
        </View>
        <Text style={styles.subtitle}>Paid bookings cancelled by a field owner. Review and refund in directPay.</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.countText}>{count} waiting</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? (
          <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={<Text style={styles.empty}>No paid cancellations waiting for a refund.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation?.navigate('AdminPendingRefundDetail', { bookingId: item.id })}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.field}>{item.field?.name || 'Field'}</Text>
                  <Text style={styles.meta}>{item.customer?.name || item.customer?.email || 'Customer'}</Text>
                  <Text style={styles.meta}>{item.slotsLabel || new Date(item.startAt).toLocaleString()}</Text>
                  <Text style={styles.code}>
                    directPay {item.directPay?.orderPublicCode || item.directPay?.orderId || 'order not stored'}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.amount}>{fmt(item.totalAmount)}</Text>
                  <ChevronRight size={18} color="#9ca3af" />
                </View>
              </TouchableOpacity>
            )}
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
  title: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#dcfce7', lineHeight: 20 },
  content: { flex: 1, padding: 16, backgroundColor: '#f9fafb' },
  countText: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 10 },
  error: { color: '#b91c1c', marginBottom: 8 },
  empty: { color: '#6b7280', paddingVertical: 24 },
  center: { paddingVertical: 24, alignItems: 'center' },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, flexDirection: 'row', gap: 10 },
  field: { fontSize: 15, fontWeight: '800', color: '#111827' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  code: { fontSize: 12, color: '#9a3412', marginTop: 6, fontWeight: '700' },
  right: { alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  amount: { fontSize: 14, fontWeight: '800', color: '#9a3412' },
});
