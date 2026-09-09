import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, FlatList, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, useWindowDimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../context/AuthContext';
import { apiDeleteAuth, apiGetAuth, apiPatchAuth, apiPostAuth, resolveMediaUrl } from '../../api/client';
import { ChevronLeft } from 'lucide-react-native';

type RouteParams = { route: { params: { id: string } }, navigation: any };

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
  createdAt?: string;
  updatedAt?: string;
  role?: 'OWNER' | 'MANAGER';
  isOwner?: boolean;
};

type ManagerRow = { id: string; userId: string; name?: string | null; email: string; createdAt: string };
type PendingInviteRow = { id: string; email: string; expiresAt: string; createdAt: string };

async function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.confirm(`${title}\n\n${message}`);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ]);
  });
}

export default function FieldDetailScreen({ route, navigation }: any) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Platform.OS === 'web' ? Math.min(windowWidth, 1180) : windowWidth;
  const { token } = useAuth();
  const id = route.params.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<KycRecord | null>(null);
  const [price, setPrice] = useState<string>('');
  const [index, setIndex] = useState(0);
  const sliderRef = useRef<FlatList<KycImage>>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([]);
  const [managersError, setManagersError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const isOwner = Boolean(item?.isOwner || item?.role === 'OWNER');

  const loadManagers = async () => {
    if (!token) return;
    try {
      setManagersError(null);
      const res = await apiGetAuth<{ managers: ManagerRow[]; pendingInvites: PendingInviteRow[] }>(
        `/fields/kyc/${id}/managers`,
        token as string,
      );
      setManagers(res.managers || []);
      setPendingInvites(res.pendingInvites || []);
    } catch (e: any) {
      setManagersError(e?.message || 'Failed to load managers');
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const data = await apiGetAuth<KycRecord>(`/fields/kyc/${id}`, token as string);
      setItem(data);
      setPrice(data.pricePerHour != null ? String(Number(data.pricePerHour).toFixed(2)) : '');
      setError(null);
      if (data.isOwner || data.role === 'OWNER') {
        await loadManagers();
      } else {
        setManagers([]);
        setPendingInvites([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await load();
    })();
    return () => { mounted = false; };
  }, [id, token]);

  const statusStyle = useMemo(() => {
    const base = { backgroundColor: '#e5e7eb', color: '#111827' } as const;
    if (!item) return base;
    const statusNorm = String(item.status || '').toUpperCase();
    switch (statusNorm) {
      case 'PENDING':
        return { backgroundColor: '#fef3c7', color: '#92400e' } as const;
      case 'APPROVED':
        return { backgroundColor: '#dcfce7', color: '#065f46' } as const;
      case 'REJECTED':
        return { backgroundColor: '#fee2e2', color: '#991b1b' } as const;
      case 'SUSPENDED':
        return { backgroundColor: '#e5e7eb', color: '#374151' } as const;
      default:
        return base;
    }
  }, [item]);

  const savePrice = async () => {
    try {
      setSaving(true);
      const priceNum = Number(price);
      if (!isFinite(priceNum) || priceNum < 0) {
        Alert.alert('Invalid price', 'Enter a valid non-negative price');
        return;
      }
      await apiPatchAuth(`/fields/kyc/${id}/price`, { pricePerHour: priceNum }, token as string);
      Alert.alert('Saved', 'Price updated');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update price');
    } finally {
      setSaving(false);
    }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim();
    if (!email || inviting || !token) return;
    try {
      setInviting(true);
      await apiPostAuth(`/fields/kyc/${id}/managers/invite`, { email }, token as string);
      setInviteEmail('');
      await loadManagers();
      Alert.alert('Invite sent', `We emailed ${email}. They can accept from the link.`);
    } catch (e: any) {
      Alert.alert('Could not invite', e?.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const removeManager = async (row: ManagerRow) => {
    if (!token) return;
    const ok = await confirmAction('Remove manager', `Remove ${row.email} from this field?`);
    if (!ok) return;
    try {
      setBusyUserId(row.userId);
      await apiDeleteAuth(`/fields/kyc/${id}/managers/${encodeURIComponent(row.userId)}`, token as string);
      await loadManagers();
    } catch (e: any) {
      Alert.alert('Could not remove', e?.message || 'Failed to remove manager');
    } finally {
      setBusyUserId(null);
    }
  };

  const cancelInvite = async (row: PendingInviteRow) => {
    if (!token) return;
    const ok = await confirmAction('Cancel invite', `Cancel the invite to ${row.email}?`);
    if (!ok) return;
    try {
      setBusyUserId(row.id);
      await apiPostAuth(`/fields/kyc/${id}/managers/invites/${encodeURIComponent(row.id)}/revoke`, {}, token as string);
      await loadManagers();
    } catch (e: any) {
      Alert.alert('Could not cancel', e?.message || 'Failed to cancel invite');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safeTop} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.title}>{item?.name || 'Field Detail'}</Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={[styles.center, { flex: 1 }] }>
          <ActivityIndicator color="#16a34a" />
        </View>
      ) : error ? (
        <View style={[styles.center, { flex: 1, padding: 16 }] }>
          <Text style={{ color: '#991b1b' }}>{error}</Text>
        </View>
      ) : !item ? (
        <View style={[styles.center, { flex: 1 }] }>
          <Text>Field not found</Text>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Image carousel */}
          <View style={[styles.carouselContainer, { width, height: width * 0.6 }]}>
            <FlatList
              ref={sliderRef}
              data={item.images}
              keyExtractor={(img) => img.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                setIndex(newIndex);
              }}
              renderItem={({ item: img }) => (
                <Image source={{ uri: resolveMediaUrl(img.url) || undefined }} style={[styles.carouselImage, { width, height: width * 0.6 }]} />
              )}
            />
            {item.images.length > 1 ? (
              <View style={styles.dotsRow}>
                {item.images.map((_, i) => (
                  <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
                ))}
              </View>
            ) : null}
            <View style={styles.statusPill}>
              <Text style={[styles.statusText, { color: statusStyle.color }]}>{String(item.status || '').toUpperCase()}</Text>
            </View>
          </View>

          {/* Details */}
          <View style={styles.content}>
            {(item.city || item.address) ? (
              <View style={styles.row}>
                <Text style={styles.label}>Location</Text>
                <Text style={styles.value}>{[item.city, item.address].filter(Boolean).join(' • ')}</Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.label}>Surface</Text>
              <Text style={styles.value}>{item.surfaceType || '-'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Size</Text>
              <Text style={styles.value}>{item.size || '-'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Lights</Text>
              <Text style={styles.value}>{item.hasLights ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Description</Text>
              <Text style={styles.description}>{item.description || '-'}</Text>
            </View>

            {item.status === 'REJECTED' && item.rejectionReason ? (
              <View style={styles.block}>
                <Text style={[styles.blockLabel, { color: '#991b1b' }]}>Rejected</Text>
                <Text style={[styles.description, { color: '#991b1b' }]}>{item.rejectionReason}</Text>
              </View>
            ) : null}
            {item.status === 'SUSPENDED' && item.suspensionReason ? (
              <View style={styles.block}>
                <Text style={[styles.blockLabel, { color: '#991b1b' }]}>Suspended</Text>
                <Text style={[styles.description, { color: '#991b1b' }]}>{item.suspensionReason}</Text>
              </View>
            ) : null}

            {/* Price update */}
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Price per hour (GMD)</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                placeholder="e.g., 600.00"
                style={styles.input}
              />
              <TouchableOpacity onPress={savePrice} disabled={saving} style={[styles.saveBtnBlock, saving && { opacity: 0.6 }]}>
                <Text style={styles.saveText}>{saving ? 'Updating...' : 'Update'}</Text>
              </TouchableOpacity>
            </View>

            {item.role === 'MANAGER' ? (
              <Text style={styles.managerNote}>You manage this field. Payments still go to the owner’s directPay account.</Text>
            ) : null}

            {isOwner ? (
              <View style={styles.block}>
                <Text style={styles.blockLabel}>Managers</Text>
                <Text style={styles.managerHelp}>Invite someone to run bookings, check-in, and price for this field.</Text>
                <TextInput
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="manager@email.com"
                  placeholderTextColor="#9ca3af"
                  style={styles.input}
                />
                <TouchableOpacity onPress={() => void sendInvite()} disabled={inviting} style={[styles.saveBtnBlock, inviting && { opacity: 0.6 }]}>
                  <Text style={styles.saveText}>{inviting ? 'Sending...' : 'Send invite'}</Text>
                </TouchableOpacity>
                {managersError ? <Text style={[styles.description, { color: '#991b1b', marginTop: 8 }]}>{managersError}</Text> : null}
                {managers.map((row) => (
                  <View key={row.userId} style={styles.managerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.managerName}>{row.name || row.email}</Text>
                      {row.name ? <Text style={styles.managerEmail}>{row.email}</Text> : null}
                    </View>
                    <TouchableOpacity onPress={() => void removeManager(row)} disabled={busyUserId === row.userId}>
                      <Text style={styles.removeText}>{busyUserId === row.userId ? '...' : 'Remove'}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {pendingInvites.map((row) => (
                  <View key={row.id} style={styles.managerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.managerName}>{row.email}</Text>
                      <Text style={styles.managerEmail}>Invite pending</Text>
                    </View>
                    <TouchableOpacity onPress={() => void cancelInvite(row)} disabled={busyUserId === row.id}>
                      <Text style={styles.removeText}>{busyUserId === row.id ? '...' : 'Cancel'}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          </ScrollView>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeTop: {
    backgroundColor: '#16a34a',
  },
  header: {
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 10 : 0,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselContainer: {
    backgroundColor: '#000',
    position: 'relative',
  },
  carouselImage: {
    resizeMode: 'cover',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
  },
  statusPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  content: {
    padding: 16,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '700',
  },
  value: {
    fontSize: 14,
    color: '#111827',
    marginLeft: 12,
    flexShrink: 1,
    textAlign: 'right',
  },
  block: {
    marginTop: 12,
  },
  blockLabel: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '700',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: '#374151',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  saveBtnBlock: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  saveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  managerNote: {
    marginTop: 16,
    fontSize: 13,
    color: '#166534',
    lineHeight: 18,
  },
  managerHelp: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 18,
  },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  managerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  managerEmail: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  removeText: {
    color: '#b91c1c',
    fontWeight: '700',
  },
});


