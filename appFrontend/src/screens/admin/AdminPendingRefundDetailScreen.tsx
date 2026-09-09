import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ExternalLink } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, apiPostAuth } from '../../api/client';

type RefundDetail = {
  id: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  currency: string;
  type?: string;
  startAt: string;
  endAt: string;
  slotsLabel?: string;
  customer: { name?: string | null; email?: string | null };
  field: { name: string; city?: string | null; phone?: string | null };
  owner: { name?: string | null; email?: string | null };
  directPay: {
    businessId?: string | null;
    merchantSlug?: string | null;
    orderId?: string | null;
    orderPublicCode?: string | null;
    lastPaymentId?: string | null;
    lastPaidAt?: string | null;
    lastPaidSource?: string | null;
    pendingRefundAt?: string | null;
    dashboardUrl?: string | null;
  };
  liveOrder?: { status?: string; paymentStatus?: string; publicCode?: string; paymentId?: string | null } | null;
  liveOrderError?: string | null;
};

function formatWhen(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(+d) ? value : d.toLocaleString();
}

function Row({ label, value }: { label: string; value?: string | null }) {
  const text = String(value || '').trim() || '—';
  const copy = async () => {
    if (text === '—') return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      if (typeof window !== 'undefined') window.alert(`Copied ${label}`);
      return;
    }
    Alert.alert(label, text);
  };
  return (
    <TouchableOpacity style={styles.row} onPress={() => void copy()} activeOpacity={0.7}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>
        {text}
      </Text>
    </TouchableOpacity>
  );
}

export default function AdminPendingRefundDetailScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const bookingId = String(route?.params?.bookingId || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<RefundDetail | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!token || !bookingId) return;
    try {
      setError(null);
      setLoading(true);
      const res = await apiGetAuth<{ booking: RefundDetail }>(`/admin/bookings/${encodeURIComponent(bookingId)}`, token as string);
      setBooking(res.booking);
    } catch (e: any) {
      setError(e?.message || 'Failed to load booking');
    } finally {
      setLoading(false);
    }
  }, [token, bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmt = (n: number) =>
    `${booking?.currency || 'GMD'} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const markRefunded = async () => {
    if (!token || !booking || saving) return;
    const confirm = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.confirm('Mark this booking as refunded? Only do this after you complete the refund in directPay.')
      : await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Mark refunded',
          'Only do this after you complete the refund in directPay.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Mark refunded', onPress: () => resolve(true) },
          ],
        );
      });
    if (!confirm) return;
    try {
      setSaving(true);
      await apiPostAuth(`/admin/bookings/${booking.id}/mark-refunded`, { note }, token as string);
      navigation?.goBack();
    } catch (e: any) {
      const message = e?.message || 'Could not mark this refund complete.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Could not update', message);
    } finally {
      setSaving(false);
    }
  };

  const pending = String(booking?.status || '').toUpperCase() === 'PENDING_REFUND';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Refund review</Text>
        <Text style={styles.subtitle}>Use these details to refund the customer in directPay, then mark it done here.</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
      ) : error || !booking ? (
        <Text style={styles.error}>{error || 'Booking not found'}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Amount to refund</Text>
            <Text style={styles.heroValue}>{fmt(booking.totalAmount)}</Text>
            <Text style={styles.heroStatus}>{booking.status.replace(/_/g, ' ')} · {booking.paymentStatus}</Text>
          </View>

          <Text style={styles.section}>Booking</Text>
          <View style={styles.card}>
            <Row label="Booking ID" value={booking.id} />
            <Row label="Field" value={booking.field?.name} />
            <Row label="Field phone" value={booking.field?.phone} />
            <Row label="Slots" value={booking.slotsLabel} />
            <Row label="Customer" value={booking.customer?.name || booking.customer?.email} />
            <Row label="Customer email" value={booking.customer?.email} />
            <Row label="Field owner" value={booking.owner?.name || booking.owner?.email} />
            <Row label="Owner email" value={booking.owner?.email} />
          </View>

          <Text style={styles.section}>directPay</Text>
          <View style={styles.card}>
            <Row label="Order code" value={booking.directPay.orderPublicCode} />
            <Row label="Order ID" value={booking.directPay.orderId} />
            <Row label="Payment ID" value={booking.directPay.lastPaymentId || booking.liveOrder?.paymentId} />
            <Row label="Business ID" value={booking.directPay.businessId} />
            <Row label="Merchant slug" value={booking.directPay.merchantSlug} />
            <Row label="Paid at" value={formatWhen(booking.directPay.lastPaidAt)} />
            <Row label="Cancelled at" value={formatWhen(booking.directPay.pendingRefundAt)} />
            {booking.liveOrder ? (
              <Row
                label="Live order"
                value={`${booking.liveOrder.status || '—'} / ${booking.liveOrder.paymentStatus || '—'}`}
              />
            ) : null}
            {booking.liveOrderError ? <Text style={styles.warn}>{booking.liveOrderError}</Text> : null}
          </View>

          {booking.directPay.dashboardUrl ? (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => void Linking.openURL(booking.directPay.dashboardUrl as string)}
            >
              <ExternalLink size={16} color="#166534" />
              <Text style={styles.linkText}>Open directPay</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.howTo}>
            1. Copy the order code and payment ID.{'\n'}
            2. Refund the customer in directPay (this app does not send the refund).{'\n'}
            3. Come back here and mark the refund complete.
          </Text>

          {pending ? (
            <>
              <Text style={styles.section}>After you refund in directPay</Text>
              <TextInput
                style={styles.note}
                value={note}
                onChangeText={setNote}
                placeholder="Optional note (wallet used, reference, etc.)"
                placeholderTextColor="#9ca3af"
                multiline
              />
              <TouchableOpacity style={styles.primary} onPress={() => void markRefunded()} disabled={saving}>
                {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Mark refund complete</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.done}>This booking is no longer waiting for a refund.</Text>
          )}
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
  body: { padding: 16, paddingBottom: 40 },
  hero: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', borderRadius: 12, padding: 16, marginBottom: 16 },
  heroLabel: { fontSize: 12, fontWeight: '700', color: '#9a3412', textTransform: 'uppercase' },
  heroValue: { fontSize: 28, fontWeight: '800', color: '#9a3412', marginTop: 4 },
  heroStatus: { fontSize: 13, color: '#c2410c', marginTop: 4 },
  section: { fontSize: 12, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  row: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  rowLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 },
  rowValue: { fontSize: 15, color: '#111827', fontWeight: '600' },
  warn: { color: '#b45309', fontSize: 12, padding: 12 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 16, paddingVertical: 8 },
  linkText: { color: '#166534', fontWeight: '800' },
  howTo: { fontSize: 14, color: '#374151', lineHeight: 22, marginBottom: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  note: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, minHeight: 80, padding: 12, fontSize: 14, color: '#111827', marginBottom: 12, textAlignVertical: 'top' },
  primary: { backgroundColor: '#16a34a', borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  done: { color: '#6b7280', fontSize: 14, marginTop: 8 },
});
