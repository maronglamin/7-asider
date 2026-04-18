import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Users as UsersIcon, Calendar } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth } from '../../api/client';
import DateTimePicker from '@react-native-community/datetimepicker';


type UserItem = {
  id: string;
  email: string;
  name?: string | null;
  supadmin?: boolean;
  createdAt?: string;
};

export default function UsersScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<UserItem[]>([]);
  const [count, setCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // filters
  const [start, setStart] = useState<string>(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState<string>(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  });
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const formatYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setLoading(true);
      const qs = new URLSearchParams();
      qs.set('supadmin', '0');
      if (start) qs.set('start', start);
      if (end) qs.set('end', end);
      qs.set('limit', '20');
      const res = await apiGetAuth<{ items: UserItem[]; nextCursor?: string | null; count?: number }>(`/admin/users?${qs.toString()}`, token as string);
      setItems(res.items || []);
      setNextCursor(res.nextCursor || null);
      setCount(res.count || 0);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [token, start, end]);

  const loadMore = useCallback(async () => {
    if (!token || !nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const qs = new URLSearchParams();
      qs.set('supadmin', '0');
      if (start) qs.set('start', start);
      if (end) qs.set('end', end);
      qs.set('limit', '20');
      qs.set('cursor', nextCursor);
      const res = await apiGetAuth<{ items: UserItem[]; nextCursor?: string | null; count?: number }>(`/admin/users?${qs.toString()}`, token as string);
      setItems(prev => [...prev, ...(res.items || [])]);
      setNextCursor(res.nextCursor || null);
      if (res.count != null) setCount(res.count);
    } finally {
      setLoadingMore(false);
    }
  }, [token, start, end, nextCursor, loadingMore]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setNextCursor(null);
    load();
  };

  const renderItem = ({ item }: { item: UserItem }) => {
    const created = item.createdAt ? new Date(item.createdAt) : null;
    return (
      <View style={styles.userCard}>
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(item.name || item.email || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name || 'Unnamed'}</Text>
            <Text style={styles.email}>{item.email}</Text>
            {created ? <Text style={styles.meta}>Joined {created.toLocaleDateString()}</Text> : null}
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
          <UsersIcon size={22} color="#ffffff" />
          <Text style={styles.title}>Users</Text>
        </View>
        <Text style={styles.subtitle}>Manage user registrations</Text>
      </View>

      <View style={styles.content}>
        {/* Filters */}
        <View style={styles.filters}>
          <TouchableOpacity style={styles.inputWrap} activeOpacity={0.8} onPress={() => setShowStartPicker(true)}>
            <Calendar size={16} color="#6b7280" />
            <Text style={styles.inputText}>{start || 'Start YYYY-MM-DD'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.inputWrap} activeOpacity={0.8} onPress={() => setShowEndPicker(true)}>
            <Calendar size={16} color="#6b7280" />
            <Text style={styles.inputText}>{end || 'End YYYY-MM-DD'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} activeOpacity={0.8}>
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>

        {/* Count */}
        <Text style={styles.countText}>Users: {count}</Text>

        {/* List */}
        {error ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        ) : loading ? (
          <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(u) => u.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 12 }}><ActivityIndicator color="#16a34a" /></View> : null}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
      {showStartPicker && (
        <DateTimePicker
          value={start ? new Date(start) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, date) => {
            setShowStartPicker(false);
            if (date) setStart(formatYmd(date));
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={end ? new Date(end) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, date) => {
            setShowEndPicker(false);
            if (date) setEnd(formatYmd(date));
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#dcfce7' },
  content: { flex: 1, padding: 16, backgroundColor: '#f9fafb' },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, flex: 1 },
  input: { flex: 1, fontSize: 14, color: '#111827' },
  inputText: { flex: 1, fontSize: 14, color: '#111827' },
  applyBtn: { backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  applyText: { color: '#ffffff', fontWeight: '800' },
  countText: { fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 8 },

  errorBox: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 10 },
  errorText: { color: '#b91c1c' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },

  userCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#065f46', fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '800', color: '#111827' },
  email: { fontSize: 13, color: '#6b7280' },
  meta: { fontSize: 12, color: '#6b7280' },
});


