import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, ScanLine } from 'lucide-react-native';
import { apiGetAuth, apiPatchAuth, resolveMediaUrl } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { CheckInScannerModal } from '../../components/CheckInScannerModal';
import { isBookingPaid } from '../../utils/easypayBookerMessages';

export default function OwnerBookingDetail({ navigation, route }: any) {
  const { token } = useAuth();
  const paramBooking = route?.params?.booking;
  const bookingIdParam = route?.params?.bookingId as string | undefined;
  const [booking, setBooking] = useState<any>(paramBooking || null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(() => Boolean(bookingIdParam && !paramBooking?.id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const field = booking?.field || {};
  const imgRel = field?.images?.[0]?.url;
  const image = resolveMediaUrl(imgRel) || 'https://via.placeholder.com/800x400?text=Field';
  const [payUpdating, setPayUpdating] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const start = useMemo(
    () => (booking?.startAt ? new Date(booking.startAt) : new Date(NaN)),
    [booking?.startAt],
  );
  const end = useMemo(
    () => (booking?.endAt ? new Date(booking.endAt) : new Date(NaN)),
    [booking?.endAt],
  );
  const durationHours =
    booking?.startAt && booking?.endAt && !Number.isNaN(+start) && !Number.isNaN(+end)
      ? Math.max(1, Math.round((+end - +start) / 3600000))
      : 0;
  const typeLabel = String(booking?.type || '').replace('_', ' ') || 'Hourly';

  const breakdown: { day: string; slots: string[] }[] = useMemo(() => {
    if (!booking?.startAt || !booking?.endAt || Number.isNaN(+start) || Number.isNaN(+end)) return [];
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
  }, [start, end, booking?.startAt, booking?.endAt]);

  useEffect(() => {
    const bid = bookingIdParam ? String(bookingIdParam).trim() : '';
    if (!bid || paramBooking?.id) return;
    if (!token) {
      setLoadError('Sign in to view this booking.');
      setLoadingDetail(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingDetail(true);
      setLoadError(null);
      try {
        const res = await apiGetAuth<{ booking: any }>(`/bookings/${encodeURIComponent(bid)}`, token as string);
        if (cancelled) return;
        if (res?.booking) setBooking(res.booking);
        else setLoadError('Booking not found.');
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Could not load booking.');
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingIdParam, paramBooking?.id, token]);

  useEffect(() => {
    if (paramBooking?.id) {
      setLoadingDetail(false);
      setLoadError(null);
    }
  }, [paramBooking?.id]);

  const paid = isBookingPaid(booking?.paymentStatus);
  const completed = String(booking?.status || '').toUpperCase() === 'COMPLETED';
  const cancelled = String(booking?.status || '').toUpperCase() === 'CANCELLED';
  const canScanCheckIn = Boolean(token && booking?.id && paid && !completed && !cancelled);

  const onMarkPaid = async () => {
    try {
      setPayUpdating(true);
      await apiPatchAuth(`/bookings/${booking.id}/payment`, {}, token as string);
      Alert.alert('Updated', 'Booking marked as PAID.');
      setBooking((prev: any) => (prev ? { ...prev, paymentStatus: 'PAID' } : prev));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to mark as paid');
    } finally {
      setPayUpdating(false);
    }
  };

  const refreshBooking = useCallback(async () => {
    if (!token || !booking?.id) return;
    try {
      const res = await apiGetAuth<{ booking: any }>(`/bookings/${booking.id}`, token as string);
      if (res?.booking) {
        setBooking((prev: any) => ({
          ...prev,
          ...res.booking,
          field: res.booking.field || prev?.field,
          user: res.booking.user || prev?.user,
        }));
      }
    } catch (_) {
      /* keep cached detail */
    }
  }, [token, booking?.id]);

  useFocusEffect(
    useCallback(() => {
      void refreshBooking();
    }, [refreshBooking]),
  );

  useEffect(() => {
    if (paramBooking) setBooking(paramBooking);
  }, [paramBooking?.id]);

  useEffect(() => {
    if (!booking?.id || !token) return;
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

  if (loadingDetail || !booking?.id) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeTop} edges={["top"]}>
          <StatusBar style="light" />
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <ChevronLeft size={24} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Booking Detail</Text>
            <View style={{ width: 32 }} />
          </View>
        </SafeAreaView>
        <View style={[styles.content, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
          {loadError ? (
            <Text style={styles.meta}>{loadError}</Text>
          ) : (
            <ActivityIndicator size="large" color="#16a34a" />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeTop} edges={["top"]}>
        <StatusBar style="light" />
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
            <Text style={styles.value}>{Number.isNaN(+start) ? '—' : start.toLocaleString()}</Text>
          </View>
          <View>
            <Text style={styles.label}>To</Text>
            <Text style={styles.value}>{Number.isNaN(+end) ? '—' : end.toLocaleString()}</Text>
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
          <Text style={styles.sectionTitle}>Payment</Text>
          <View style={{ marginBottom: 10 }}>
            {isBookingPaid(booking?.paymentStatus) ? (
              <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' }}>
                <Text style={{ color: '#166534', fontWeight: '800' }}>Paid</Text>
                <Text style={{ color: '#166534', fontSize: 12, marginTop: 4 }}>
                  Scan the guest check-in QR on their booking details to mark this visit completed.
                </Text>
              </View>
            ) : (
              <Text style={styles.meta}>
                Awaiting payment. Customers paying with directPay do not need to upload a receipt; this screen updates when
                payment is confirmed.
              </Text>
            )}
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Payment receipts (optional)</Text>
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
          )}
        </View>
        
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            disabled={
              payUpdating ||
              paid ||
              !booking?.hasReceipt
            }
            style={[
              styles.secondary,
              (payUpdating || paid || !booking?.hasReceipt) && { opacity: 0.6 },
            ]}
            onPress={onMarkPaid}
          >
            <Text style={styles.secondaryText}>
              {paid
                ? 'Paid'
                : !booking?.hasReceipt
                  ? 'Receipt needed to mark paid'
                  : payUpdating
                    ? 'Marking...'
                    : 'Mark as Paid'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!canScanCheckIn}
            style={[styles.primary, styles.scanBtn, !canScanCheckIn && { opacity: 0.6 }]}
            onPress={() => {
              if (!canScanCheckIn) {
                if (!paid) Alert.alert('Payment needed', 'The guest must pay before you can scan their check-in code.');
                return;
              }
              setScannerVisible(true);
            }}
          >
            <ScanLine size={18} color="#ffffff" />
            <Text style={styles.primaryText}>{completed ? 'Checked in' : 'Scan QR'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {token && booking?.id ? (
        <CheckInScannerModal
          visible={scannerVisible}
          bookingId={String(booking.id)}
          token={token as string}
          onClose={() => setScannerVisible(false)}
          onCompleted={() => {
            setBooking((prev: any) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
            void refreshBooking();
          }}
        />
      ) : null}

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
  meta: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  label: { fontSize: 12, color: '#6b7280' },
  value: { fontSize: 14, color: '#111827', fontWeight: '600' },
  total: { fontSize: 18, fontWeight: '800', color: '#16a34a' },
  status: { fontSize: 12, color: '#6b7280' },
  footer: { backgroundColor: '#ffffff', padding: 16 },
  buttonsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  primary: { backgroundColor: '#16a34a', borderRadius: 8, alignItems: 'center', paddingVertical: 14, flex: 1 },
  scanBtn: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
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


