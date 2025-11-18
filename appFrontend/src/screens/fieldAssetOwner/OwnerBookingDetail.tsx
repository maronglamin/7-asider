import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft } from 'lucide-react-native';
import { API_BASE, apiGetAuth, apiPatchAuth } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function OwnerBookingDetail({ navigation, route }: any) {
  const { token } = useAuth();
  const booking = route?.params?.booking;
  const field = booking?.field || {};
  const imgRel = field?.images?.[0]?.url;
  const image = imgRel ? `${API_BASE}${imgRel}` : 'https://via.placeholder.com/800x400?text=Field';
  const [updating, setUpdating] = useState(false);
  const [payUpdating, setPayUpdating] = useState(false);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const start = useMemo(() => new Date(booking.startAt), [booking.startAt]);
  const end = useMemo(() => new Date(booking.endAt), [booking.endAt]);
  const durationHours = Math.max(1, Math.round((+end - +start) / 3600000));
  const typeLabel = String(booking?.type || '').replace('_', ' ') || 'Hourly';

  const breakdown: { day: string; slots: string[] }[] = useMemo(() => {
    const slots: { day: string; slot: string }[] = [];
    const pad = (n: number) => String(n).padStart(2, '0');
    const cursor = new Date(start);
    while (cursor < end) {
      const dayKey = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()))
        .toISOString()
        .slice(0, 10);
      const h = cursor.getUTCHours();
      const nextH = (h + 1) % 24;
      slots.push({ day: dayKey, slot: `${pad(h)}:00 - ${pad(nextH)}:00` });
      cursor.setUTCHours(h + 1, 0, 0, 0);
    }
    const byDay: Record<string, string[]> = {};
    for (const s of slots) {
      if (!byDay[s.day]) byDay[s.day] = [] as string[];
      (byDay[s.day] as string[]).push(s.slot);
    }
    return Object.keys(byDay).map((day) => ({ day, slots: byDay[day] || [] }));
  }, [start, end]);

  const onComplete = async () => {
    try {
      setUpdating(true);
      await apiPatchAuth(`/bookings/${booking.id}/status`, { status: 'COMPLETED' }, token as string);
      Alert.alert('Updated', 'Booking marked as completed.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update');
    } finally {
      setUpdating(false);
    }
  };

  const onMarkPaid = async () => {
    try {
      setPayUpdating(true);
      await apiPatchAuth(`/bookings/${booking.id}/payment`, {}, token as string);
      Alert.alert('Updated', 'Booking marked as PAID.');
      route.params.booking.paymentStatus = 'PAID';
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to mark as paid');
    } finally {
      setPayUpdating(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setLoadingReceipts(true);
        const res = await apiGetAuth<{ items: any[] }>(`/bookings/${booking.id}/receipts`, token as string);
        setReceipts(res.items || []);
      } catch (_) {
        setReceipts([]);
      } finally {
        setLoadingReceipts(false);
      }
    })();
  }, [booking?.id, token]);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeTop} edges={["top"]}>
        <StatusBar style="light" backgroundColor="#16a34a" />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Booking Detail</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ position: 'relative' }}>
          <Image source={{ uri: image }} style={styles.image} />
          <View style={styles.statusOnImage}>
            <Text style={styles.statusOnImageText}>{String(booking?.status || '').toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.blockRowBetween}>
          <View>
            <Text style={styles.title}>{field?.name || 'Field'}</Text>
            <Text style={styles.sub}>{field?.address || field?.city || ''}</Text>
          </View>
          <Text style={styles.total}>GMD {booking.totalAmount}</Text>
        </View>
        <View style={styles.block}>
          <Text style={styles.label}>Customer</Text>
          <Text style={styles.value}>{booking?.user?.name || booking?.user?.email || booking?.userId}</Text>
        </View>
        <View style={styles.blockRowBetween}>
          <View>
            <Text style={styles.label}>From</Text>
            <Text style={styles.value}>{start.toLocaleString()}</Text>
          </View>
          <View>
            <Text style={styles.label}>To</Text>
            <Text style={styles.value}>{end.toLocaleString()}</Text>
          </View>
        </View>
        <View style={styles.blockRowBetween}>
          <Text style={styles.badge}>{typeLabel}</Text>
          <Text style={[styles.badge, styles.badgeSoft]}>{durationHours} hour{durationHours > 1 ? 's' : ''}</Text>
        </View>
        {breakdown.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.sectionTitle}>Hourly Breakdown</Text>
            {breakdown.map((d) => (
              <View key={d.day} style={{ marginTop: 10 }}>
                <Text style={styles.dayLabel}>{new Date(d.day).toLocaleDateString()}</Text>
                <View style={styles.slotsWrap}>
                  {d.slots.map((s) => (
                    <View key={s} style={styles.slotChip}>
                      <Text style={styles.slotText}>{s}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>Payment Receipts</Text>
          {loadingReceipts ? (
            <Text style={styles.meta}>Loading...</Text>
          ) : receipts.length === 0 ? (
            <Text style={styles.meta}>No receipts uploaded.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {receipts.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.9}
                    onPress={() => { setPreviewUri(`${API_BASE}${r.imageUrl}`); setPreviewVisible(true); }}
                  >
                    <Image
                      source={{ uri: `${API_BASE}${r.imageUrl}` }}
                      style={{ width: 140, height: 140, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
        
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            disabled={payUpdating || String(booking.paymentStatus || '').toUpperCase() === 'PAID'}
            style={[styles.secondary, (payUpdating || String(booking.paymentStatus || '').toUpperCase() === 'PAID') && { opacity: 0.6 }]}
            onPress={onMarkPaid}
          >
            <Text style={styles.secondaryText}>{String(booking.paymentStatus || '').toUpperCase() === 'PAID' ? 'Paid' : (payUpdating ? 'Marking...' : 'Mark as Paid')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={updating || booking.status === 'COMPLETED'}
            style={[styles.primary, (updating || booking.status === 'COMPLETED') && { opacity: 0.6 }]}
            onPress={onComplete}
          >
            <Text style={styles.primaryText}>{booking.status === 'COMPLETED' ? 'Completed' : 'Mark as Completed'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Receipt Preview Modal */}
      <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewVisible(false)} />
          <View style={styles.previewContent}>
            {!!previewUri && (
              <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
            )}
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewVisible(false)}>
              <Text style={styles.previewCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  safeTop: { backgroundColor: '#16a34a' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 12 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  content: { flex: 1, backgroundColor: '#f9fafb' },
  image: { width: '100%', height: 220 },
  block: { backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  blockRow: { backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  blockRowBetween: { backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 13, color: '#6b7280' },
  label: { fontSize: 12, color: '#6b7280' },
  value: { fontSize: 14, color: '#111827', fontWeight: '600' },
  total: { fontSize: 18, fontWeight: '800', color: '#16a34a' },
  status: { fontSize: 12, color: '#6b7280' },
  footer: { backgroundColor: '#ffffff', padding: 16 },
  buttonsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  primary: { backgroundColor: '#16a34a', borderRadius: 8, alignItems: 'center', paddingVertical: 14, flex: 1 },
  primaryText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  secondary: { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#16a34a', borderRadius: 8, alignItems: 'center', paddingVertical: 14, flex: 1 },
  secondaryText: { color: '#16a34a', fontWeight: '700', fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  dayLabel: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  slotsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  slotText: { fontSize: 12, color: '#111827', fontWeight: '600' },
  badge: { backgroundColor: '#e0f2fe', color: '#075985', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, fontWeight: '700' },
  badgeSoft: { backgroundColor: '#dcfce7', color: '#166534' },
  statusOnImage: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  statusOnImageText: { fontSize: 12, fontWeight: '800', color: '#111827' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  previewBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  previewContent: { width: '90%', alignItems: 'center' },
  previewImage: { width: '100%', height: 420, borderRadius: 12, backgroundColor: '#111827' },
  previewClose: { marginTop: 12, backgroundColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  previewCloseText: { color: '#111827', fontWeight: '800' },
});


