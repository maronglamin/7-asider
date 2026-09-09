import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth } from '../../api/client';
import {
  formatSupportTicketDate,
  supportStatusLabel,
  supportTicketKindLabel,
  type SupportTicketSummary,
} from '../../lib/support-tickets';

export default function MyTicketsScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      setError('');
      if (!isRefresh) setLoading(true);
      const res = await apiGetAuth<{ tickets: SupportTicketSummary[] }>('/support/tickets', token as string);
      setTickets(res.tickets || []);
    } catch (e: any) {
      setError(e?.message || 'Could not load your tickets');
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Your tickets</Text>
        <Text style={styles.subtitle}>Requests you have sent to 7-aside support.</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
          ListEmptyComponent={<Text style={error ? styles.error : styles.empty}>{error || 'You have not sent any requests yet.'}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation?.navigate('SupportTicketDetail', { ticketId: item.id })}
              activeOpacity={0.8}
            >
              <View style={styles.top}>
                <Text style={styles.ref}>{item.ref}</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{supportStatusLabel(item.status)}</Text>
                </View>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summary}>{item.summary}</Text>
                <ChevronRight size={18} color="#9ca3af" />
              </View>
              <Text style={styles.meta}>
                {formatSupportTicketDate(item.createdAt)} · {supportTicketKindLabel(item)}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#dcfce7', lineHeight: 22 },
  center: { padding: 40, alignItems: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  empty: { color: '#6b7280', paddingVertical: 24 },
  error: { color: '#b91c1c', paddingVertical: 24 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  ref: { fontSize: 13, fontWeight: '800', color: '#166534' },
  pill: { backgroundColor: '#f3f4f6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 6 },
});
