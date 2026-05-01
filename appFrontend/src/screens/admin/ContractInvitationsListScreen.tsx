import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ClipboardList, Mail } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth } from '../../api/client';

type ContractInvitationItem = {
  id: string;
  recipientEmail: string;
  recipientName?: string | null;
  ccEmails?: string[] | null;
  subject: string;
  templateType: 'DEFAULT' | 'CUSTOM';
  proposalFilename: string;
  sentAt: string;
  sentBy?: {
    email?: string | null;
    name?: string | null;
  } | null;
};

function normalizeCcEmails(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((email) => String(email || '')).filter(Boolean);
  return [];
}

export default function ContractInvitationsListScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ContractInvitationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiGetAuth<{ items: ContractInvitationItem[]; nextCursor?: string | null }>('/admin/contract-invitations?limit=20', token as string);
      setItems(res.items || []);
      setNextCursor(res.nextCursor || null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load invited list');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadMore = useCallback(async () => {
    if (!token || !nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const res = await apiGetAuth<{ items: ContractInvitationItem[]; nextCursor?: string | null }>(
        `/admin/contract-invitations?limit=20&cursor=${encodeURIComponent(nextCursor)}`,
        token as string
      );
      setItems(prev => [...prev, ...(res.items || [])]);
      setNextCursor(res.nextCursor || null);
    } finally {
      setLoadingMore(false);
    }
  }, [token, nextCursor, loadingMore]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = ({ item }: { item: ContractInvitationItem }) => {
    const sentAt = item.sentAt ? new Date(item.sentAt) : null;
    const ccEmails = normalizeCcEmails(item.ccEmails);
    return (
      <View style={styles.invitationCard}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Mail size={18} color="#065f46" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recipientName}>{item.recipientName || item.recipientEmail}</Text>
            <Text style={styles.recipientEmail}>{item.recipientEmail}</Text>
          </View>
          <View style={[styles.badge, item.templateType === 'CUSTOM' ? styles.badgeCustom : styles.badgeDefault]}>
            <Text style={styles.badgeText}>{item.templateType}</Text>
          </View>
        </View>
        <Text style={styles.subject}>{item.subject}</Text>
        <Text style={styles.meta}>
          Sent {sentAt ? sentAt.toLocaleString() : 'recently'} by {item.sentBy?.name || item.sentBy?.email || 'Super Admin'}
        </Text>
        <Text style={styles.meta}>CC: {ccEmails.length ? ccEmails.join(', ') : 'None'}</Text>
        <Text style={styles.meta}>Contract PDF: {item.proposalFilename || 'default contract PDF'}</Text>
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
          <ClipboardList size={22} color="#ffffff" />
          <Text style={styles.title}>Invited List</Text>
        </View>
        <Text style={styles.subtitle}>Sent contract invitation history</Text>
      </View>

      <View style={styles.content}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#16a34a" />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No contract invitations sent yet.</Text>
              </View>
            }
            ListFooterComponent={loadingMore ? <View style={styles.footer}><ActivityIndicator color="#16a34a" /></View> : null}
            contentContainerStyle={{ paddingBottom: 24 }}
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
  subtitle: { fontSize: 14, color: '#dcfce7' },
  content: { flex: 1, padding: 16, backgroundColor: '#f9fafb', width: '100%', maxWidth: 720, alignSelf: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  invitationCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' },
  recipientName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  recipientEmail: { fontSize: 13, color: '#6b7280' },
  subject: { fontSize: 14, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 12, color: '#6b7280' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeDefault: { backgroundColor: '#dcfce7' },
  badgeCustom: { backgroundColor: '#dbeafe' },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#111827' },
  errorBox: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 10 },
  errorText: { color: '#b91c1c' },
  emptyBox: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#6b7280', fontSize: 14 },
  footer: { paddingVertical: 12 },
});
