import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MapPin } from 'lucide-react-native';
import { apiGet, resolveMediaUrl } from '../api/client';
import { tryOpenNativeAppForInvite } from '../lib/native-invite-handoff';
import { publicAppPath } from '../lib/app-public-url';

const APP_LOGO = require('../../assets/icon.png');

type PublicField = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  surfaceType?: string | null;
  size?: string | null;
  hasLights?: boolean;
  pricePerHour?: number | null;
  description?: string | null;
  images?: Array<{ id: string; url: string; order: number }>;
};

function buildCopy(field: PublicField) {
  const location = [field.address, field.city].filter(Boolean).join(', ');
  return {
    headline: 'Find, book & play 7-a-side',
    intro:
      'Busy running a turf? Invite your field manager and stay in control from the app.',
    body:
      'Discover nearby football pitches, reserve open slots, and jump into 7-a-side matches—all in one place. Whether you’re organising with friends or joining an open game, 7-aside makes it simple to find venues, manage bookings, and get on the pitch faster.',
    closer: 'Play more. Plan less. Enjoy the game anytime.',
    featured: location ? `${field.name} — ${location}` : field.name,
  };
}

export default function FieldAdvertScreen({ route, navigation }: { route?: any; navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const fieldId = String(route?.params?.fieldId || '').trim();
  const [field, setField] = useState<PublicField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fieldId) {
      setError('Missing field');
      setLoading(false);
      return;
    }

    // Native / installed app: go straight to booking for this pitch.
    if (Platform.OS !== 'web') {
      navigation?.replace('Booking', { fieldId });
      return;
    }

    tryOpenNativeAppForInvite(`/field/${fieldId}`);

    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<PublicField>(`/fields/kyc/public/${encodeURIComponent(fieldId)}`);
        if (!cancelled) setField(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Field not found');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fieldId, navigation]);

  const hero = useMemo(() => {
    const url = field?.images?.[0]?.url;
    return resolveMediaUrl(url) || null;
  }, [field]);

  const copy = field ? buildCopy(field) : null;
  const location = field
    ? [field.address, field.city].filter(Boolean).join(', ') || 'Location on request'
    : '';
  const price =
    field?.pricePerHour != null && Number.isFinite(Number(field.pricePerHour))
      ? `${Number(field.pricePerHour).toLocaleString()} GMD / hr`
      : null;

  const book = () => {
    navigation?.navigate('Booking', { fieldId });
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16a34a" />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16a34a" />
        <Text style={styles.muted}>Loading pitch…</Text>
      </View>
    );
  }

  if (error || !field || !copy) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.error}>{error || 'Field not available'}</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation?.navigate('Main')}>
            <Text style={styles.secondaryBtnText}>Go home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const heroHeight = Math.min(360, Math.max(240, width * 0.72));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <View style={[styles.hero, { height: heroHeight }]}>
          {hero ? (
            <Image source={{ uri: hero }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.heroFallback]} />
          )}
          <View style={styles.heroShade} />
          <View style={[styles.heroTop, { paddingTop: insets.top + 12 }]}>
            <Image source={APP_LOGO} style={styles.logo} />
            <Text style={styles.pill}>Pitch advert</Text>
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.kicker}>Featured pitch</Text>
            <Text style={styles.fieldName}>{field.name}</Text>
            <View style={styles.locationRow}>
              <MapPin size={16} color="#86efac" />
              <Text style={styles.locationText}>{location}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.chips}>
            {!!field.surfaceType && <Text style={styles.chip}>{field.surfaceType}</Text>}
            {!!field.size && <Text style={styles.chip}>{field.size}</Text>}
            {!!field.hasLights && <Text style={styles.chip}>Floodlights</Text>}
            {!!price && <Text style={styles.chip}>{price}</Text>}
          </View>

          <Text style={styles.headline}>{copy.headline}</Text>
          <Text style={styles.intro}>{copy.intro}</Text>
          <Text style={styles.text}>{copy.body}</Text>
          <Text style={styles.closer}>{copy.closer}</Text>

          <View style={styles.featuredCard}>
            <Text style={styles.featuredLabel}>Book this venue</Text>
            <Text style={styles.featuredName}>{copy.featured}</Text>
            <Text style={styles.featuredHint}>
              Open this link from social or a QR code to reserve {field.name} in seconds.
            </Text>
            <Text style={styles.linkHint}>{publicAppPath(`/field/${field.id}`)}</Text>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={book} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>Book this pitch</Text>
          </TouchableOpacity>

          <View style={styles.footerBrand}>
            <Image source={APP_LOGO} style={styles.footerLogo} />
            <Text style={styles.footerText}>7-aside · Find, book & play</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#fff' },
  muted: { color: '#64748b', fontSize: 14 },
  error: { color: '#b91c1c', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  hero: { width: '100%', backgroundColor: '#052e16' },
  heroFallback: {
    backgroundColor: '#14532d',
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.45)',
  },
  heroTop: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#fff' },
  pill: {
    color: '#ecfdf5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroBottom: { position: 'absolute', left: 16, right: 16, bottom: 18 },
  kicker: { color: '#bbf7d0', fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 4 },
  fieldName: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  locationText: { flex: 1, color: '#e2e8f0', fontSize: 14, lineHeight: 20 },
  body: { padding: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    backgroundColor: '#ecfdf5',
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  headline: { fontSize: 24, fontWeight: '900', color: '#0f172a', letterSpacing: -0.4, marginBottom: 10 },
  intro: { fontSize: 15, fontWeight: '600', color: '#14532d', lineHeight: 22, marginBottom: 10 },
  text: { fontSize: 14, color: '#475569', lineHeight: 22, marginBottom: 10 },
  closer: { fontSize: 14, fontWeight: '700', color: '#0f172a', lineHeight: 20, marginBottom: 18 },
  featuredCard: {
    borderWidth: 1,
    borderColor: '#dcfce7',
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  featuredLabel: { fontSize: 11, fontWeight: '800', color: '#16a34a', letterSpacing: 1, textTransform: 'uppercase' },
  featuredName: { marginTop: 4, fontSize: 16, fontWeight: '800', color: '#0f172a' },
  featuredHint: { marginTop: 6, fontSize: 13, color: '#64748b', lineHeight: 18 },
  linkHint: { marginTop: 8, fontSize: 11, color: '#94a3b8', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  primaryBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryBtnText: { color: '#0f172a', fontWeight: '700' },
  footerBrand: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerLogo: { width: 22, height: 22, borderRadius: 6 },
  footerText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
});
