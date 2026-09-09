import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Platform, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Users as UsersIcon, Calendar, Search, Smartphone } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, apiPatchAuth } from '../../api/client';
import DateTimePicker from '@react-native-community/datetimepicker';


type UserItem = {
  id: string;
  email: string;
  name?: string | null;
  supadmin?: boolean;
  createdAt?: string;
  deviceLockEnabled?: boolean;
};

async function confirmUnlock(email: string): Promise<boolean> {
  const title = 'Unlock device';
  const message = `Turn off device lock for ${email}? They will be able to sign in from another phone, tablet, or browser.`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(`${title}\n\n${message}`);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Unlock', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function UsersScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<UserItem[]>([]);
  const [count, setCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [lockedOnly, setLockedOnly] = useState(false);

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

  const buildQuery = useCallback((cursor?: string | null) => {
    const qs = new URLSearchParams();
    qs.set('supadmin', '0');
    qs.set('limit', '20');
    if (appliedQuery.trim()) qs.set('q', appliedQuery.trim());
    if (lockedOnly) qs.set('deviceLock', '1');
    if (!appliedQuery.trim() && !lockedOnly) {
      if (start) qs.set('start', start);
      if (end) qs.set('end', end);
    }
    if (cursor) qs.set('cursor', cursor);
    return qs;
  }, [appliedQuery, lockedOnly, start, end]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setLoading(true);
      const res = await apiGetAuth<{ items: UserItem[]; nextCursor?: string | null; count?: number }>(`/admin/users?${buildQuery().toString()}`, token as string);
      setItems(res.items || []);
      setNextCursor(res.nextCursor || null);
      setCount(res.count || 0);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [token, buildQuery]);

  const loadMore = useCallback(async () => {
    if (!token || !nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const res = await apiGetAuth<{ items: UserItem[]; nextCursor?: string | null; count?: number }>(`/admin/users?${buildQuery(nextCursor).toString()}`, token as string);
      setItems(prev => [...prev, ...(res.items || [])]);
      setNextCursor(res.nextCursor || null);
      if (res.count != null) setCount(res.count);
    } finally {
      setLoadingMore(false);
    }
  }, [token, nextCursor, loadingMore, buildQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setNextCursor(null);
    setAppliedQuery(query.trim());
  };

  const toggleLockedOnly = () => {
    setNextCursor(null);
    setLockedOnly((prev) => !prev);
  };

  const unlockDevice = async (item: UserItem) => {
    if (!token || unlockingId) return;
    const ok = await confirmUnlock(item.email);
    if (!ok) return;
    setUnlockingId(item.id);
    try {
      await apiPatchAuth(`/admin/users/${item.id}/device-lock`, { enabled: false }, token as string);
      setItems((prev) =>
        prev.map((user) => (user.id === item.id ? { ...user, deviceLockEnabled: false } : user)),
      );
    } catch (e: any) {
      const message = e.message || 'Please try again.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert('Could not unlock', message);
      }
    } finally {
      setUnlockingId(null);
    }
  };

  const renderItem = ({ item }: { item: UserItem }) => {
    const created = item.createdAt ? new Date(item.createdAt) : null;
    const locked = Boolean(item.deviceLockEnabled);
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
        <View style={styles.lockRow}>
          <View style={[styles.lockBadge, locked ? styles.lockBadgeOn : styles.lockBadgeOff]}>
            <Smartphone size={14} color={locked ? '#c2410c' : '#6b7280'} />
            <Text style={[styles.lockBadgeText, locked ? styles.lockBadgeTextOn : null]}>
              {locked ? 'Locked to one device' : 'Device lock off'}
            </Text>
          </View>
          {locked ? (
            <TouchableOpacity
              style={styles.unlockBtn}
              onPress={() => void unlockDevice(item)}
              disabled={unlockingId === item.id}
            >
              {unlockingId === item.id ? (
                <ActivityIndicator size="small" color="#c2410c" />
              ) : (
                <Text style={styles.unlockText}>Unlock</Text>
              )}
            </TouchableOpacity>
          ) : null}
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
        <Text style={styles.subtitle}>Find an account and unlock it if it is locked to a device</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.searchWrap}>
          <Search size={16} color="#6b7280" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            placeholder="Search name or email"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={applyFilters}
          />
        </View>

        <View style={styles.filters}>
          <TouchableOpacity style={styles.inputWrap} activeOpacity={0.8} onPress={() => Platform.OS !== 'web' && setShowStartPicker(true)}>
            <Calendar size={16} color="#6b7280" />
            {Platform.OS === 'web' ? (
              <TextInput value={start} onChangeText={setStart} style={styles.input} placeholder="Start YYYY-MM-DD" />
            ) : (
              <Text style={styles.inputText}>{start || 'Start YYYY-MM-DD'}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.inputWrap} activeOpacity={0.8} onPress={() => Platform.OS !== 'web' && setShowEndPicker(true)}>
            <Calendar size={16} color="#6b7280" />
            {Platform.OS === 'web' ? (
              <TextInput value={end} onChangeText={setEnd} style={styles.input} placeholder="End YYYY-MM-DD" />
            ) : (
              <Text style={styles.inputText}>{end || 'End YYYY-MM-DD'}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyBtn} onPress={applyFilters} activeOpacity={0.8}>
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.lockedFilter, lockedOnly ? styles.lockedFilterOn : null]}
          onPress={toggleLockedOnly}
          activeOpacity={0.8}
        >
          <Smartphone size={16} color={lockedOnly ? '#9a3412' : '#6b7280'} />
          <Text style={[styles.lockedFilterText, lockedOnly ? styles.lockedFilterTextOn : null]}>
            Device locked only
          </Text>
        </TouchableOpacity>

        <Text style={styles.countText}>Users: {count}</Text>

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
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {lockedOnly
                  ? 'No device-locked accounts found.'
                  : 'No users in this range. Search by email or turn on Device locked only.'}
              </Text>
            }
            ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 12 }}><ActivityIndicator color="#16a34a" /></View> : null}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
      {Platform.OS !== 'web' && showStartPicker && (
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
      {Platform.OS !== 'web' && showEndPicker && (
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
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, flex: 1 },
  input: { flex: 1, fontSize: 14, color: '#111827' },
  inputText: { flex: 1, fontSize: 14, color: '#111827' },
  applyBtn: { backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  applyText: { color: '#ffffff', fontWeight: '800' },
  lockedFilter: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  lockedFilterOn: { backgroundColor: '#fff7ed', borderColor: '#fdba74' },
  lockedFilterText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  lockedFilterTextOn: { color: '#9a3412' },
  countText: { fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 8 },

  errorBox: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 10 },
  errorText: { color: '#b91c1c' },
  emptyText: { color: '#6b7280', fontSize: 14, lineHeight: 20, paddingVertical: 16 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },

  userCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#065f46', fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '800', color: '#111827' },
  email: { fontSize: 13, color: '#6b7280' },
  meta: { fontSize: 12, color: '#6b7280' },
  lockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  lockBadgeOn: { backgroundColor: '#fff7ed', borderColor: '#fdba74' },
  lockBadgeOff: { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' },
  lockBadgeText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  lockBadgeTextOn: { color: '#c2410c' },
  unlockBtn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minWidth: 84, alignItems: 'center' },
  unlockText: { color: '#c2410c', fontSize: 12, fontWeight: '800' },
});
