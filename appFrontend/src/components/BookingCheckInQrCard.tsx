import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CheckCircle2, QrCode } from 'lucide-react-native';
import { apiGetAuth } from '../api/client';
import { isBookingPaid } from '../utils/easypayBookerMessages';

type Props = {
  bookingId?: string;
  paymentStatus?: unknown;
  bookingStatus?: unknown;
  token?: string | null;
};

export function BookingCheckInQrCard({ bookingId, paymentStatus, bookingStatus, token }: Props) {
  const status = String(bookingStatus || '').toUpperCase();
  const paid = isBookingPaid(paymentStatus);
  const cancelled = status === 'CANCELLED';
  const completed = status === 'COMPLETED';
  const [payload, setPayload] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !bookingId || !paid || cancelled || completed) {
      setPayload(null);
      setError(null);
      return;
    }
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGetAuth<{ payload: string; completed?: boolean }>(
          `/bookings/${encodeURIComponent(bookingId)}/check-in-code`,
          token,
        );
        if (!mounted) return;
        setPayload(String(res.payload || '').trim() || null);
      } catch (e: any) {
        if (!mounted) return;
        setPayload(null);
        setError(e?.message || 'Could not load check-in code.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [bookingId, token, paid, cancelled, status]);

  if (!paid || cancelled) return null;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <QrCode size={18} color="#166534" />
        <Text style={styles.title}>Check-in code</Text>
      </View>
      {completed ? (
        <>
          <View style={styles.doneBadge}>
            <CheckCircle2 size={18} color="#166534" />
            <Text style={styles.doneText}>Checked in</Text>
          </View>
          <Text style={styles.hint}>The field owner has scanned this booking. Enjoy the game.</Text>
        </>
      ) : (
        <>
          <Text style={styles.hint}>Show this QR code to the field owner when you arrive so they can complete your booking.</Text>
          <View style={styles.qrWrap}>
            {loading ? (
              <ActivityIndicator size="large" color="#16a34a" />
            ) : payload ? (
              <QRCode value={payload} size={196} color="#14532d" backgroundColor="#ffffff" />
            ) : (
              <Text style={styles.errorText}>{error || 'Check-in code is not available yet.'}</Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#14532d',
  },
  hint: {
    fontSize: 13,
    color: '#166534',
    lineHeight: 18,
    marginBottom: 12,
  },
  qrWrap: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    minWidth: 228,
    minHeight: 228,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 8,
  },
  doneText: {
    color: '#166534',
    fontWeight: '800',
    fontSize: 14,
  },
});
