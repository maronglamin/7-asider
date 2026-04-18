import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ArrowRight, Building2 } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, resolveMediaUrl } from '../../api/client';

type OwnerItem = {
  owner: { id: string; email: string; name?: string | null; fieldCount?: number };
  fields: Array<{ id: string; name: string; city?: string | null; address?: string | null; status: string; updatedAt: string; thumbnail?: string | null }>;
};

export default function AssetOwnersScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OwnerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [ownerFieldCursor, setOwnerFieldCursor] = useState<Record<string, string | null>>({});
  const [ownerFieldPages, setOwnerFieldPages] = useState<Record<string, OwnerItem['fields']>>({});
  const [ownerFieldIndex, setOwnerFieldIndex] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setLoading(true);
      const resp = await apiGetAuth<{ items: OwnerItem[]; nextCursor?: string | null }>(`/admin/field-kyc/owners?limit=10`, token as string);
      setItems(resp.items || []);
      setNextCursor(resp.nextCursor || null);
      // seed field cursors and displayed field
      const seedCursors: Record<string, string | null> = {};
      const seedPages: Record<string, OwnerItem['fields']> = {};
      const seedIndex: Record<string, number> = {};
      (resp.items || []).forEach(it => {
        const first = it.fields?.[0];
        seedPages[it.owner.id] = first ? [first] : [];
        seedIndex[it.owner.id] = 0;
        seedCursors[it.owner.id] = first ? first.id : null;
      });
      setOwnerFieldPages(seedPages);
      setOwnerFieldIndex(seedIndex);
      setOwnerFieldCursor(seedCursors);
    } catch (e: any) {
      setError(e?.message || 'Failed to load owners');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadMore = useCallback(async () => {
    if (!token || !nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const resp = await apiGetAuth<{ items: OwnerItem[]; nextCursor?: string | null }>(`/admin/field-kyc/owners?limit=10&cursor=${encodeURIComponent(nextCursor)}`, token as string);
      const newItems = resp.items || [];
      setItems(prev => [...prev, ...newItems]);
      setNextCursor(resp.nextCursor || null);
      setOwnerFieldCursor(prev => {
        const copy = { ...prev };
        newItems.forEach(it => {
          const first = it.fields?.[0];
          copy[it.owner.id] = first ? first.id : null;
        });
        return copy;
      });
      setOwnerFieldPages(prev => {
        const copy = { ...prev };
        newItems.forEach(it => {
          const first = it.fields?.[0];
          copy[it.owner.id] = first ? [first] : [];
        });
        return copy;
      });
      setOwnerFieldIndex(prev => {
        const copy = { ...prev };
        newItems.forEach(it => {
          copy[it.owner.id] = 0;
        });
        return copy;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [token, nextCursor, loadingMore]);

  useEffect(() => {
    load();
  }, [load]);

  const onNextForOwner = async (ownerId: string) => {
    const pages = ownerFieldPages[ownerId] || [];
    const idx = ownerFieldIndex[ownerId] ?? 0;
    const cachedNext = idx + 1 < pages.length ? pages[idx + 1] : undefined;
    if (cachedNext) {
      setOwnerFieldIndex(prev => ({ ...prev, [ownerId]: idx + 1 }));
      return;
    }
    const cursor = ownerFieldCursor[ownerId] || undefined;
    if (!cursor) return;
    try {
      const resp = await apiGetAuth<{ items: OwnerItem['fields']; nextCursor?: string | null }>(`/admin/field-kyc/owners/${ownerId}/fields?limit=1&cursor=${encodeURIComponent(cursor)}`, token as string);
      const next = resp.items?.[0];
      if (next) {
        setOwnerFieldPages(prev => ({ ...prev, [ownerId]: [...(prev[ownerId] || []), next] }));
        setOwnerFieldIndex(prev => ({ ...prev, [ownerId]: idx + 1 }));
        setOwnerFieldCursor(prev => ({ ...prev, [ownerId]: resp.nextCursor || null }));
      } else {
        setOwnerFieldCursor(prev => ({ ...prev, [ownerId]: null }));
      }
    } catch (e) {
      // ignore
    }
  };

  const onPrevForOwner = (ownerId: string) => {
    const idx = ownerFieldIndex[ownerId] ?? 0;
    if (idx > 0) {
      setOwnerFieldIndex(prev => ({ ...prev, [ownerId]: idx - 1 }));
    }
  };

  const renderField = (f?: OwnerItem['fields'][number], ownerId?: string) => {
    if (!f) return null;
    return (
      <View key={f.id} style={styles.fieldRow}>
        {resolveMediaUrl(f.thumbnail) ? <Image source={{ uri: resolveMediaUrl(f.thumbnail) || undefined }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: '#f3f4f6' }]} />}
        <View style={{ flex: 1 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation?.navigate('FieldDetailAdmin', { id: f.id })}>
            <Text style={styles.fieldName}>{f.name}</Text>
            <Text style={styles.fieldMeta}>{[f.city, f.address].filter(Boolean).join(' • ')}</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.statusPill, statusToStyle(f.status)]}>
          <Text style={styles.statusText}>{f.status}</Text>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: OwnerItem }) => {
    const pages = ownerFieldPages[item.owner.id] || (item.fields?.[0] ? [item.fields[0]] : []);
    const idx = ownerFieldIndex[item.owner.id] ?? 0;
    const displayed = pages[idx];
    const hasNext = (ownerFieldCursor[item.owner.id] != null) || (idx + 1 < pages.length);
    const hasPrev = idx > 0;
    return (
      <View style={styles.ownerCard}>
        <View style={styles.ownerHeader}>
          <View style={styles.ownerIcon}><Building2 size={16} color="#065f46" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerName}>{item.owner.name || item.owner.email}</Text>
            <Text style={styles.ownerEmail}>{item.owner.email}</Text>
          </View>
          <View style={styles.countPill}><Text style={styles.countText}>{item.owner.fieldCount ?? (item.fields.length || 1)}</Text></View>
        </View>
        <View style={styles.fieldsWrap}>
          {renderField(displayed, item.owner.id)}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.iconBtn, !hasPrev && styles.iconBtnDisabled]}
              disabled={!hasPrev}
              onPress={() => onPrevForOwner(item.owner.id)}
              activeOpacity={0.7}
            >
              <ArrowLeft size={16} color={hasPrev ? '#111827' : '#9ca3af'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, !hasNext && styles.iconBtnDisabled]}
              disabled={!hasNext}
              onPress={() => onNextForOwner(item.owner.id)}
              activeOpacity={0.7}
            >
              <ArrowRight size={16} color={hasNext ? '#111827' : '#9ca3af'} />
            </TouchableOpacity>
          </View>
        </View>
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
          <Building2 size={22} color="#ffffff" />
          <Text style={styles.title}>Asset owners</Text>
        </View>
        <Text style={styles.subtitle}>Grouped fields by owner</Text>
      </View>
      <View style={styles.content}>
        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
        {loading ? (
          <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(o) => o.owner.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 16 }}><ActivityIndicator color="#16a34a" /></View> : null}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function statusToStyle(status: string) {
  const s = String(status || '').toUpperCase();
  if (s === 'APPROVED') return { backgroundColor: '#dcfce7' };
  if (s === 'REJECTED') return { backgroundColor: '#fee2e2' };
  if (s === 'SUSPENDED') return { backgroundColor: '#e5e7eb' };
  return { backgroundColor: '#fef3c7' };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#dcfce7' },
  content: { flex: 1, padding: 16, backgroundColor: '#f9fafb' },
  errorBox: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 10 },
  errorText: { color: '#b91c1c' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  ownerCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, marginBottom: 12 },
  ownerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  ownerIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' },
  ownerName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  ownerEmail: { fontSize: 13, color: '#6b7280' },
  countPill: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  countText: { fontSize: 12, fontWeight: '700', color: '#111827' },

  fieldsWrap: { gap: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  thumb: { width: 48, height: 36, borderRadius: 6, backgroundColor: '#f3f4f6' },
  fieldName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  fieldMeta: { fontSize: 12, color: '#6b7280' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '800', color: '#065f46' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  iconBtn: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  iconBtnDisabled: { opacity: 0.5 },
});


