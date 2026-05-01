import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Alert, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Mail, Send, FileText } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, apiPostAuth } from '../../api/client';

type TemplateMode = 'DEFAULT' | 'CUSTOM';

type ContractTemplate = {
  subject: string;
  messageText: string;
  messageHtml?: string;
  proposalFilename: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCcEmails(input: string) {
  return input
    .split(/[,\n;]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

export default function ContractInvitationScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth() as any;
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateMode, setTemplateMode] = useState<TemplateMode>('DEFAULT');
  const [proposalFilename, setProposalFilename] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [platformFeePerHour, setPlatformFeePerHour] = useState('100');
  const [ccEmails, setCcEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [messageText, setMessageText] = useState('');

  const loadTemplate = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingTemplate(true);
      setError(null);
      const qs = new URLSearchParams();
      if (recipientName.trim()) qs.set('recipientName', recipientName.trim());
      if (businessName.trim()) qs.set('businessName', businessName.trim());
      if (platformFeePerHour.trim()) qs.set('platformFeePerHour', platformFeePerHour.trim());
      const template = await apiGetAuth<ContractTemplate>(`/admin/contract-invitations/template?${qs.toString()}`, token as string);
      setSubject(template.subject || '');
      setMessageText(template.messageText || '');
      setProposalFilename(template.proposalFilename || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to load invitation template');
    } finally {
      setLoadingTemplate(false);
    }
  }, [token, recipientName, businessName, platformFeePerHour]);

  useEffect(() => {
    if (templateMode === 'DEFAULT') {
      loadTemplate();
    }
  }, [loadTemplate, templateMode]);

  const ccList = useMemo(() => parseCcEmails(ccEmails), [ccEmails]);
  const ccValid = useMemo(() => ccList.every((email) => EMAIL_RE.test(email)), [ccList]);
  const platformFeeNumber = useMemo(() => Number(platformFeePerHour), [platformFeePerHour]);
  const platformFeeValid = useMemo(() => Number.isFinite(platformFeeNumber) && platformFeeNumber > 0, [platformFeeNumber]);
  const canSend = useMemo(() => {
    if (!token || sending) return false;
    if (!EMAIL_RE.test(recipientEmail.trim())) return false;
    if (!businessName.trim()) return false;
    if (!platformFeeValid) return false;
    if (!ccValid) return false;
    if (!subject.trim() || !messageText.trim()) return false;
    return true;
  }, [token, sending, recipientEmail, businessName, platformFeeValid, ccValid, subject, messageText]);

  const resetToDefault = async () => {
    setTemplateMode('DEFAULT');
    await loadTemplate();
  };

  const sendInvitation = async () => {
    if (!canSend) return;
    try {
      setSending(true);
      setError(null);
      await apiPostAuth(
        '/admin/contract-invitations',
        {
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim(),
          businessName: businessName.trim(),
          platformFeePerHour: platformFeeNumber,
          ccEmails: ccList,
          templateType: templateMode,
          subject,
          messageText,
        },
        token as string
      );
      Alert.alert('Invitation sent', 'The contract invitation email has been sent.');
      setRecipientEmail('');
      setRecipientName('');
      setBusinessName('');
      setCcEmails('');
      if (templateMode === 'DEFAULT') await loadTemplate();
    } catch (e: any) {
      const message = e?.message || 'Failed to send invitation';
      setError(message);
      Alert.alert('Error', message);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Mail size={22} color="#ffffff" />
          <Text style={styles.title}>Contract Invitation</Text>
        </View>
        <Text style={styles.subtitle}>Send proposal emails to field partners</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Recipients</Text>
          <TextInput
            style={styles.input}
            value={recipientEmail}
            onChangeText={setRecipientEmail}
            placeholder="Recipient email"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="Recipient name (optional)"
            placeholderTextColor="#9ca3af"
          />
          <TextInput
            style={[styles.input, styles.textAreaSmall]}
            value={ccEmails}
            onChangeText={setCcEmails}
            placeholder="Copies / CC emails, separated by commas"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
            multiline
          />
          {!ccValid ? <Text style={styles.validationText}>One or more CC email addresses are invalid.</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Invitation Variables</Text>
          <TextInput
            style={styles.input}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="Business / field name being invited"
            placeholderTextColor="#9ca3af"
          />
          <TextInput
            style={styles.input}
            value={platformFeePerHour}
            onChangeText={setPlatformFeePerHour}
            placeholder="7a-side fee per booking hour"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
          />
          {!businessName.trim() ? <Text style={styles.validationText}>Business name is required for the invitation and PDF.</Text> : null}
          {!platformFeeValid ? <Text style={styles.validationText}>Enter a valid 7a-side fee per booking hour.</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Template</Text>
          <View style={styles.segmentRow}>
            <TouchableOpacity
              style={[styles.segmentBtn, templateMode === 'DEFAULT' && styles.segmentBtnActive]}
              onPress={resetToDefault}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, templateMode === 'DEFAULT' && styles.segmentTextActive]}>Default</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, templateMode === 'CUSTOM' && styles.segmentBtnActive]}
              onPress={() => setTemplateMode('CUSTOM')}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, templateMode === 'CUSTOM' && styles.segmentTextActive]}>Custom</Text>
            </TouchableOpacity>
          </View>

          {loadingTemplate ? (
            <View style={styles.center}>
              <ActivityIndicator color="#16a34a" />
            </View>
          ) : (
            <>
              <TextInput
                style={[styles.input, templateMode === 'DEFAULT' && styles.inputReadonly]}
                value={subject}
                onChangeText={setSubject}
                placeholder="Subject"
                placeholderTextColor="#9ca3af"
                editable={templateMode === 'CUSTOM'}
              />
              <TextInput
                style={[styles.input, styles.textArea, templateMode === 'DEFAULT' && styles.inputReadonly]}
                value={messageText}
                onChangeText={setMessageText}
                placeholder="Message content"
                placeholderTextColor="#9ca3af"
                multiline
                editable={templateMode === 'CUSTOM'}
              />
            </>
          )}

          <View style={styles.attachmentRow}>
            <FileText size={18} color="#065f46" />
            <Text style={styles.attachmentText}>Attached contract PDF: {proposalFilename || 'default contract PDF'}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.sendButton, { opacity: canSend ? 1 : 0.5 }]}
          disabled={!canSend}
          onPress={sendInvitation}
          activeOpacity={0.8}
        >
          {sending ? <ActivityIndicator size="small" color="#ffffff" /> : <Send size={18} color="#ffffff" />}
          <Text style={styles.sendButtonText}>{sending ? 'Sending...' : 'Send Invitation'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#dcfce7' },
  content: { flex: 1, backgroundColor: '#f9fafb' },
  contentInner: { padding: 16, paddingBottom: 32, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, gap: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' },
  input: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' },
  inputReadonly: { color: '#374151', backgroundColor: '#f9fafb' },
  textAreaSmall: { minHeight: 72, textAlignVertical: 'top' },
  textArea: { minHeight: 240, textAlignVertical: 'top' },
  validationText: { color: '#b91c1c', fontSize: 12 },
  errorBox: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, padding: 10, borderRadius: 8 },
  errorText: { color: '#b91c1c' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segmentBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  segmentBtnActive: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  segmentText: { fontSize: 12, fontWeight: '800', color: '#374151' },
  segmentTextActive: { color: '#065f46' },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ecfdf5', borderRadius: 10, padding: 10 },
  attachmentText: { flex: 1, color: '#065f46', fontSize: 13, fontWeight: '700' },
  sendButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 12 },
  sendButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
});
