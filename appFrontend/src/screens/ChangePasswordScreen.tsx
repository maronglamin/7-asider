import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Lock } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth, apiPostAuth } from '../api/client';

type UserResponse = {
  provider?: string | null;
};

export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const { token } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<string | null>(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => {
    if (!token || provider !== 'email') return false;
    if (!oldPassword || !newPassword || !confirmNewPassword) return false;
    if (newPassword.length < 8) return false;
    if (newPassword !== confirmNewPassword) return false;
    return true;
  }, [token, provider, oldPassword, newPassword, confirmNewPassword]);

  useEffect(() => {
    (async () => {
      try {
        if (!token) return;
        const res = await apiGetAuth<UserResponse>('/auth/me', token as string);
        setProvider(res.provider || null);
      } catch (e: any) {
        Alert.alert('Unable to load account', e.message || 'Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const onSubmit = async () => {
    if (!canSubmit || saving) return;

    try {
      setSaving(true);
      const res = await apiPostAuth<{ message: string }>(
        '/auth/change-password',
        { oldPassword, newPassword, confirmNewPassword },
        token as string,
      );
      Alert.alert('Password updated', res.message);
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      (navigation as any).goBack();
    } catch (e: any) {
      Alert.alert('Unable to change password', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeTop} edges={['top']}>
      <StatusBar style="light" backgroundColor="#16a34a" />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.headerBar}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => (navigation as any).goBack()}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <ChevronLeft size={20} color="#16a34a" />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>Change Password</Text>
          <Text style={styles.headerSubtitle}>Keep your account secure with a strong new password.</Text>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color="#16a34a" />
            </View>
          ) : provider !== 'email' ? (
            <View style={styles.card}>
              <View style={styles.iconWrap}>
                <Lock size={22} color="#16a34a" />
              </View>
              <Text style={styles.cardTitle}>Password change unavailable</Text>
              <Text style={styles.cardText}>
                This account uses a social sign-in provider. Password changes are only available for email sign-in accounts.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.iconWrap}>
                <Lock size={22} color="#16a34a" />
              </View>
              <Text style={styles.cardTitle}>Update your password</Text>
              <Text style={styles.cardText}>Use at least 8 characters and avoid reusing your current password.</Text>

              <Text style={styles.inputLabel}>Current password</Text>
              <TextInput
                value={oldPassword}
                onChangeText={setOldPassword}
                secureTextEntry
                placeholder="Enter current password"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>New password</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Enter new password"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>Confirm new password</Text>
              <TextInput
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                secureTextEntry
                placeholder="Confirm new password"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <TouchableOpacity
                onPress={onSubmit}
                disabled={!canSubmit || saving}
                style={[styles.submitButton, (!canSubmit || saving) && styles.submitDisabled]}
              >
                <Text style={styles.submitText}>{saving ? 'Updating...' : 'Update Password'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeTop: { flex: 1, backgroundColor: '#16a34a' },
  keyboardWrap: {
    flex: 1,
  },
  headerBar: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#dcfce7',
    fontSize: 14,
    lineHeight: 20,
  },
  content: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  contentContainer: {
    flexGrow: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6b7280',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: '#111827',
  },
  submitButton: {
    marginTop: 24,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: '#d1d5db',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
