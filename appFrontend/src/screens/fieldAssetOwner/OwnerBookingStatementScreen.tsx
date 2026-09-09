import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronLeft, Calendar, Download } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, apiGetAuthPdf } from '../../api/client';
import { saveAndSharePdf } from '../../utils/savePdf';

const LOGO = require('../../../assets/icon.png');
const STATEMENT_DAYS = 30;
const RANGE_OFFSET = STATEMENT_DAYS - 1;

type StatementRow = {
  id: string;
  startAt: string;
  fieldName: string;
  customerName: string;
  status: string;
  paymentStatus: string;
  amount: number;
  unitCount?: number;
  slotsLabel?: string;
};

type OwnerStatement = {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  owner: { name: string; email: string; phone: string | null };
  fields: { name: string; address: string | null; city: string | null }[];
  rows: StatementRow[];
  totals: {
    bookingCount: number;
    collectedGmd: number;
    outstandingGmd: number;
    cancelledGmd: number;
    pendingRefundGmd: number;
  };
};

function formatYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function parseYmd(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDaysKey(key: string, days: number) {
  const next = parseYmd(key);
  next.setDate(next.getDate() + days);
  return formatYmd(next);
}

function defaultRange() {
  const end = formatYmd(new Date());
  return { start: addDaysKey(end, -RANGE_OFFSET), end };
}

function formatGmd(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `GMD ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatStatus(value: string) {
  return String(value || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLongDate(key: string) {
  return parseYmd(key).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatRowDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OwnerBookingStatementScreen({ navigation }: { navigation?: any }) {
  const { token } = useAuth();
  const initial = useMemo(() => defaultRange(), []);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [statement, setStatement] = useState<OwnerStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyStart = (nextStart: string) => {
    setStart(nextStart);
    setEnd(addDaysKey(nextStart, RANGE_OFFSET));
  };

  const applyEnd = (nextEnd: string) => {
    setEnd(nextEnd);
    setStart(addDaysKey(nextEnd, -RANGE_OFFSET));
  };

  const loadStatement = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ start, end });
      const res = await apiGetAuth<{ statement: OwnerStatement }>(`/bookings/owner/statement?${qs.toString()}`, token);
      setStatement(res.statement);
    } catch (e: any) {
      setStatement(null);
      setError(e?.message || 'Failed to load statement');
    } finally {
      setLoading(false);
    }
  }, [token, start, end]);

  useEffect(() => {
    void loadStatement();
  }, [loadStatement]);

  const exportPdf = async () => {
    if (!token || exporting) return;
    try {
      setExporting(true);
      const qs = new URLSearchParams({ start, end, format: 'pdf' });
      const { buffer, filename } = await apiGetAuthPdf(`/bookings/owner/statement?${qs.toString()}`, token);
      await saveAndSharePdf(buffer, filename);
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Could not export the PDF statement.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.headerBtn} accessibilityLabel="Go back">
            <ChevronLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Booking statement</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.helper}>
          Choose a start and end date. The range is always exactly {STATEMENT_DAYS} days and includes every booking status.
        </Text>

        <View style={styles.rangeRow}>
          <DateField
            label="Start date"
            value={start}
            onPress={() => setShowStartPicker(true)}
            onWebChange={applyStart}
          />
          <DateField
            label="End date"
            value={end}
            onPress={() => setShowEndPicker(true)}
            onWebChange={applyEnd}
          />
        </View>
        <Text style={styles.rangeNote}>{formatLongDate(start)} – {formatLongDate(end)}</Text>

        <TouchableOpacity style={styles.primary} onPress={() => void loadStatement()} disabled={loading}>
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Build statement</Text>}
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {statement ? (
          <View style={styles.paper}>
            <View style={styles.letterhead}>
              <View style={styles.brandBlock}>
                <Image source={LOGO} style={styles.logo} />
                <View>
                  <Text style={styles.brandName}>7a-side</Text>
                  <Text style={styles.brandSub}>Football field booking</Text>
                  <Text style={styles.brandTag}>Booking statement</Text>
                </View>
              </View>
              <View style={styles.ownerBlock}>
                <Text style={styles.ownerName}>{statement.owner.name}</Text>
                <Text style={styles.ownerMeta}>{statement.owner.email}</Text>
                {statement.owner.phone ? <Text style={styles.ownerMeta}>{statement.owner.phone}</Text> : null}
                <Text style={styles.ownerMeta} numberOfLines={2}>
                  {statement.fields.length ? statement.fields.map((f) => f.name).join(', ') : 'All fields'}
                </Text>
              </View>
            </View>

            <View style={styles.periodRule} />
            <Text style={styles.periodLine}>
              {formatLongDate(statement.periodStart)} – {formatLongDate(statement.periodEnd)}
            </Text>

            <View style={styles.totalsRow}>
              <TotalCell label="Bookings" value={String(statement.totals.bookingCount)} />
              <TotalCell label="Collected" value={formatGmd(statement.totals.collectedGmd)} />
              <TotalCell label="Outstanding" value={formatGmd(statement.totals.outstandingGmd)} />
              <TotalCell label="Cancelled" value={formatGmd(statement.totals.cancelledGmd + statement.totals.pendingRefundGmd)} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.table}>
                <View style={[styles.tr, styles.thead]}>
                  <Text style={[styles.th, styles.colDate]}>Date</Text>
                  <Text style={[styles.th, styles.colTime]}>Time booked</Text>
                  <Text style={[styles.th, styles.colField]}>Field</Text>
                  <Text style={[styles.th, styles.colCust]}>Customer</Text>
                  <Text style={[styles.th, styles.colStatus]}>Status</Text>
                  <Text style={[styles.th, styles.colPay]}>Payment</Text>
                  <Text style={[styles.th, styles.colAmt]}>Amount</Text>
                </View>
                {statement.rows.length === 0 ? (
                  <View style={styles.tr}>
                    <Text style={styles.emptyRow}>No bookings in this period.</Text>
                  </View>
                ) : (
                  statement.rows.map((row) => (
                    <View key={row.id} style={styles.tr}>
                      <Text style={[styles.td, styles.colDate]}>{formatRowDate(row.startAt)}</Text>
                      <Text style={[styles.td, styles.colTime]}>
                        {row.slotsLabel || '—'}
                        {row.unitCount ? `\n${row.unitCount} hour${row.unitCount === 1 ? '' : 's'}` : ''}
                      </Text>
                      <Text style={[styles.td, styles.colField]} numberOfLines={1}>{row.fieldName}</Text>
                      <Text style={[styles.td, styles.colCust]} numberOfLines={1}>{row.customerName}</Text>
                      <Text style={[styles.td, styles.colStatus]}>{formatStatus(row.status)}</Text>
                      <Text style={[styles.td, styles.colPay]}>{formatStatus(row.paymentStatus)}</Text>
                      <Text style={[styles.td, styles.colAmt]}>{formatGmd(row.amount)}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {statement ? (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <TouchableOpacity style={styles.primary} onPress={() => void exportPdf()} disabled={exporting}>
            {exporting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={styles.exportRow}>
                <Download size={18} color="#ffffff" />
                <Text style={styles.primaryText}>Export PDF</Text>
              </View>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      ) : null}

      {Platform.OS !== 'web' && showStartPicker ? (
        <DateTimePicker
          value={parseYmd(start)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, date) => {
            setShowStartPicker(false);
            if (date) applyStart(formatYmd(date));
          }}
        />
      ) : null}
      {Platform.OS !== 'web' && showEndPicker ? (
        <DateTimePicker
          value={parseYmd(end)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, date) => {
            setShowEndPicker(false);
            if (date) applyEnd(formatYmd(date));
          }}
        />
      ) : null}
    </View>
  );
}

function DateField({
  label,
  value,
  onPress,
  onWebChange,
}: {
  label: string;
  value: string;
  onPress: () => void;
  onWebChange: (next: string) => void;
}) {
  return (
    <View style={styles.dateField}>
      <Text style={styles.dateLabel}>{label}</Text>
      {Platform.OS === 'web' ? (
        React.createElement('input', {
          type: 'date',
          value,
          onChange: (e: any) => {
            if (e?.target?.value) onWebChange(e.target.value);
          },
          style: {
            border: '1px solid #e4e4e7',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 15,
            color: '#18181b',
            background: '#ffffff',
          },
        })
      ) : (
        <TouchableOpacity style={styles.dateBtn} onPress={onPress}>
          <Calendar size={16} color="#15803d" />
          <Text style={styles.dateValue}>{formatLongDate(value)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function TotalCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalCell}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f4f5' },
  safeTop: { backgroundColor: '#15803d' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 10,
  },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  headerTitle: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 32 },
  helper: { fontSize: 14, color: '#52525b', lineHeight: 20, marginBottom: 14 },
  rangeRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  dateLabel: { fontSize: 12, fontWeight: '600', color: '#71717a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateValue: { fontSize: 14, fontWeight: '500', color: '#18181b', flex: 1 },
  rangeNote: { marginTop: 8, fontSize: 13, color: '#71717a' },
  primary: {
    marginTop: 16,
    backgroundColor: '#15803d',
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  exportRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { marginTop: 12, color: '#b91c1c', fontSize: 13 },
  paper: {
    marginTop: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
  },
  letterhead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  brandBlock: { flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 },
  logo: { width: 44, height: 44, borderRadius: 10 },
  brandName: { fontSize: 18, fontWeight: '800', color: '#15803d' },
  brandSub: { fontSize: 12, color: '#71717a', marginTop: 1 },
  brandTag: { fontSize: 11, fontWeight: '700', color: '#15803d', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  ownerBlock: { flex: 1, alignItems: 'flex-end' },
  ownerName: { fontSize: 15, fontWeight: '700', color: '#18181b', textAlign: 'right' },
  ownerMeta: { fontSize: 12, color: '#71717a', marginTop: 2, textAlign: 'right' },
  periodRule: { height: 1.5, backgroundColor: '#15803d', marginTop: 16, marginBottom: 10 },
  periodLine: { fontSize: 13, fontWeight: '600', color: '#18181b', marginBottom: 14 },
  totalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  totalCell: { flexGrow: 1, minWidth: '45%', backgroundColor: '#fafafa', borderRadius: 8, padding: 10 },
  totalLabel: { fontSize: 11, fontWeight: '600', color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.3 },
  totalValue: { fontSize: 13, fontWeight: '700', color: '#18181b', marginTop: 4 },
  table: { minWidth: 860 },
  tr: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e4e7',
    paddingVertical: 10,
    gap: 8,
  },
  thead: { borderBottomWidth: 1, borderBottomColor: '#18181b', paddingBottom: 8, alignItems: 'center' },
  th: { fontSize: 11, fontWeight: '700', color: '#71717a', textTransform: 'uppercase' },
  td: { fontSize: 12, color: '#18181b' },
  colDate: { width: 92 },
  colTime: { width: 220 },
  colField: { width: 130 },
  colCust: { width: 120 },
  colStatus: { width: 88 },
  colPay: { width: 72 },
  colAmt: { width: 110, textAlign: 'right' },
  emptyRow: { fontSize: 13, color: '#71717a', paddingVertical: 8 },
  footer: { backgroundColor: '#ffffff', paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e4e4e7' },
});
