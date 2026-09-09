import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import { setPendingFieldManagerInvite } from '../../lib/pending-field-manager';
import { tryOpenNativeAppForInvite } from '../../lib/native-invite-handoff';

type InvitePreview = {
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'wrong_email';
  emailMatches: boolean;
  invitedEmail: string;
  expiresAt: string;
  canAccept: boolean;
  field: { id: string; name: string; city?: string | null };
  owner: { name?: string | null; email?: string | null };
};

export default function ManageFieldInviteScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const { token, user } = useAuth() as any;
  const paramToken = String(route?.params?.token || '').trim();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState<InvitePreview | null>(null);

  const goLogin = useCallback(async () => {
    await setPendingFieldManagerInvite(paramToken);
    navigation?.navigate('Login');
  }, [navigation, paramToken]);

  const load = useCallback(async () => {
    if (!paramToken) {
      setError('This invite link is missing a token.');
      setLoading(false);
      return;
    }
    if (!token) {
      await goLogin();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiGetAuth<{ invite: InvitePreview }>(
        `/fields/manage-invite/${encodeURIComponent(paramToken)}`,
        token as string,
      );
      setInvite(res.invite);
    } catch (e: any) {
      setError(e?.message || 'Could not load this invite.');
    } finally {
      setLoading(false);
    }
  }, [goLogin, paramToken, token]);

  useEffect(() => {
    if (paramToken) {
      tryOpenNativeAppForInvite(`manage-invite/${encodeURIComponent(paramToken)}`);
    }
    void load();
  }, [load, paramToken]);

  const accept = async () => {
    if (!token || !paramToken || busy) return;
    try {
      setBusy(true);
      await apiPostAuth(`/fields/manage-invite/${encodeURIComponent(paramToken)}/accept`, {}, token as string);
      navigation?.replace('FieldDetail', { id: invite?.field.id });
    } catch (e: any) {
      const message = e?.message || 'Could not accept this invite.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('Could not accept', message);
    } finally {
      setBusy(false);
    }
  };

  const ownerLabel = invite?.owner?.name || invite?.owner?.email || 'the field owner';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Field manager invite</Text>
        <Text style={styles.subtitle}>Accept to help run this field’s bookings.</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#16a34a" /></View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !invite ? (
        <Text style={styles.error}>Invite not found.</Text>
      ) : (
        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={styles.fieldName}>{invite.field.name}</Text>
            {invite.field.city ? <Text style={styles.meta}>{invite.field.city}</Text> : null}
            <Text style={styles.meta}>Invited by {ownerLabel}</Text>
            <Text style={styles.meta}>Use {invite.invitedEmail}</Text>
          </View>

          {invite.status === 'wrong_email' ? (
            <Text style={styles.warn}>
              This invite was sent to {invite.invitedEmail}. You are signed in as {user?.email || 'another email'}.
            </Text>
          ) : null}
          {invite.status === 'expired' ? <Text style={styles.warn}>This invite has expired. Ask the owner to send a new one.</Text> : null}
          {invite.status === 'revoked' ? <Text style={styles.warn}>This invite was cancelled.</Text> : null}
          {invite.status === 'accepted' ? <Text style={styles.ok}>You already manage this field.</Text> : null}

          {invite.canAccept ? (
            <TouchableOpacity style={styles.primary} onPress={() => void accept()} disabled={busy}>
              {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Accept invite</Text>}
            </TouchableOpacity>
          ) : invite.status === 'accepted' ? (
            <TouchableOpacity style={styles.primary} onPress={() => navigation?.replace('FieldDetail', { id: invite.field.id })}>
              <Text style={styles.primaryText}>Open field</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#dcfce7', lineHeight: 22 },
  center: { padding: 40, alignItems: 'center' },
  error: { color: '#b91c1c', padding: 16 },
  body: { padding: 16 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 },
  fieldName: { fontSize: 20, fontWeight: '800', color: '#111827' },
  meta: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  warn: { color: '#b45309', fontSize: 14, marginBottom: 16, lineHeight: 20 },
  ok: { color: '#166534', fontSize: 14, marginBottom: 16 },
  primary: { backgroundColor: '#16a34a', borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
});
