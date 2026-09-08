import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
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
import { SQUAD_CRESTS, SQUAD_KIT_COLORS, type SquadSummary } from '../../lib/squad-identity';
import { shareText, squadInviteMessage } from '../../lib/squad-share';

export function CreateSquadScreen({ navigation }: { navigation?: any }) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⚽');
  const [color, setColor] = useState('#16a34a');
  const [busy, setBusy] = useState(false);

  const canSubmit = name.trim().length >= 2 && !busy;
  const previewName = name.trim() || 'Your squad';

  const title = useMemo(() => (name.trim() ? `${emoji} ${name.trim()}` : 'Name your squad'), [emoji, name]);

  const onCreate = async () => {
    if (!canSubmit) return;
    if (!token) {
      Alert.alert('Login required', 'Sign in to create a squad.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiPostAuth<{ ok: boolean; squad: SquadSummary & { inviteCode?: string } }>(
        '/squads',
        { name: name.trim(), emoji, color },
        token,
      );
      const squad = res.squad;
      try {
        await shareText(squadInviteMessage(squad), `${squad.emoji} ${squad.name}`);
      } catch {
        /* user cancelled share */
      }
      navigation?.replace('SquadDetail', { squadId: squad.id, justCreated: true });
    } catch (e: any) {
      Alert.alert('Could not create squad', e?.message || 'Try a different name.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <ArrowLeft size={22} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Squad</Text>
        <Text style={styles.headerSub}>Pick a crest. Rally the group chat.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.preview, { backgroundColor: color }]}>
          <Text style={styles.previewEmoji}>{emoji}</Text>
          <Text style={styles.previewName}>{previewName}</Text>
          <Text style={styles.previewHint}>{title === 'Name your squad' ? 'Make it shoutable.' : 'Looks match-day ready.'}</Text>
        </View>

        <Text style={styles.label}>Squad name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Thunder FC"
          placeholderTextColor="#9ca3af"
          style={styles.input}
          maxLength={32}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Crest</Text>
        <View style={styles.grid}>
          {SQUAD_CRESTS.map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => setEmoji(item)}
              style={[styles.crest, emoji === item && styles.crestActive]}
            >
              <Text style={styles.crestText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Kit colour</Text>
        <View style={styles.colorRow}>
          {SQUAD_KIT_COLORS.map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => setColor(item)}
              style={[styles.swatch, { backgroundColor: item }, color === item && styles.swatchActive]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primary, !canSubmit && styles.primaryDisabled]}
          disabled={!canSubmit}
          onPress={onCreate}
        >
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Create and invite</Text>}
        </TouchableOpacity>
        <SafeAreaView edges={['bottom']} />
      </ScrollView>
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
  content: { padding: 20, paddingBottom: 40 },
  preview: {
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 24,
  },
  previewEmoji: { fontSize: 48, marginBottom: 8 },
  previewName: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  previewHint: { color: 'rgba(255,255,255,0.85)', marginTop: 6, fontSize: 13 },
  label: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 8 },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 20,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  crest: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestActive: { borderColor: '#16a34a', borderWidth: 2, backgroundColor: '#dcfce7' },
  crestText: { fontSize: 22 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  swatchActive: { borderWidth: 3, borderColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  primary: { backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
