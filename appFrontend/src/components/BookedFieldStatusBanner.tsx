import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  status?: string | null;
  rejectionReason?: string | null;
  suspensionReason?: string | null;
};

/** Shown on booking / reschedule flows when the linked field is not APPROVED (e.g. suspended after you booked). */
export function BookedFieldStatusBanner({ status, rejectionReason, suspensionReason }: Props) {
  const s = String(status || '').toUpperCase();
  if (!s || s === 'APPROVED') return null;
  const detail =
    s === 'REJECTED' && rejectionReason?.trim()
      ? rejectionReason.trim()
      : s === 'SUSPENDED' && suspensionReason?.trim()
        ? suspensionReason.trim()
        : null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Field status: {s}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      <Text style={styles.note}>
        This does not change your booking record here. New bookings for this field may be unavailable until it is approved again.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 6,
  },
  detail: {
    fontSize: 14,
    color: '#78350f',
    marginBottom: 8,
    lineHeight: 20,
  },
  note: {
    fontSize: 13,
    color: '#a16207',
    lineHeight: 18,
  },
});
