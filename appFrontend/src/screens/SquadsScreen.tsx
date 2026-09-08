import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Search, PlusCircle, Users } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth } from '../api/client';
import type { SquadSummary } from '../lib/squad-identity';
import { startingSideCopy } from '../lib/squad-identity';

export function SquadsScreen() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [squads, setSquads] = useState<SquadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!token) {
      setSquads([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await apiGetAuth<{ items: SquadSummary[] }>('/squads/mine', token);
      setSquads(res.items || []);
    } catch {
      setSquads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return squads;
    return squads.filter((s) => s.name.toLowerCase().includes(q) || (s.emoji || '').includes(q));
  }, [query, squads]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <View style={styles.header}>
        <Text style={styles.title}>Squads</Text>
        <View style={styles.searchContainer}>
          <Search size={20} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your squads"
            placeholderTextColor="#9ca3af"
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
      >
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.secondaryAction} onPress={() => navigation.navigate('JoinSquad')}>
            <Search size={24} color="#16a34a" />
            <Text style={styles.secondaryActionText}>Join a Squad</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryAction} onPress={() => navigation.navigate('CreateSquad')}>
            <PlusCircle size={24} color="#ffffff" />
            <Text style={styles.primaryActionText}>Create Squad</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Squads</Text>
          {loading ? (
            <ActivityIndicator color="#16a34a" style={{ marginTop: 16 }} />
          ) : filtered.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Build your side</Text>
              <Text style={styles.emptyText}>
                Create a squad, drop the invite in WhatsApp, and everyone sees the same bookings.
              </Text>
            </View>
          ) : (
            <View style={styles.squadsList}>
              {filtered.map((squad) => (
                <View key={squad.id} style={styles.squadCard}>
                  <View style={styles.squadInfo}>
                    <View style={[styles.squadLogo, { backgroundColor: squad.color || '#dcfce7' }]}>
                      <Text style={styles.squadLogoText}>{squad.emoji || '⚽'}</Text>
                    </View>
                    <View style={styles.squadDetails}>
                      <Text style={styles.squadName}>{squad.name}</Text>
                      <View style={styles.membersContainer}>
                        <Users size={16} color="#6b7280" />
                        <Text style={styles.membersText}>
                          {squad.memberCount} members · {squad.role === 'CAPTAIN' ? 'Captain' : 'Player'}
                        </Text>
                      </View>
                      <Text style={styles.progress}>{startingSideCopy(squad.memberCount || 0)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() => navigation.navigate('SquadDetail', { squadId: squad.id })}
                  >
                    <Text style={styles.viewButtonText}>View</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
        <SafeAreaView edges={['bottom']} style={styles.safeBottom} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  safeTop: { backgroundColor: '#16a34a' },
  safeBottom: { backgroundColor: '#f9fafb' },
  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 30 : 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
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
  actionsContainer: {
    padding: 16,
    flexDirection: 'row',
    gap: 12,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryAction: {
    flex: 1,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  squadsList: {
    gap: 12,
  },
  squadCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  squadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  squadLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  squadLogoText: {
    fontSize: 24,
  },
  squadDetails: {
    flex: 1,
  },
  squadName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  membersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  membersText: {
    fontSize: 14,
    color: '#6b7280',
  },
  progress: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  viewButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#6b7280', lineHeight: 20 },
});
