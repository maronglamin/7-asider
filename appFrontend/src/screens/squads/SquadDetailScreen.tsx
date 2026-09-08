import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Calendar, Share2, UserMinus } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { apiDeleteAuth, apiGetAuth, apiPatchAuth, apiPostAuth } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { MatchCard } from '../../components/MatchCard';
import { startingSideCopy, type SquadMember, type SquadSummary } from '../../lib/squad-identity';
import { shareText, squadInviteMessage } from '../../lib/squad-share';

type SquadDetail = SquadSummary & {
  members: SquadMember[];
  you?: SquadMember;
  inviteCode?: string;
};

type SquadMatch = {
  id: string;
  fieldId?: string;
  fieldName: string;
  startAt: string;
  endAt?: string;
  status: string;
  squads?: { side: string; squad: { name: string; emoji: string } }[];
  side?: string;
  canManage?: boolean;
  challenge?: { token: string; status: string } | null;
  field?: { id?: string };
};

function matchForCard(m: SquadMatch, type: 'upcoming' | 'past') {
  const start = m.startAt ? new Date(m.startAt) : null;
  const home = m.squads?.find((s) => s.side === 'HOME')?.squad;
  const away = m.squads?.find((s) => s.side === 'AWAY')?.squad;
  const squadLabel = away
    ? `${home?.emoji || ''} ${home?.name || 'Home'} vs ${away?.emoji || ''} ${away?.name || 'Away'}`
    : `${home?.emoji || ''} ${home?.name || ''}`.trim();
  const statusUpper = String(m.status || '').toUpperCase();
  return {
    id: m.id,
    fieldId: m.fieldId || m.field?.id,
    fieldName: m.fieldName,
    date: start ? start.toISOString() : new Date().toISOString(),
    time: start ? start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
    squad: squadLabel,
    status: (statusUpper === 'CANCELLED'
      ? 'cancelled'
      : statusUpper === 'PENDING_REFUND'
        ? 'pending_refund'
        : statusUpper === 'COMPLETED'
          ? 'completed'
          : statusUpper === 'CONFIRMED'
            ? 'confirmed'
            : 'pending') as 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'pending_refund',
  };
}

