import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { apiPostAuth } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { setPendingSquadJoin } from '../../lib/pending-squad';
import type { SquadSummary } from '../../lib/squad-identity';
import { tryOpenNativeAppForInvite } from '../../lib/native-invite-handoff';

export function JoinSquadScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const { token } = useAuth();
  const paramCode = String(route?.params?.code || '').trim();
  const [code, setCode] = useState(paramCode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const joiningRef = useRef(false);

  const goLogin = useCallback(async (nextCode: string) => {
    await setPendingSquadJoin(nextCode);
    navigation?.navigate('Login');
  }, [navigation]);

  const join = useCallback(async (raw?: string) => {
    const value = String(raw ?? code).trim().toUpperCase();
    if (value.length < 4) {
      setMessage('Enter the invite code from your captain.');
      return;
    }
    if (!token) {
      await goLogin(value);
      return;
    }
    if (joiningRef.current) return;
    joiningRef.current = true;
    setBusy(true);
    setMessage('');
    try {
      const res = await apiPostAuth<{ ok: boolean; alreadyMember?: boolean; squad: SquadSummary }>(
        '/squads/join',
        { code: value },
        token,
      );
      const squad = res.squad;
      const title = res.alreadyMember ? 'Already in' : "You're in";
      const body = res.alreadyMember
        ? `${squad.emoji} ${squad.name} already has you on the list.`
        : `${squad.emoji} ${squad.name} just got louder.`;
      Alert.alert(title, body, [
        {
          text: 'Open squad',
          onPress: () => navigation?.replace('SquadDetail', { squadId: squad.id }),
        },
      ]);
    } catch (e: any) {
      setMessage(e?.message || 'Could not join that squad.');
    } finally {
      joiningRef.current = false;
      setBusy(false);
    }
  }, [code, goLogin, navigation, token]);

  useEffect(() => {
    if (paramCode) {
      tryOpenNativeAppForInvite(`join/${encodeURIComponent(paramCode)}`);
      setCode(paramCode);
      void join(paramCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramCode, token]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <ArrowLeft size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Join a Squad</Text>
        <Text style={styles.headerSub}>Paste the code from WhatsApp, iMessage, or your captain.</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>Invite code</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="THUNDER"
          placeholderTextColor="#9ca3af"
          style={styles.input}
          maxLength={12}
        />
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => join()}>
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>{token ? 'Join squad' : 'Sign in to join'}</Text>}
        </TouchableOpacity>
      </View>
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
  headerSub: { color: '#dcfce7', marginTop: 4, fontSize: 14, lineHeight: 20 },
  body: { padding: 20 },
  label: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 8 },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 20,
    letterSpacing: 2,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  error: { color: '#b91c1c', marginBottom: 12, fontSize: 14 },
  primary: { backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
