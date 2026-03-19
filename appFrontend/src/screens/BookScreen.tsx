import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  TextInput,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Map, TrendingUp, Plus, CheckCircle, Upload as UploadIcon } from 'lucide-react-native';
import { FieldCard } from '../components/FieldCard';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth, apiPostMultipartAuth, resolveMediaUrl } from '../api/client';
import * as ImagePicker from 'expo-image-picker';
import { getUploadableImageUri } from '../utils/imageUpload';

interface BookScreenProps {
  navigation?: any;
}

export function BookScreen({ navigation }: BookScreenProps) {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [showComing, setShowComing] = useState(false);
  const [payVisible, setPayVisible] = useState(false);
  const [payBooking, setPayBooking] = useState<any | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ownerBanks, setOwnerBanks] = useState<any[]>([]);
  const [ownerWallets, setOwnerWallets] = useState<any[]>([]);
  const [loadingOwnerPayouts, setLoadingOwnerPayouts] = useState(false);

  const load = async (reset: boolean) => {
    if (!token || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '10');
      // no filters
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      const res = await apiGetAuth<{ items: any[]; nextCursor: string | null }>(`/bookings/mine?${params.toString()}`, token);
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setNextCursor(res.nextCursor);
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
      if (reset) setRefreshing(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // no search/filter

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#16a34a" />
      <SafeAreaView edges={["top"]} style={styles.topSafe} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Book a Field</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        onScroll={({ nativeEvent }) => {
          const paddingToBottom = 200;
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const closeToBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
          if (closeToBottom && nextCursor && !loading && !loadingMore) {
            setLoadingMore(true);
            load(false).finally(() => setLoadingMore(false));
          }
        }}
        scrollEventThrottle={16}
      >
        {/* Primary Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.primaryAction} onPress={() => navigation?.navigate('FindField')}>
            <Map size={20} color="#ffffff" />
            <Text style={styles.primaryActionText}>Find Fields Near Me</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.secondaryAction} onPress={() => setShowComing(true)}>
            <TrendingUp size={20} color="#16a34a" />
            <Text style={styles.secondaryActionText}>Join Available Matches</Text>
          </TouchableOpacity>
        </View>

        {/* Recently Booked */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recently Booked</Text>
          </View>

          <View style={styles.fieldsList}>
            {items.map((b) => {
              const field = b.field;
              const imgRel = field?.images?.[0]?.url;
              const image = resolveMediaUrl(imgRel) || 'https://via.placeholder.com/400x200?text=Field';
              const lastPlayed = b.startAt || b.createdAt;
              const price = field?.pricePerHour != null ? `GMD ${Number(field.pricePerHour)}/hour` : '—';
              const card = {
                id: b.id,
                name: field?.name || 'Field',
                image,
                distance: field?.address || field?.city || '',
                lastPlayed,
                rating: 4.8,
                price,
              };
              return (
                <View key={b.id}>
                  <FieldCard
                    field={card}
                    showRating={false}
                    onSelect={() => navigation?.navigate('CustomerBookedDetails', { booking: b })}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6 }}>
                    {String(b.paymentStatus || '').toUpperCase() === 'PAID' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                        <CheckCircle size={16} color="#166534" />
                        <Text style={{ color: '#166534', fontWeight: '800' }}>Paid</Text>
                      </View>
                    ) : !b?.hasReceipt ? (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
                    onPress={async () => {
                      setPayBooking(b);
                      setReceiptUri(null);
                      setOwnerBanks([]);
                      setOwnerWallets([]);
                      if (b?.field?.userId && token) {
                        try {
                          setLoadingOwnerPayouts(true);
                          const resp = await apiGetAuth<{ banks: any[]; wallets: any[] }>(`/payouts/owner/${b.field.userId}`, token as any);
                          setOwnerBanks(resp?.banks || []);
                          setOwnerWallets(resp?.wallets || []);
                        } catch (_) {
                          setOwnerBanks([]);
                          setOwnerWallets([]);
                        } finally {
                          setLoadingOwnerPayouts(false);
                        }
                      }
                      setPayVisible(true);
                    }}
                        activeOpacity={0.8}
                      >
                        <UploadIcon size={16} color="#ffffff" />
                        <Text style={{ color: '#ffffff', fontWeight: '800' }}>Pay</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {(!loading && items.length === 0) && (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <Text style={styles.emptyText}>You have no bookings yet.</Text>
                <TouchableOpacity style={styles.emptyCta} onPress={() => navigation?.navigate('FindField')}>
                  <Plus size={18} color="#ffffff" />
                  <Text style={styles.emptyCtaText}>Book now</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* Infinite scroll handles loading more automatically */}
          </View>
        </View>
      </ScrollView>
      {/* Coming Soon Bottom Sheet */}
      <Modal visible={showComing} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setShowComing(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Coming Soon</Text>
            <Text style={styles.sheetSubtitle}>
              Thanks for your interest — this feature is on the way.{"\n"}
              Soon you’ll browse nearby matches, see player levels, and join in one tap.
            </Text>
            <Text style={styles.sheetNote}>We’ll let you know as soon as it’s ready.</Text>
            <TouchableOpacity onPress={() => setShowComing(false)} style={styles.sheetPrimary}>
              <Text style={styles.sheetPrimaryText}>Got it</Text>
            </TouchableOpacity>
            <SafeAreaView edges={["bottom"]} />
          </View>
        </View>
      </Modal>
      {/* Pay bottom sheet */}
      <Modal visible={payVisible} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setPayVisible(false)} />
          <View style={[styles.sheetContainer, { height: '95%' }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Pay Field Owner</Text>
            <Text style={styles.sheetSubtitle}>Use one of the owner's accounts below, then upload your receipt for confirmation.</Text>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 6 }}>Owner Accounts</Text>
              {loadingOwnerPayouts ? (
                <Text style={{ color: '#6b7280' }}>Loading accounts...</Text>
              ) : (
                <>
                  {(ownerBanks?.length || 0) > 0 ? (
                    <View style={{ gap: 6, marginBottom: 8 }}>
                      {ownerBanks.map((b, idx) => (
                        <View key={`${b.id}-${idx}`} style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontWeight: '800', color: '#111827' }}>{b.bankName}</Text>
                          <Text style={{ color: '#374151' }}>{b.accountName}</Text>
                          <Text style={{ color: '#374151' }}>{b.accountNumber}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {(ownerWallets?.length || 0) > 0 ? (
                    <View style={{ gap: 6, marginBottom: 8 }}>
                      {ownerWallets.map((w, idx) => (
                        <View key={`${w.id}-${idx}`} style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontWeight: '800', color: '#111827' }}>{w.company}</Text>
                          <Text style={{ color: '#374151' }}>{w.walletNumber}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {(ownerBanks?.length || 0) === 0 && (ownerWallets?.length || 0) === 0 ? (
                    <Text style={{ color: '#6b7280' }}>No payout accounts available. Contact the field owner.</Text>
                  ) : null}
                </>
              )}
            </ScrollView>
            <View style={{ paddingHorizontal: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
              <Text style={[styles.sheetTitle, { textAlign: 'left', marginBottom: 4 }]}>Upload Payment Receipt</Text>
              <Text style={[styles.sheetSubtitle, { textAlign: 'left', marginBottom: 8 }]}>Attach a clear image of your payment receipt. The field owner will review and confirm.</Text>
              {!!receiptUri ? (
                <Image source={{ uri: receiptUri }} style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: '#f3f4f6' }} />
              ) : (
                <View style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#6b7280' }}>No image selected</Text>
                </View>
              )}
              <View style={{ gap: 10, marginTop: 10, marginBottom: 6 }}>
                <TouchableOpacity
                  style={styles.sheetPrimary}
                  onPress={async () => {
                    try {
                      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                      if (perm.status !== 'granted') {
                        Alert.alert('Photo access needed', 'To upload your payment receipt, allow photo access. You can enable it in Settings if you change your mind.');
                        return;
                      }
                      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, allowsEditing: true, aspect: [4,3] });
                      if (!res.canceled && res.assets && res.assets[0]?.uri) {
                        setReceiptUri(res.assets[0].uri);
                      }
                    } catch (e: any) {
                      Alert.alert('Could not open gallery', e?.message || 'Failed to pick an image. Try again.');
                    }
                  }}
                >
                  <Text style={styles.sheetPrimaryText}>{receiptUri ? 'Change Image' : 'Choose Image'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetPrimary, { backgroundColor: '#16a34a', opacity: receiptUri && !uploading ? 1 : 0.6 }]}
                  disabled={!receiptUri || uploading}
                  onPress={async () => {
                    if (!payBooking || !receiptUri) return;
                    try {
                      setUploading(true);
                      const uploadUri = await getUploadableImageUri(receiptUri);
                      const form = new FormData();
                      // @ts-ignore: RN FormData file
                      form.append('receipt', { uri: uploadUri, name: 'receipt.jpg', type: 'image/jpeg' });
                      await apiPostMultipartAuth(`/bookings/${payBooking.id}/receipt`, form as any, token as any);
                      setUploading(false);
                      setPayVisible(false);
                      setItems((prev) => prev.map((it) => it.id === payBooking.id ? { ...it, hasReceipt: true } : it));
                      setReceiptUri(null);
                    } catch (e: any) {
                      setUploading(false);
                      Alert.alert('Upload failed', e?.message || 'Could not upload receipt. Please try again.');
                    }
                  }}
                >
                  <Text style={styles.sheetPrimaryText}>{uploading ? 'Uploading...' : 'Submit Receipt'}</Text>
                </TouchableOpacity>
              </View>
              <SafeAreaView edges={["bottom"]} />
            </View>
          </View>
        </View>
      </Modal>
      <SafeAreaView edges={["bottom"]} style={styles.bottomSafe} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  topSafe: {
    backgroundColor: '#16a34a',
  },
  header: {
    backgroundColor: '#f9fafb',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 30 : 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  searchContainer: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    top: 12,
    zIndex: 1,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    paddingLeft: 44,
    paddingRight: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    color: '#111827',
  },
  content: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  bottomSafe: {
    backgroundColor: '#f9fafb',
  },
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  recentFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  recentSearchWrap: {
    flex: 1,
    position: 'relative',
  },
  recentSearchIcon: {
    position: 'absolute',
    left: 10,
    top: 10,
  },
  recentSearch: {
    backgroundColor: '#ffffff',
    paddingLeft: 36,
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    color: '#111827',
  },
  monthInput: {
    width: 100,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    color: '#111827',
  },
  primaryAction: {
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryAction: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  secondaryActionText: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16a34a',
  },
  fieldsList: {
    gap: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
  },
  loadMore: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  loadMoreText: {
    color: '#111827',
    fontWeight: '600',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyCtaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  sheetNote: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 16,
  },
  sheetPrimary: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetPrimaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});