export function SquadDetailScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const { token, user } = useAuth();
  const squadId = String(route?.params?.squadId || '');
  const justCreated = Boolean(route?.params?.justCreated);
  const [squad, setSquad] = useState<SquadDetail | null>(null);
  const [upcoming, setUpcoming] = useState<SquadMatch[]>([]);
  const [past, setPast] = useState<SquadMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editName, setEditName] = useState('');

  const isCaptain = squad?.role === 'CAPTAIN' || squad?.you?.role === 'CAPTAIN';

  const load = useCallback(async (silent = false) => {
    if (!token || !squadId) return;
    if (!silent) setLoading(true);
    try {
      const [detail, matches] = await Promise.all([
        apiGetAuth<{ squad: SquadDetail }>(`/squads/${squadId}`, token),
        apiGetAuth<{ upcoming: SquadMatch[]; past: SquadMatch[] }>(`/squads/${squadId}/matches`, token),
      ]);
      setSquad(detail.squad);
      setEditName(detail.squad.name);
      setUpcoming(matches.upcoming || []);
      setPast(matches.past || []);
    } catch (e: any) {
      Alert.alert('Squad', e?.message || 'Could not load this squad.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [squadId, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onShare = async () => {
    if (!squad?.inviteCode) {
      Alert.alert('Ask your captain', 'Only the captain can share the invite code.');
      return;
    }
    try {
      const result = await shareText(squadInviteMessage(squad), `${squad.emoji} ${squad.name}`);
      if (result === 'copied') Alert.alert('Copied', 'Invite copied. Drop it in the group chat.');
    } catch {
      /* cancelled */
    }
  };

  const onRefreshInvite = async () => {
    if (!token) return;
    try {
      const res = await apiPostAuth<{ inviteCode: string }>(`/squads/${squadId}/invite/refresh`, {}, token);
      setSquad((prev) => (prev ? { ...prev, inviteCode: res.inviteCode } : prev));
      Alert.alert('New code', 'Old invites no longer work. Share the fresh one.');
    } catch (e: any) {
      Alert.alert('Invite', e?.message || 'Could not refresh the code.');
    }
  };

  const onLeave = () => {
    Alert.alert('Leave squad', 'You will lose this locker room and its fixtures.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiPostAuth(`/squads/${squadId}/leave`, {}, token || '');
            navigation?.goBack();
          } catch (e: any) {
            Alert.alert('Leave', e?.message || 'Could not leave.');
          }
        },
      },
    ]);
  };

  const onKick = (member: SquadMember) => {
    Alert.alert(`Drop ${member.name}?`, 'They can rejoin with a new invite.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Drop',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteAuth(`/squads/${squadId}/members/${member.userId}`, token || '');
            void load(true);
          } catch (e: any) {
            Alert.alert('Squad', e?.message || 'Could not remove that player.');
          }
        },
      },
    ]);
  };

  const onTransfer = (member: SquadMember) => {
    Alert.alert('Pass the armband', `${member.name} becomes captain. You stay as a player.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Transfer',
        onPress: async () => {
          try {
            await apiPostAuth(`/squads/${squadId}/transfer-captain`, { userId: member.userId }, token || '');
            setManageOpen(false);
            void load(true);
          } catch (e: any) {
            Alert.alert('Captain', e?.message || 'Could not transfer.');
          }
        },
      },
    ]);
  };

  const onSaveName = async () => {
    if (!token || editName.trim().length < 2) return;
    try {
      await apiPatchAuth(`/squads/${squadId}`, { name: editName.trim() }, token);
      setManageOpen(false);
      void load(true);
    } catch (e: any) {
      Alert.alert('Squad', e?.message || 'Could not update.');
    }
  };

  const founded = squad?.foundedAt
    ? new Date(squad.foundedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={[styles.safeTop, { backgroundColor: squad?.color || '#16a34a' }]} />
      <View style={[styles.header, { backgroundColor: squad?.color || '#16a34a' }]}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#ffffff" />
        </TouchableOpacity>
        {loading && !squad ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <Text style={styles.crest}>{squad?.emoji}</Text>
            <Text style={styles.name}>{squad?.name}</Text>
            <Text style={styles.meta}>
              {squad?.memberCount || 0} members{founded ? ` · Founded ${founded}` : ''}
            </Text>
            {justCreated ? <Text style={styles.fun}>You built the club. Now fill the side.</Text> : null}
            <Text style={styles.progress}>{startingSideCopy(squad?.memberCount || 0, squad?.startingSideSize || 7)}</Text>
            {isCaptain && squad?.inviteCode ? (
              <Text style={styles.code}>Invite code {squad.inviteCode}</Text>
            ) : null}
          </>
        )}
      </View>

      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
      >
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryAction} onPress={onShare}>
            <Share2 size={18} color="#ffffff" />
            <Text style={styles.primaryActionText}>Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => navigation?.navigate('FindField', { squadId })}
          >
            <Calendar size={18} color="#16a34a" />
            <Text style={styles.secondaryActionText}>Book</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Roster</Text>
        {(squad?.members || []).map((m) => (
          <View key={m.id} style={styles.memberRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(m.name || '?').slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{m.name}{m.userId === user?.id ? ' (you)' : ''}</Text>
              <Text style={styles.memberRole}>{m.role === 'CAPTAIN' ? 'Captain' : 'Player'}</Text>
            </View>
            {isCaptain && m.userId !== user?.id ? (
              <TouchableOpacity onPress={() => onKick(m)} accessibilityLabel={`Drop ${m.name}`}>
                <UserMinus size={18} color="#b91c1c" />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Upcoming</Text>
        {upcoming.length === 0 ? (
          <Text style={styles.empty}>No kickoffs yet. Book a pitch for the squad.</Text>
        ) : (
          upcoming.map((m) => (
            <MatchCard
              key={m.id}
              type="upcoming"
              match={matchForCard(m, 'upcoming')}
              onPrimaryPress={() => navigation?.navigate('CustomerBookedDetails', { bookingId: m.id })}
            />
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>History</Text>
        {past.length === 0 ? (
          <Text style={styles.empty}>Match history shows up after you play.</Text>
        ) : (
          past.map((m) => (
            <MatchCard
              key={m.id}
              type="upcoming"
              match={matchForCard(m, 'past')}
              onPrimaryPress={() => navigation?.navigate('CustomerBookedDetails', { bookingId: m.id })}
            />
          ))
        )}

        <View style={styles.footerActions}>
          {isCaptain ? (
            <TouchableOpacity style={styles.manageBtn} onPress={() => setManageOpen(true)}>
              <Text style={styles.manageText}>Manage squad</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
            <Text style={styles.leaveText}>Leave squad</Text>
          </TouchableOpacity>
        </View>
        <SafeAreaView edges={['bottom']} />
      </ScrollView>

      <Modal visible={manageOpen} animationType="slide" transparent>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} onPress={() => setManageOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Captain tools</Text>
            <Text style={styles.label}>Rename</Text>
            <TextInput value={editName} onChangeText={setEditName} style={styles.input} />
            <TouchableOpacity style={styles.primaryAction} onPress={onSaveName}>
              <Text style={styles.primaryActionText}>Save name</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryAction, { marginTop: 10 }]} onPress={onRefreshInvite}>
              <Text style={styles.secondaryActionText}>Rotate invite code</Text>
            </TouchableOpacity>
            <Text style={[styles.label, { marginTop: 16 }]}>Pass the armband</Text>
            {(squad?.members || []).filter((m) => m.userId !== user?.id).map((m) => (
              <TouchableOpacity key={m.id} style={styles.memberRow} onPress={() => onTransfer(m)}>
                <Text style={styles.memberName}>{m.name}</Text>
              </TouchableOpacity>
            ))}
            <SafeAreaView edges={['bottom']} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  safeTop: { backgroundColor: '#16a34a' },
  header: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: Platform.OS === 'android' ? 8 : 0 },
  backBtn: { width: 36, height: 36, justifyContent: 'center', marginBottom: 8 },
  crest: { fontSize: 40, marginBottom: 6 },
  name: { color: '#ffffff', fontSize: 26, fontWeight: '800' },
  meta: { color: 'rgba(255,255,255,0.85)', marginTop: 4, fontSize: 14 },
  fun: { color: '#dcfce7', marginTop: 8, fontWeight: '600' },
  progress: { color: '#ffffff', marginTop: 8, fontSize: 13, lineHeight: 18 },
  code: { color: '#dcfce7', marginTop: 8, fontWeight: '700', letterSpacing: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  primaryAction: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  primaryActionText: { color: '#ffffff', fontWeight: '700' },
  secondaryAction: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#16a34a',
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  secondaryActionText: { color: '#16a34a', fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#166534', fontWeight: '800' },
  memberName: { fontWeight: '600', color: '#111827' },
  memberRole: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  empty: { color: '#6b7280', marginBottom: 16, fontSize: 14 },
  footerActions: { marginTop: 12, marginBottom: 24, gap: 8 },
  manageBtn: { alignItems: 'center', paddingVertical: 12 },
  manageText: { color: '#16a34a', fontWeight: '700' },
  leaveBtn: { alignItems: 'center', paddingVertical: 12 },
  leaveText: { color: '#b91c1c', fontWeight: '600' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  label: { fontWeight: '700', color: '#111827', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
});
