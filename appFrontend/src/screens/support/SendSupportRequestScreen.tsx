import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, CheckCircle2, ChevronRight, Send } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiPostAuth } from '../../api/client';
import {
  SUPPORT_TOPICS,
  type SupportKind,
  type SupportTicketSummary,
  type SupportTopicKey,
} from '../../lib/support-tickets';

export default function SendSupportRequestScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const [topic, setTopic] = useState<SupportTopicKey | null>(null);
  const [kind, setKind] = useState<SupportKind>('question');
  const [summary, setSummary] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedId, setSubmittedId] = useState('');
  const [submittedRef, setSubmittedRef] = useState('');

  const canSubmit =
    Boolean(topic) && summary.trim().length >= 3 && message.trim().length >= 10 && !submitting && Boolean(token);

  const handleSubmit = async () => {
    if (!topic || !canSubmit) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await apiPostAuth<{ ticket: SupportTicketSummary }>(
        '/support/tickets',
        { topic, summary: summary.trim(), message: message.trim(), kind },
        token as string,
      );
      setSummary('');
      setMessage('');
      setTopic(null);
      setKind('question');
      setSubmittedId(res.ticket.id);
      setSubmittedRef(res.ticket.ref);
    } catch (e: any) {
      setSubmitError(e?.message || 'Could not send your request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.title}>Send a request</Text>
          <Text style={styles.subtitle}>We’ll create a ticket and assign it to the right person.</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {submittedRef ? (
            <TouchableOpacity
              style={styles.successCard}
              onPress={() => navigation?.replace('SupportTicketDetail', { ticketId: submittedId })}
            >
              <CheckCircle2 size={20} color="#166534" />
              <View style={{ flex: 1 }}>
                <Text style={styles.successTitle}>Request sent</Text>
                <Text style={styles.successBody}>Your ticket number is {submittedRef}. Tap to view details.</Text>
              </View>
              <ChevronRight size={18} color="#166534" />
            </TouchableOpacity>
          ) : null}

          <Text style={styles.sectionLabel}>Topic</Text>
          <View style={styles.chips}>
            {SUPPORT_TOPICS.map((item) => {
              const selected = topic === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setTopic(item.key)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.kindRow}>
            <TouchableOpacity
              style={[styles.kindOption, kind === 'question' && styles.kindOptionSelected]}
              onPress={() => setKind('question')}
            >
              <Text style={[styles.kindText, kind === 'question' && styles.kindTextSelected]}>Question</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kindOption, kind === 'issue' && styles.kindOptionSelected]}
              onPress={() => setKind('issue')}
            >
              <Text style={[styles.kindText, kind === 'issue' && styles.kindTextSelected]}>Problem</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Subject</Text>
          <TextInput
            style={styles.input}
            value={summary}
            onChangeText={setSummary}
            placeholder="Short summary of your request"
            placeholderTextColor="#9ca3af"
            maxLength={160}
          />

          <Text style={styles.sectionLabel}>Details</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            value={message}
            onChangeText={setMessage}
            placeholder="Include booking dates, field name, or payment details if useful."
            placeholderTextColor="#9ca3af"
            maxLength={4000}
            multiline
            textAlignVertical="top"
          />

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

          <TouchableOpacity style={[styles.submit, !canSubmit && styles.submitDisabled]} onPress={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Send size={16} color="#ffffff" />
                <Text style={styles.submitText}>Send request</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#dcfce7', lineHeight: 22 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  successCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 12, padding: 14 },
  successTitle: { fontSize: 14, fontWeight: '800', color: '#14532d' },
  successBody: { fontSize: 13, color: '#166534', marginTop: 2, lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  chipSelected: { backgroundColor: '#ecfdf5', borderColor: '#16a34a' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextSelected: { color: '#166534' },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindOption: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  kindOptionSelected: { backgroundColor: '#ecfdf5', borderColor: '#16a34a' },
  kindText: { fontSize: 14, fontWeight: '600', color: '#4b5563' },
  kindTextSelected: { color: '#166534' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, minHeight: 48, fontSize: 15, color: '#111827', backgroundColor: '#ffffff' },
  messageInput: { minHeight: 128 },
  errorText: { fontSize: 14, color: '#b91c1c' },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 12, minHeight: 48, marginTop: 8 },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
});
