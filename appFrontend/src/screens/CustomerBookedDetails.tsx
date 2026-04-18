import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Calendar, Clock } from 'lucide-react-native';
import { apiGetAuth, resolveMediaUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface Props {
  navigation?: any;
  route?: any;
}

export default function CustomerBookedDetails({ navigation, route }: Props) {
  const { token } = useAuth() as any;
  const booking = route?.params?.booking;
  const field = booking?.field || {};
  const canReschedule = !['CANCELLED', 'COMPLETED'].includes(String(booking?.status || '').toUpperCase());
  const imgRel = field?.images?.[0]?.url;
  const image = resolveMediaUrl(imgRel) || 'https://via.placeholder.com/800x400?text=Field';
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const start = booking?.startAt ? new Date(booking.startAt) : null;
  const end = booking?.endAt ? new Date(booking.endAt) : null;
  const durationHours = start && end ? Math.max(1, Math.round((+end - +start) / 3600000)) : null;

  // Build per-day hourly breakdown between start and end
  const breakdown: { day: string; slots: string[] }[] = (() => {
    if (!start || !end) return [];
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
  })();

  useEffect(() => {
    (async () => {
      try {
        if (!token || !booking?.id) return;
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
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.topSafe} />

      <View style={styles.imageWrap}>
        <Image source={{ uri: image }} style={styles.image} />
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={styles.fieldName}>{field?.name || 'Field'}</Text>
          <Text style={styles.fieldSub}>{field?.address || field?.city || ''}</Text>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryBlock}>
          <View style={styles.badgeRow}>
            <Text style={[styles.badge, styles.statusBadge]}>{String(booking?.status || 'CONFIRMED')}</Text>
            <Text style={[styles.badge, styles.typeBadge]}>{String(booking?.type || 'HOURLY')}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Calendar size={18} color="#16a34a" />
            <Text style={styles.summaryText}>
              {start ? start.toLocaleString() : ''}
              {end ? ` → ${end.toLocaleString()}` : ''}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Clock size={18} color="#16a34a" />
            <Text style={styles.summaryText}>{durationHours ? `${durationHours} hour${durationHours > 1 ? 's' : ''}` : ''}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>GMD {booking?.totalAmount || 0}</Text>
          </View>
        </View>

        {/* Hourly Breakdown */}
        {breakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hourly Breakdown</Text>
            {breakdown.map((d) => (
              <View key={d.day} style={{ marginBottom: 12 }}>
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

        {/* Payment Receipt (if exists) */}
        {receipts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Receipt</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {receipts.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.9}
                    onPress={() => { setPreviewUri(resolveMediaUrl(r.imageUrl)); setPreviewVisible(true); }}
                  >
                    <Image
                      source={{ uri: resolveMediaUrl(r.imageUrl) || undefined }}
                      style={{ width: 140, height: 140, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={styles.actions}>
          {canReschedule && (
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => navigation?.navigate('Booking', { fieldId: field?.id, mode: 'reschedule', booking })}
            >
              <Text style={styles.secondaryText}>Reschedule</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.primary}
            onPress={() => navigation?.navigate('Booking', { fieldId: field?.id })}
          >
            <Text style={styles.primaryText}>Book Again</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <SafeAreaView edges={["bottom"]} />

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
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  topSafe: {
    backgroundColor: '#16a34a',
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 240,
  },
  backBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 8,
  },
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  headerBlock: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  fieldName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  fieldSub: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  summaryBlock: {
    padding: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  statusBadge: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  typeBadge: {
    backgroundColor: '#e0f2fe',
    color: '#075985',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#111827',
  },
  totalRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16a34a',
  },
  section: {
    padding: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  dayLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
  },
  slotsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotChip: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  slotText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowText: {
    fontSize: 14,
    color: '#111827',
  },
  rowLabel: {
    fontSize: 14,
    color: '#6b7280',
    width: 80,
  },
  rowValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  actions: {
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  secondary: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#ffffff',
  },
  secondaryText: {
    color: '#16a34a',
    fontWeight: '700',
    fontSize: 16,
  },
  primary: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  previewOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  previewBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewContent: {
    width: '90%',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 420,
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  previewClose: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  previewCloseText: {
    color: '#111827',
    fontWeight: '800',
  },
});


