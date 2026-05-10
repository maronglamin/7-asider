import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, ActivityIndicator, RefreshControl, FlatList, ListRenderItem } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, resolveMediaUrl } from '../../api/client';
import { ChevronLeft, MapPin, Clock, Plus } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

type KycImage = { id: string; url: string; order: number };
type KycRecord = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  surfaceType?: string | null;
  size?: string | null;
  pricePerHour?: number | string | null;
  status: string; // accept any and normalize to support case differences
  rejectionReason?: string | null;
  suspensionReason?: string | null;
  images: KycImage[];
  createdAt?: string;
  updatedAt?: string;
};

export default function MyFieldsScreen({ navigation }: any) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<KycRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const resp = await apiGetAuth<{ items: KycRecord[]; nextCursor: string | null }>(`/fields/kyc/mine?limit=10&ts=${Date.now()}`, token as string);
      setItems(resp.items || []);
      setNextCursor(resp.nextCursor || null);
      setError(null);
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
    return () => {
      mounted = false;
    };
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      // Refresh when screen gains focus (ensures status changes are visible)
      load();
      return () => {};
    }, [token])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const resp = await apiGetAuth<{ items: KycRecord[]; nextCursor: string | null }>(`/fields/kyc/mine?limit=10&cursor=${encodeURIComponent(nextCursor)}&ts=${Date.now()}`, token as string);
      setItems((prev) => [...prev, ...(resp.items || [])]);
      setNextCursor(resp.nextCursor || null);
    } catch (e: any) {
      // optionally set an error banner for load more failures
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, token]);

  const renderItem: ListRenderItem<KycRecord> = ({ item }) => {
    const rawStatus = String(item.status ?? '').trim();
    const statusNorm = rawStatus.toUpperCase();
    const statusLabel = statusNorm || 'UNKNOWN';
    const sStyle = (() => {
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
          return { backgroundColor: '#e5e7eb', color: '#111827' } as const;
      }
    })();

    const formatPrice = (v?: number | string | null) => {
      const num = Number(v);
      if (!isFinite(num)) return null;
      const str = Number.isInteger(num) ? num.toFixed(0) : num.toFixed(2);
      return `GMD ${str}/hr`;
    };

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => navigation.navigate('FieldDetail', { id: item.id })}
        style={styles.fieldCardContainer}
      >
        <View style={styles.fieldImageContainer}>
          {(() => {
            const img = (item.images && item.images.length > 0) ? item.images[0] : null;
            const imageUri = resolveMediaUrl(img?.url);
            return imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.fieldImage} />
            ) : (
              <View style={[styles.fieldImage, styles.imagePlaceholder]} />
            );
          })()}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: sStyle.backgroundColor, borderColor: sStyle.color }]}>
              <Text style={[styles.badgeText, { color: sStyle.color }]} numberOfLines={1} ellipsizeMode="tail">{statusLabel}</Text>
            </View>
          </View>
          {formatPrice(item.pricePerHour) ? (
            <View style={styles.priceBadge}>
              <Text style={styles.priceBadgeText} numberOfLines={1}>{formatPrice(item.pricePerHour)}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.fieldContent}>
          <Text style={styles.fieldName} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
          {(item.city || item.address) ? (
            <View style={styles.infoRow}>
              <MapPin size={16} color="#6b7280" />
              <Text style={styles.infoText} numberOfLines={1} ellipsizeMode="tail">{[item.address, item.city].filter(Boolean).join(' • ')}</Text>
            </View>
          ) : null}
          <View style={styles.metaGrid}>
            {item.surfaceType ? (
              <Text style={styles.metaText} numberOfLines={1} ellipsizeMode="tail">Surface: {item.surfaceType}</Text>
            ) : null}
            {item.size ? (
              <Text style={styles.metaText} numberOfLines={1} ellipsizeMode="tail">Size: {item.size}</Text>
            ) : null}
          </View>
          {item.status === 'REJECTED' && item.rejectionReason ? (
            <Text style={styles.reasonText} numberOfLines={3} ellipsizeMode="tail">Reason: {item.rejectionReason}</Text>
          ) : null}
          {item.status === 'SUSPENDED' && item.suspensionReason ? (
            <Text style={styles.reasonText} numberOfLines={3} ellipsizeMode="tail">Suspended: {item.suspensionReason}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  // Per-item status style is computed in renderItem

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeTop} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <ChevronLeft size={24} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.title}>My Fields</Text>
            <TouchableOpacity onPress={() => navigation.navigate('RegisterField')} style={styles.addBtn}>
              <Plus size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Your submitted fields and status</Text>
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.safeBottom} edges={["bottom"]}>
        {loading ? (
          <View style={[styles.content, styles.center]}>
            <ActivityIndicator color="#16a34a" />
          </View>
        ) : error ? (
          <View style={[styles.content, styles.contentContainer]}>
          <View style={styles.card}>
            <Text style={styles.reasonText}>{error}</Text>
            </View>
          </View>
        ) : items.length === 0 ? (
          <View style={[styles.content, styles.contentContainer]}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🏟️</Text>
            <Text style={styles.emptyTitle}>No field added yet</Text>
            <Text style={styles.emptyText}>Add your field to start receiving bookings.</Text>
            <TouchableOpacity onPress={() => navigation.navigate('RegisterField')} style={styles.emptyCta}>
              <Text style={styles.emptyCtaText}>Register Field</Text>
            </TouchableOpacity>
            </View>
          </View>
        ) : (
          <FlatList
            style={[styles.content, Platform.OS === 'web' ? { minHeight: 0 } : null]}
            contentContainerStyle={styles.contentContainer}
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            onEndReachedThreshold={0.5}
            onEndReached={() => loadMore()}
            ListFooterComponent={() => (
              loadingMore ? (
                <View style={{ padding: 12, alignItems: 'center' }}>
                  <ActivityIndicator color="#16a34a" />
                </View>
              ) : null
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" colors={["#16a34a"]} />}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  safeTop: {
    backgroundColor: '#16a34a',
  },
  safeBottom: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 30 : 16,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: '#dcfce7',
    fontSize: 14,
    marginTop: 4,
  },
  content: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  center: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyCta: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyCtaText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fieldName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  mutedText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 13,
    color: '#991b1b',
    marginBottom: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  fieldCardContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    // ensure internal layout has room
    marginBottom: 2,
  },
  fieldImageContainer: {
    position: 'relative',
    height: 160,
  },
  fieldImage: {
    width: '100%',
    height: '100%',
  },
  badgeRow: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
    borderWidth: 1,
  },
  priceBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priceBadgeText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
  },
  imagePlaceholder: {
    backgroundColor: '#e5e7eb',
  },
  fieldContent: {
    padding: 16,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    flexShrink: 1,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#6b7280',
    flexShrink: 1,
    maxWidth: '100%',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
  },
  bookButton: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  bookButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  ctaRow: {
    paddingTop: 4,
  },
  primaryBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});


