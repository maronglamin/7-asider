import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Image, TouchableOpacity, TextInput, Alert, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, CheckCircle2, XCircle, PauseCircle } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, apiPatchAuth, resolveMediaUrl } from '../../api/client';

type KycImage = { id: string; url: string; order: number };
type KycRecord = {
  id: string;
  userId: string;
  name: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  surfaceType?: string | null;
  size?: string | null;
  pricePerHour?: number | null;
  hasLights?: boolean;
  description?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  rejectionReason?: string | null;
  suspensionReason?: string | null;
  images: KycImage[];
  user?: { id: string; email: string; name?: string | null };
};

export default function FieldDetailAdminScreen({ route, navigation }: any) {
  const { token } = useAuth() as any;
  const id = route.params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<KycRecord | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setLoading(true);
      const data = await apiGetAuth<KycRecord>(`/admin/field-kyc/${id}`, token as string);
      setItem(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load field');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const statusStyle = useMemo(() => {
    const base = { backgroundColor: '#e5e7eb', color: '#111827' } as const;
    if (!item) return base;
    switch (item.status) {
      case 'PENDING': return { backgroundColor: '#fef3c7', color: '#92400e' } as const;
      case 'APPROVED': return { backgroundColor: '#dcfce7', color: '#065f46' } as const;
      case 'REJECTED': return { backgroundColor: '#fee2e2', color: '#991b1b' } as const;
      case 'SUSPENDED': return { backgroundColor: '#e5e7eb', color: '#374151' } as const;
      default: return base;
    }
  }, [item]);

  const submitStatus = async (status: 'APPROVED' | 'REJECTED' | 'SUSPENDED') => {
    if (!token || !item) return;
    try {
      setSaving(true);
      const body: any = { status };
      if (status !== 'APPROVED') {
        if (!reason.trim()) {
          Alert.alert('Reason required', `Provide a reason to set status to ${status.toLowerCase()}.`);
          return;
        }
        body.reason = reason.trim();
      }
      await apiPatchAuth(`/admin/field-kyc/${item.id}/status`, body, token as string);
      setReason('');
      await load();
      Alert.alert('Updated', `Status changed to ${status}.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const heroUrl = resolveMediaUrl(item?.images?.[0]?.url) || 'https://via.placeholder.com/1200x600?text=Field';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.topSafe} />

      {/* Hero image with back button */}
      <View style={styles.imageWrap}>
        {loading ? (
          <View style={[styles.center, { height: 240 }]}><ActivityIndicator color="#16a34a" /></View>
        ) : (
          <Image source={{ uri: heroUrl }} style={styles.image} />
        )}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={[styles.center, { padding: 16, flex: 1 }]}><Text style={{ color: '#991b1b' }}>{error}</Text></View>
      ) : !item ? (
        loading ? null : <View style={[styles.center, { flex: 1 }]}><Text>Not found</Text></View>
      ) : (
        <>
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.headerBlock}>
              <Text style={styles.fieldName}>{item.name}</Text>
              <Text style={styles.fieldSub}>{item.address || item.city || ''}</Text>
            </View>

            {/* Status badge */}
            <View style={styles.summaryBlock}>
              <View style={styles.badgeRow}>
                <Text style={[styles.badge, styles.statusBadge, { backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }]}>{item.status}</Text>
              </View>
            </View>

            {/* Details */}
            <View style={styles.card}>
              <View style={styles.row}><Text style={styles.label}>Owner</Text><Text style={styles.value}>{item.user?.name || item.user?.email}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Surface</Text><Text style={styles.value}>{item.surfaceType || '-'}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Lights</Text><Text style={styles.value}>{item.hasLights ? 'Yes' : 'No'}</Text></View>
            </View>

            <View style={styles.card}>
              <Text style={styles.blockLabel}>Description</Text>
              <Text style={styles.description}>{item.description || '-'}</Text>
            </View>

            {item.status === 'REJECTED' && item.rejectionReason ? (
              <View style={styles.card}>
                <Text style={[styles.blockLabel, { color: '#991b1b' }]}>Rejected</Text>
                <Text style={[styles.description, { color: '#991b1b' }]}>{item.rejectionReason}</Text>
              </View>
            ) : null}
            {item.status === 'SUSPENDED' && item.suspensionReason ? (
              <View style={styles.card}>
                <Text style={[styles.blockLabel, { color: '#991b1b' }]}>Suspended</Text>
                <Text style={[styles.description, { color: '#991b1b' }]}>{item.suspensionReason}</Text>
              </View>
            ) : null}

            {/* Reason input */}
            <View style={styles.card}>
              <Text style={styles.reasonLabel}>Reason (required for Reject/Suspend)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter reason..."
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={Platform.OS === 'ios' ? 3 : 4}
              />
            </View>

            {/* Block actions at bottom */}
            <View style={{ height: 8 }} />
            <TouchableOpacity style={[styles.blockBtn, styles.approveBlock]} disabled={saving} onPress={() => submitStatus('APPROVED')}>
              <CheckCircle2 size={18} color="#065f46" />
              <Text style={[styles.blockBtnText, { color: '#065f46' }]}>{saving ? 'Saving...' : 'Approve'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.blockBtn, styles.rejectBlock]} disabled={saving} onPress={() => submitStatus('REJECTED')}>
              <XCircle size={18} color="#991b1b" />
              <Text style={[styles.blockBtnText, { color: '#991b1b' }]}>{saving ? 'Saving...' : 'Reject'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.blockBtn, styles.suspendBlock]} disabled={saving} onPress={() => submitStatus('SUSPENDED')}>
              <PauseCircle size={18} color="#374151" />
              <Text style={[styles.blockBtnText, { color: '#374151' }]}>{saving ? 'Saving...' : 'Suspend'}</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
          <SafeAreaView edges={['bottom']} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  topSafe: { backgroundColor: '#16a34a' },
  imageWrap: { position: 'relative' },
  image: { width: '100%', height: 240 },
  backBtn: { position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, backgroundColor: '#ffffff' },
  headerBlock: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  fieldName: { fontSize: 20, fontWeight: '700', color: '#111827' },
  fieldSub: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  summaryBlock: { padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  statusBadge: {},
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  statusText: { fontSize: 12, fontWeight: '800' },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginHorizontal: 16, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  label: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  value: { fontSize: 14, color: '#111827', marginLeft: 12, flexShrink: 1, textAlign: 'right' },
  blockLabel: { fontSize: 13, color: '#374151', fontWeight: '700', marginBottom: 6 },
  description: { fontSize: 14, color: '#374151' },
  reasonLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#ffffff', minHeight: 80, textAlignVertical: 'top' },
  blockBtn: { marginHorizontal: 16, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 14, borderWidth: 1 },
  approveBlock: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  rejectBlock: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  suspendBlock: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  blockBtnText: { fontSize: 15, fontWeight: '800' },
});


