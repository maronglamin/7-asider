import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, ShieldAlert, Trash2, Check } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { apiPatchAuth } from '../api/client';

export default function DeleteAccountScreen() {
  const navigation = useNavigation<any>();
  const { token, clearAuth } = useAuth() as any;
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = () => {
    Alert.alert(
      'Delete Account',
      'This action is irreversible. All your data will be permanently removed and your account will be terminated. Are you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              setSubmitting(true);
              setError(null);
              await apiPatchAuth('/auth/me/status', { status: 'TERMINATED' }, token as string);
              clearAuth();
              navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            } catch (e: any) {
              setError(e?.message || 'Failed to delete account');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeTop} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.headerBar}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={20} color="#16a34a" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Delete Account</Text>
        <Text style={styles.headerSubtitle}>Permanently remove your account</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.warningRow}>
            <ShieldAlert size={20} color="#b45309" />
            <Text style={styles.warningText}>This action cannot be undone.</Text>
          </View>
          <Text style={styles.bodyText}>
            Deleting your account is irreversible. Your profile, bookings, and any associated data will be permanently removed. 
            You will not be able to recover your account after deletion.
          </Text>

          <TouchableOpacity
            onPress={() => setAcknowledged((v) => !v)}
            style={[styles.ackRow, acknowledged && styles.ackRowActive]}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, acknowledged && styles.checkboxChecked]}>
              {acknowledged ? <Check size={14} color="#ffffff" /> : null}
            </View>
            <Text style={styles.ackText}>I understand this is irreversible</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!acknowledged || submitting}
            onPress={onDelete}
            style={[styles.deleteBtn, (!acknowledged || submitting) && styles.deleteBtnDisabled]}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Trash2 size={18} color="#ffffff" />
                <Text style={styles.deleteText}>Delete my account</Text>
              </>
            )}
          </TouchableOpacity>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeTop: {
    flex: 1,
    backgroundColor: '#16a34a',
  },
  headerBar: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 10 : 0,
    paddingBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#dcfce7',
    fontSize: 14,
  },
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  card: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningText: { color: '#b45309', fontWeight: '700' },
  bodyText: { color: '#7c2d12', lineHeight: 20 },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  ackRowActive: { backgroundColor: '#fef3c7', borderColor: '#fcd34d' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#92400e',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7ed',
  },
  checkboxChecked: { backgroundColor: '#b45309', borderColor: '#b45309' },
  ackText: { color: '#78350f', fontWeight: '600' },
  deleteBtn: {
    marginTop: 8,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteText: { color: '#ffffff', fontWeight: '700' },
  errorText: { color: '#dc2626', marginTop: 8 },
});


