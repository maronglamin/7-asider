import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Plus } from 'lucide-react-native';
import { MatchCard } from '../components/MatchCard';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth } from '../api/client';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('upcoming');
  const { token } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const navigation = useNavigation<any>();

  const reload = React.useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const res = await apiGetAuth<{ items: any[]; nextCursor: string | null }>(`/bookings/mine?limit=20`, token);
      setBookings(res.items || []);
      setNextCursor(res.nextCursor || null);
    } catch (_e) {
      setBookings([]);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) return;
      setLoading(true);
      try {
        // Similar to BookScreen: fetch user's bookings
        const res = await apiGetAuth<{ items: any[]; nextCursor: string | null }>(`/bookings/mine?limit=20`, token);
        if (mounted) {
          setBookings(res.items || []);
          setNextCursor(res.nextCursor || null);
        }
      } catch (_e) {
        if (mounted) setBookings([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const { upcomingMatches, pastMatches } = useMemo(() => {
    const now = Date.now();
    const upcoming: any[] = [];
    const past: any[] = [];
    for (const b of bookings) {
      const startAt = b.startAt ? new Date(b.startAt) : null;
      const endAt = b.endAt ? new Date(b.endAt) : null;
      const isPast = endAt ? endAt.getTime() < now : (startAt ? startAt.getTime() < now : false);
      const statusUpper = String(b.status || '').toUpperCase();
      const status = statusUpper === 'CONFIRMED' ? 'confirmed' : 'pending';
      const kindLabel = (() => {
        const t = String(b.type || '').toLowerCase().replace('_', ' ');
        return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
      })();
      const slotsLabel = (() => {
        if (!startAt) return '';
        const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        if (!endAt) return fmtTime(startAt);
        const sameDay = startAt.toDateString() === endAt.toDateString();
        if (sameDay) return `${fmtTime(startAt)} - ${fmtTime(endAt)}`;
        const endDate = endAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${fmtTime(startAt)} - ${endDate} ${fmtTime(endAt)}`;
      })();
      const match = {
        id: b.id,
        fieldId: b.fieldId || b.field?.id,
        fieldName: b.field?.name || 'Field',
        date: startAt ? startAt.toISOString() : new Date().toISOString(),
        time: startAt ? startAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
        squad: '',
        status: status as 'confirmed' | 'pending',
        kindLabel,
        slotsLabel,
        raw: b,
      };
      if (isPast || statusUpper === 'COMPLETED' || statusUpper === 'CANCELLED') past.push(match);
      else upcoming.push(match);
    }
    return { upcomingMatches: upcoming, pastMatches: past };
  }, [bookings]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" backgroundColor="#16a34a" />
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>My Matches</Text>
        </View>
        
        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'upcoming' && styles.activeTab
            ]}
            onPress={() => setActiveTab('upcoming')}
          >
            <Text style={[
              styles.tabText,
              activeTab === 'upcoming' && styles.activeTabText
            ]}>
              Upcoming
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'past' && styles.activeTab
            ]}
            onPress={() => setActiveTab('past')}
          >
            <Text style={[
              styles.tabText,
              activeTab === 'past' && styles.activeTabText
            ]}>
              Past Events
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
        onScroll={({ nativeEvent }) => {
          const paddingToBottom = 200;
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const closeToBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
          if (closeToBottom && nextCursor && !loading && !loadingMore) {
            setLoadingMore(true);
            (async () => {
              try {
                const res = await apiGetAuth<{ items: any[]; nextCursor: string | null }>(`/bookings/mine?limit=20&cursor=${encodeURIComponent(nextCursor)}`, token as any);
                setBookings(prev => [...prev, ...(res.items || [])]);
                setNextCursor(res.nextCursor || null);
              } finally {
                setLoadingMore(false);
              }
            })();
          }
        }}
        scrollEventThrottle={16}
      >
        {activeTab === 'upcoming' ? (
          (loading ? false : upcomingMatches.length > 0) ? (
            upcomingMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                type="upcoming"
                onPrimaryPress={() => navigation.navigate('CustomerBookedDetails', { booking: match.raw })}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>⚽</Text>
              <Text style={styles.emptyText}>No upcoming matches</Text>
              <TouchableOpacity style={styles.bookButton} onPress={() => navigation.navigate('FindField')}>
                <Text style={styles.bookButtonText}>Book a Match Day</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (loading ? false : pastMatches.length > 0) ? (
          pastMatches.map((match) => (
            <MatchCard key={match.id} match={match} type="past" onPrimaryPress={() => match.fieldId && navigation.navigate('Booking', { fieldId: match.fieldId })} />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No past matches</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('FindField')}>
        <Plus size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Platform.OS === 'ios' ? '#f9fafb' : '#16a34a',
  },
  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  filterButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#ffffff',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  activeTabText: {
    color: '#16a34a',
  },
  content: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f9fafb',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
  },
  bookButton: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  bookButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 40,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});