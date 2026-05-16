import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Search, SlidersHorizontal, ArrowLeft, ChevronRight, Phone } from 'lucide-react-native';
import { apiGet, resolveMediaUrl } from '../api/client';

type PublicField = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  pricePerHour?: number | null;
  images: { id: string; url: string; order: number }[];
  updatedAt: string;
};

type ApiResponse = {
  items: PublicField[];
  nextOffset: number;
  hasMore: boolean;
};

function hasDisplayablePhone(v: string | null | undefined): boolean {
  if (v == null) return false;
  return String(v).trim().length > 0;
}

/** Older backends omitted `phone` on the list route but still return it on `GET .../public/:id`. */
async function enrichMissingPhones(list: PublicField[]): Promise<PublicField[]> {
  const missing = list.filter((x) => !hasDisplayablePhone(x.phone));
  if (missing.length === 0) return list;
  const resolved = await Promise.all(
    missing.map(async (x) => {
      try {
        const detail = await apiGet<{ phone?: string | null }>(`/fields/kyc/public/${x.id}`);
        return { id: x.id, phone: detail.phone ?? null };
      } catch {
        return { id: x.id, phone: null as string | null };
      }
    })
  );
  const byId = new Map(resolved.map((r) => [r.id, r.phone] as const));
  return list.map((x) => {
    if (hasDisplayablePhone(x.phone)) return x;
    const p = byId.get(x.id);
    if (!hasDisplayablePhone(p)) return x;
    return { ...x, phone: p };
  });
}

type SortOption = 'recent' | 'price_asc' | 'price_desc' | 'shuffle' | 'nearest';

interface Props {
  navigation?: any;
}

export default function FindFieldScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('shuffle');
  // removed filters per request
  const [items, setItems] = useState<PublicField[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const limit = 12;
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (loading) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        const backendSort = sort === 'shuffle' ? 'recent' : sort; // shuffle on client
        params.set('sort', backendSort);
        params.set('limit', String(limit));
        params.set('offset', String(reset ? 0 : offset));
        // removed city/surfaceType/hasLights filters per request

        const res = await apiGet<ApiResponse>(`/fields/kyc/public?${params.toString()}`);
        let newItems = res.items;
        if (sort === 'shuffle') {
          // shuffle on client for a fun discovery feel
          newItems = [...newItems].sort(() => Math.random() - 0.5);
        }
        const withPhones = await enrichMissingPhones(newItems);
        setItems((prev) => (reset ? withPhones : [...prev, ...withPhones]));
        setOffset(res.nextOffset);
        setHasMore(res.hasMore);
      } catch (_) {
        // noop for now; could add toast
      } finally {
        setLoading(false);
        if (reset) setRefreshing(false);
      }
    },
    [query, sort, offset, loading]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setOffset(0);
    setHasMore(true);
    fetchPage(true);
  }, [fetchPage]);

  // initial load
  useEffect(() => {
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refetch when sort changes
  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    fetchPage(true);
  }, [sort]);

  // debounce query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      setHasMore(true);
      fetchPage(true);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const renderItem = useCallback(({ item }: { item: PublicField }) => {
    const img = resolveMediaUrl(item.images?.[0]?.url);
    const price = item.pricePerHour != null ? `GMD ${item.pricePerHour}/hour` : '—';
    const phoneRaw = hasDisplayablePhone(item.phone) ? String(item.phone).trim() : '';
    const telDigits = phoneRaw.replace(/[^\d+]/g, '');
    const openDialer = () => {
      if (!telDigits) return;
      Linking.openURL(`tel:${telDigits}`).catch(() => {});
    };
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation?.navigate('Booking', { fieldId: item.id })}>
        {img ? <Image source={{ uri: img }} style={styles.cardImage} /> : <View style={[styles.cardImage, styles.cardImagePlaceholder]} />}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardSub}>{item.address || item.city || ''}</Text>
          <View style={styles.cardPhoneRow}>
            <Phone size={18} color={phoneRaw ? '#16a34a' : '#9ca3af'} />
            {phoneRaw ? (
              <TouchableOpacity
                onPress={openDialer}
                activeOpacity={0.7}
                style={styles.cardPhoneTap}
                accessibilityRole="button"
                accessibilityLabel={`Call ${phoneRaw}`}
              >
                <Text style={styles.cardPhoneText}>{phoneRaw}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.cardPhoneMissing}>No phone number listed for this field</Text>
            )}
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.cardPrice}>{price}</Text>
            <ChevronRight size={18} color="#16a34a" />
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  const keyExtractor = useCallback((it: PublicField) => it.id, []);

  const Header = useMemo(() => (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack?.()}>
          <ArrowLeft size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Find a Field</Text>
        <View style={{ width: 36 }} />
      </View>
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Search size={20} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or address"
            placeholderTextColor="#9ca3af"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
        </View>
        <View style={styles.filtersContainer}>
          <SlidersHorizontal size={18} color="#16a34a" />
          <View style={styles.filtersChips}>
            <FilterChip label="Discover" active={sort === 'shuffle'} onPress={() => setSort('shuffle')} />
            <FilterChip label="Nearest" active={sort === 'nearest'} onPress={() => setSort('nearest')} />
            <FilterChip label="Price ↑" active={sort === 'price_asc'} onPress={() => setSort('price_asc')} />
            <FilterChip label="Price ↓" active={sort === 'price_desc'} onPress={() => setSort('price_desc')} />
          </View>
          {/* advanced filters removed per request */}
        </View>
      </View>
    </View>
  ), [navigation, query, sort]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.topSafe} />
      {Header}
      <FlatList
        contentContainerStyle={styles.listContent}
        style={styles.list}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!loading && hasMore) fetchPage(false);
        }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListFooterComponent={loading ? <ActivityIndicator style={styles.loader} color="#16a34a" /> : null}
        showsVerticalScrollIndicator={false}
      />
      <SafeAreaView edges={["bottom"]} style={styles.bottomSafe} />
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active ? styles.chipActive : undefined]}>
      <Text style={[styles.chipText, active ? styles.chipTextActive : undefined]}>{label}</Text>
    </TouchableOpacity>
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
  list: {
    backgroundColor: '#f9fafb',
  },
  listContent: {
    paddingBottom: 24,
    ...(Platform.OS === 'web'
      ? ({
          alignSelf: 'center',
          width: '100%',
          maxWidth: 640,
        } as any)
      : null),
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
    marginBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 0,
  },
  searchRow: {
    gap: 12,
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
  filtersContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filtersChips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
  },
  chipText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#166534',
  },
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardImage: {
    width: '100%',
    height: 160,
  },
  cardImagePlaceholder: {
    backgroundColor: '#e5e7eb',
  },
  cardBody: {
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  cardPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 4,
  },
  cardPhoneTap: {
    flex: 1,
    minWidth: 0,
  },
  cardPhoneText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  cardPhoneMissing: {
    flex: 1,
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#16a34a',
  },
  cardCta: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16a34a',
  },
  loader: {
    marginVertical: 16,
  },
  bottomSafe: {
    backgroundColor: '#f9fafb',
  },
});


