import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { apiGetAuth, apiPostAuth } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { setPendingChallenge } from '../../lib/pending-squad';
import type { SquadSummary } from '../../lib/squad-identity';
import { tryOpenNativeAppForInvite } from '../../lib/native-invite-handoff';

type ChallengePayload = {
  status: string;
  expiresAt: string;
  fromSquad: SquadSummary;
  toSquad?: SquadSummary | null;
  booking: {
    id: string;
    startAt: string;
    endAt: string;
    field?: { name?: string; city?: string };
  };
  canAccept: boolean;
  captainSquads: SquadSummary[];
};

export function ChallengeAcceptScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const { token } = useAuth();
  const paramToken = String(route?.params?.token || '').trim();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState<ChallengePayload | null>(null);
  const [pickedSquadId, setPickedSquadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!paramToken) {
      setError('This challenge link is missing a token.');
      setLoading(false);
      return;
    }
    if (!token) {
      await setPendingChallenge(paramToken);
      navigation?.navigate('Login');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiGetAuth<{ challenge: ChallengePayload }>(
        `/squads/challenge/${encodeURIComponent(paramToken)}`,
        token,
      );
      setChallenge(res.challenge);
      const first = res.challenge.captainSquads?.[0]?.id || null;
      setPickedSquadId(first);
    } catch (e: any) {
      setError(e?.message || 'Could not load this challenge.');
    } finally {
      setLoading(false);
    }
  }, [navigation, paramToken, token]);

  useEffect(() => {
    if (paramToken) {
      tryOpenNativeAppForInvite(`challenge/${encodeURIComponent(paramToken)}`);
    }
    void load();
  }, [load, paramToken]);

  const accept = async () => {
    if (!token || !paramToken || !pickedSquadId) return;
    setBusy(true);
    try {
      const res = await apiPostAuth<{ ok: boolean; bookingId: string }>(
        `/squads/challenge/${encodeURIComponent(paramToken)}/accept`,
        { squadId: pickedSquadId },
        token,
      );
      Alert.alert('Game on', 'Both squads are locked into this slot.', [
        {
          text: 'See the match',
          onPress: () => navigation?.replace('CustomerBookedDetails', { bookingId: res.bookingId }),
        },
      ]);
    } catch (e: any) {
      Alert.alert('Could not accept', e?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const kickoff = challenge?.booking?.startAt
    ? new Date(challenge.booking.startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Challenge</Text>
        <Text style={styles.headerSub}>Two squads. One pitch. 7v7.</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#16a34a" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : challenge ? (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            <Text style={styles.vs}>
              {challenge.fromSquad?.emoji} {challenge.fromSquad?.name}
            </Text>
            <Text style={styles.vsLabel}>wants a game</Text>
            <Text style={styles.meta}>{challenge.booking?.field?.name || 'Field'}</Text>
            {kickoff ? <Text style={styles.meta}>{kickoff}</Text> : null}
            <Text style={styles.status}>Status: {challenge.status}</Text>
          </View>

          {challenge.status === 'PENDING' && challenge.captainSquads.length > 0 ? (
            <>
              <Text style={styles.label}>Accept with</Text>
              {challenge.captainSquads.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.squadRow, pickedSquadId === s.id && styles.squadRowActive]}
                  onPress={() => setPickedSquadId(s.id)}
                >
                  <Text style={styles.squadEmoji}>{s.emoji}</Text>
                  <Text style={styles.squadName}>{s.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={accept}>
                {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Accept challenge</Text>}
              </TouchableOpacity>
            </>
          ) : challenge.status === 'PENDING' ? (
            <Text style={styles.hint}>Only a captain of another squad can accept this. Create a squad, then tap the link again.</Text>
          ) : (
            <Text style={styles.hint}>This challenge is {String(challenge.status).toLowerCase()}.</Text>
          )}
        </ScrollView>
      ) : null}
      <SafeAreaView edges={['bottom']} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  safeTop: { backgroundColor: '#16a34a' },
  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'android' ? 12 : 4,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', marginBottom: 8 },
  headerTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800' },
  headerSub: { color: '#dcfce7', marginTop: 4, fontSize: 14 },
  body: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    marginBottom: 20,
  },
  vs: { fontSize: 22, fontWeight: '800', color: '#111827' },
  vsLabel: { color: '#6b7280', marginTop: 4, marginBottom: 12, fontSize: 14 },
  meta: { color: '#111827', fontSize: 15, marginBottom: 4 },
  status: { marginTop: 8, color: '#166534', fontWeight: '700' },
  label: { fontWeight: '700', color: '#111827', marginBottom: 8 },
  squadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  squadRowActive: { borderColor: '#16a34a', backgroundColor: '#dcfce7' },
  squadEmoji: { fontSize: 22 },
  squadName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  primary: { backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  hint: { color: '#6b7280', lineHeight: 20, fontSize: 14 },
  error: { color: '#b91c1c', padding: 20, fontSize: 14 },
});
