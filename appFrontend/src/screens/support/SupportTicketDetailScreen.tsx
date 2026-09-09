import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth } from '../../api/client';
import {
  formatSupportTicketDate,
  formatSupportTicketDateTime,
  supportStatusLabel,
  supportTicketKindLabel,
  supportTopicLabel,
  type SupportTicketComment,
  type SupportTicketSummary,
} from '../../lib/support-tickets';

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && styles.detailBorder]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function SupportTicketDetailScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const ticketId = String(route?.params?.ticketId || '');
  const [ticket, setTicket] = useState<SupportTicketSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token || !ticketId) return;
    try {
      setError('');
      if (!isRefresh) setLoading(true);
      const res = await apiGetAuth<{ ticket: SupportTicketSummary }>(
        `/support/tickets/${encodeURIComponent(ticketId)}`,
        token as string,
      );
      setTicket(res.ticket);
    } catch (e: any) {
      setError(e?.message || 'Could not load this ticket');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ticketId, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const comments: SupportTicketComment[] = ticket?.comments || [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>{ticket?.ref || 'Ticket'}</Text>
        <Text style={styles.subtitle}>Live status and replies from Deskline support.</Text>
      </View>
      {loading && !ticket ? (
        <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
      ) : !ticket ? (
        <Text style={styles.error}>{error || 'Ticket not found'}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
        >
          <View style={styles.hero}>
            <Text style={styles.ref}>{ticket.ref}</Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{supportStatusLabel(ticket.status)}</Text>
            </View>
          </View>
          <View style={styles.card}>
            <DetailRow label="Topic" value={supportTopicLabel(ticket.topic)} />
            <DetailRow label="Type" value={supportTicketKindLabel(ticket)} />
            <DetailRow label="Sent" value={formatSupportTicketDate(ticket.createdAt)} last />
          </View>
          <View style={styles.card}>
            <Text style={styles.section}>Subject</Text>
            <Text style={styles.summary}>{ticket.summary}</Text>
            <Text style={[styles.section, { marginTop: 16 }]}>Message</Text>
            <Text style={styles.message}>{ticket.message}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.section}>Replies</Text>
            {comments.length === 0 ? (
              <Text style={styles.empty}>No replies yet. When support responds, it will show up here.</Text>
            ) : (
              comments.map((comment, index) => (
                <View key={comment.id} style={[styles.comment, index < comments.length - 1 && styles.commentBorder]}>
                  <View style={styles.commentMeta}>
                    <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                    <Text style={styles.commentDate}>{formatSupportTicketDateTime(comment.createdAt)}</Text>
                  </View>
                  <Text style={styles.commentBody}>{comment.body}</Text>
                </View>
              ))
            )}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
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
  error: { color: '#b91c1c', padding: 16 },
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  hero: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ref: { fontSize: 18, fontWeight: '800', color: '#166534' },
  pill: { backgroundColor: '#f3f4f6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  detailBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  detailLabel: { fontSize: 13, color: '#6b7280' },
  detailValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  section: { fontSize: 12, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase' },
  summary: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 8 },
  message: { fontSize: 15, lineHeight: 22, color: '#374151', marginTop: 8 },
  empty: { fontSize: 14, color: '#6b7280', marginTop: 10, lineHeight: 20 },
  comment: { marginTop: 12, gap: 6 },
  commentBorder: { paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  commentMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  commentAuthor: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  commentDate: { fontSize: 12, color: '#9ca3af' },
  commentBody: { fontSize: 15, lineHeight: 22, color: '#374151' },
});
