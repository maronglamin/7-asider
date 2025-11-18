import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput, RefreshControl, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ShieldCheck, Plus, Mail, UserMinus, MoreVertical } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, apiPatchAuth } from '../../api/client';

type User = {
  id: string;
  email: string;
  name?: string;
  supadmin?: boolean;
};

export default function AdminUsersScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<User[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [revokingEmail, setRevokingEmail] = useState<string | null>(null);
  const [openMenuEmail, setOpenMenuEmail] = useState<string | null>(null);

  const canAdd = useMemo(() => {
    const e = emailInput.trim();
    if (!e) return false;
    // quick email shape check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
    return !!token && !adding;
  }, [emailInput, token, adding]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      if (!refreshing) setLoading(true);
      const resp = await apiGetAuth<{ items: User[] }>(`/admin/users?supadmin=1`, token as string);
      setItems(resp.items || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load admins');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, refreshing]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  const grantSupadmin = async () => {
    if (!canAdd) return;
    try {
      setAdding(true);
      setError(null);
      const email = emailInput.trim();
      await apiPatchAuth(`/admin/users/supadmin`, { email, value: true }, token as string);
      setEmailInput('');
      await load();
      Alert.alert('Success', `${email} is now a super admin`);
    } catch (e: any) {
      setError(e?.message || 'Failed to grant super admin');
    } finally {
      setAdding(false);
    }
  };

  const revokeSupadmin = async (email: string, id: string) => {
    try {
      setRevokingEmail(email);
      setError(null);
      console.log('Revoking supadmin for', email, 'id=', id);
      // Prefer ID-based endpoint to avoid email matching issues
      await apiPatchAuth(`/admin/users/${id}/supadmin`, { value: false }, token as string);
      await load();
      Alert.alert('Updated', `${email} is no longer a super admin`);
    } catch (e: any) {
      setError(e?.message || 'Failed to revoke super admin');
      Alert.alert('Error', e?.message || 'Failed to revoke super admin');
    } finally {
      setRevokingEmail(null);
    }
  };

  const renderItem = ({ item }: { item: User }) => {
    const isSelf = user?.email && item.email && user.email.toLowerCase() === item.email.toLowerCase();
    return (
      <View style={[styles.userCard, openMenuEmail === item.email && styles.userCardActive]}>
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(item.name || item.email || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{item.name || 'Unnamed'}</Text>
            <Text style={styles.userEmail}>{item.email}</Text>
          </View>
          {!!item.supadmin && (
            <View style={styles.adminActions}>
              <View style={styles.badge}>
                <ShieldCheck size={14} color="#065f46" />
                <Text style={styles.badgeText}>Super Admin{isSelf ? ' • You' : ''}</Text>
              </View>
              {!isSelf && (
                <>
                  <TouchableOpacity
                    style={styles.kebabBtn}
                    onPress={() => setOpenMenuEmail(prev => (prev === item.email ? null : item.email))}
                    activeOpacity={0.7}
                  >
                    <MoreVertical size={18} color="#111827" />
                  </TouchableOpacity>
                  {openMenuEmail === item.email && (
                    <View style={styles.dropdown}>
                      <TouchableOpacity
                        style={styles.dropdownItem}
                        disabled={revokingEmail === item.email}
                        onPress={() => {
                          setOpenMenuEmail(null);
                          Alert.alert(
                            'Remove Super Admin',
                            `Are you sure you want to remove super admin from ${item.email}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Remove', style: 'destructive', onPress: () => revokeSupadmin(item.email, item.id) },
                            ]
                          );
                        }}
                      >
                        {revokingEmail === item.email ? (
                          <ActivityIndicator size="small" color="#991b1b" />
                        ) : (
                          <>
                            <UserMinus size={16} color="#991b1b" />
                            <Text style={styles.dropdownItemText}>Remove</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" backgroundColor="#16a34a" />
      {/* overlay removed; we close menus on scroll and toggle only */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <ShieldCheck size={22} color="#ffffff" />
          <Text style={styles.title}>Admin Users</Text>
        </View>
        <Text style={styles.subtitle}>Manage super admin accounts</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.contentInner}>
          <Text style={styles.sectionLabel}>Current Super Admins</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#16a34a" />
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(u) => u.id}
              renderItem={renderItem}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              onScrollBeginDrag={() => setOpenMenuEmail(null)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No super admins found.</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 24 }}
              removeClippedSubviews={false}
              CellRendererComponent={({ index, style, children, ...rest }) => {
                const cellItem = items[index];
                const isOpen = cellItem && openMenuEmail === cellItem.email;
                return (
                  <View
                    {...rest}
                    style={[style as any, { zIndex: isOpen ? 9999 : 0, elevation: isOpen ? 32 : 0, position: 'relative' }]}
                  >
                    {children}
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>

      <View style={[styles.addBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.addBarInner}>
          <View style={styles.inputWrap}>
            <Mail size={18} color="#6b7280" />
            <TextInput
              style={styles.input}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="Search email to grant admin"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
              onSubmitEditing={grantSupadmin}
            />
          </View>
          <TouchableOpacity
            style={[styles.addButton, { opacity: canAdd ? 1 : 0.5 }]}
            disabled={!canAdd}
            onPress={grantSupadmin}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#ffffff" />
            <Text style={styles.addButtonText}>{adding ? 'Adding...' : 'Add Admin'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', position: 'relative' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#dcfce7' },
  content: { flex: 1, padding: 16, backgroundColor: '#f9fafb' },
  contentInner: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: 10 },

  userCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, overflow: 'visible', position: 'relative' },
  userCardActive: { zIndex: 4000, elevation: 24 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#065f46', fontWeight: '800' },
  userName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  userEmail: { fontSize: 13, color: '#6b7280' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#d1fae5', borderRadius: 999 },
  badgeText: { color: '#065f46', fontSize: 12, fontWeight: '700' },
  adminActions: { flexDirection: 'row', alignItems: 'center', gap: 4, position: 'relative', zIndex: 2000 },
  kebabBtn: { padding: 6, borderRadius: 8 },
  dropdown: { position: 'absolute', top: 28, right: 0, width: 180, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 20, zIndex: 3000, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  dropdownItemText: { color: '#111827', fontSize: 14, fontWeight: '600' },

  errorBox: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 10 },
  errorText: { color: '#b91c1c' },
  loadingBox: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#6b7280', fontSize: 14 },

  addBar: { paddingHorizontal: 16, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  addBarInner: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, marginTop: 8, marginBottom: 10 },
  input: { flex: 1, fontSize: 14, color: '#111827' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 10 },
  addButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});


