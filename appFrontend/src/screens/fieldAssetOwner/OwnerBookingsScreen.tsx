import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, apiPatchAuth, resolveMediaUrl } from '../../api/client';

export default function OwnerBookingsScreen() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const resp = await apiGetAuth<{ items: any[]; nextCursor: string | null }>(`/bookings/owner?limit=10`, token as string);
      setItems(resp.items || []);
      setNextCursor(resp.nextCursor || null);
    } finally {
      setLoading(false);
    }
  };

  const loadQuiet = useCallback(async () => {
    if (!token) return;
    try {
      const resp = await apiGetAuth<{ items: any[]; nextCursor: string | null }>(`/bookings/owner?limit=10`, token as string);
      setItems(resp.items || []);
      setNextCursor(resp.nextCursor || null);
    } catch {
      /* keep list */
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadQuiet();
    }, [loadQuiet]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const resp = await apiGetAuth<{ items: any[]; nextCursor: string | null }>(`/bookings/owner?limit=10&cursor=${encodeURIComponent(nextCursor)}`, token as string);
      setItems((prev) => [...prev, ...(resp.items || [])]);
      setNextCursor(resp.nextCursor || null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, token]);

  const renderItem = ({ item }: { item: any }) => {
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
            <Text style={styles.priceRight}>GMD {item.totalAmount}</Text>
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
                        setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, paymentStatus: 'PAID' } : it));
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
              <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '600' }}>Awaiting customer payment (Easypay updates automatically)</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeTop} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bookings</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>
      <SafeAreaView style={styles.safeBottom} edges={["bottom"]}>
        {loading ? (
          <View style={styles.center}> 
            <ActivityIndicator color="#16a34a" />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onEndReachedThreshold={0.5}
            onEndReached={() => loadMore()}
            ListFooterComponent={loadingMore ? <ActivityIndicator color="#16a34a" /> : null}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" colors={["#16a34a"]} />}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  safeTop: { backgroundColor: '#16a34a' },
  safeBottom: { flex: 1, backgroundColor: '#f9fafb' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 12 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' },
  imageWrap: { position: 'relative', height: 140 },
  image: { width: '100%', height: '100%' },
  badgePill: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  badgePillText: { fontSize: 12, fontWeight: '700' },
  body: { padding: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '800', color: '#111827' },
  priceRight: { fontSize: 16, fontWeight: '800', color: '#16a34a' },
  sub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  chip: { backgroundColor: '#f3f4f6', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, color: '#374151', overflow: 'hidden' },
  totalChip: { backgroundColor: '#dcfce7', color: '#166534', fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  meta: { fontSize: 12, color: '#6b7280', flexShrink: 1 },
  dot: { color: '#9ca3af' },
  customer: { fontSize: 12, color: '#6b7280', marginTop: 6 },
});


