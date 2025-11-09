import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiGetAuth, apiPatchAuth } from '../../api/client';

type UserResponse = {
  id: string;
  email: string;
  username?: string | null;
  name?: string | null;
  provider?: string | null;
  providerId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function UserInfoScreen() {
  const navigation = useNavigation();
  const { token } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const usernameLocked = !!user?.username;
  const canSave = useMemo(() => {
    const next = usernameInput.trim();
    if (!token) return false;
    if (usernameLocked) return false;
    if (next.length < 3) return false;
    if (!/^[-_.a-zA-Z0-9]{3,20}$/.test(next)) return false;
    if (user && (user.username || '') === next) return false;
    return true;
  }, [token, usernameInput, user, usernameLocked]);

  useEffect(() => {
    (async () => {
      try {
        if (!token) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }
        const data = await apiGetAuth<UserResponse>('/auth/me', token as string);
        setUser(data);
        setUsernameInput(data.username || '');
      } catch (e: any) {
        setError(e.message || 'Failed to load user');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const onSave = async () => {
    if (!token || !user) return;
    try {
      setSaving(true);
      setError(null);
      const nextUsername = usernameInput.trim();
      if (nextUsername === (user.username || '')) {
        setSaving(false);
        return;
      }
      const updated = await apiPatchAuth<UserResponse>('/auth/me', { username: nextUsername }, token as string);
      setUser(updated);
      setUsernameInput(updated.username || '');
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeTop} edges={["top"]}>
      <StatusBar style="light" backgroundColor="#16a34a" />
      <View style={styles.headerBar}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => (navigation as any).goBack()}
            style={styles.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={20} color="#16a34a" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Profile Information</Text>
        <Text style={styles.headerSubtitle}>Manage your account details</Text>
      </View>

      {loading ? (
        <View style={styles.center}> 
          <ActivityIndicator size="small" color="#16a34a" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.card}>
              <InfoRow label="Name" value={user?.name || '—'} />
              <InfoRow label="Email" value={user?.email || '—'} />
              {usernameLocked ? (
                <InfoRow label="Username" value={user?.username || '—'} />
              ) : (
                <View style={styles.editRow}>
                  <Text style={styles.rowLabel}>Username</Text>
                  <TextInput
                    value={usernameInput}
                    onChangeText={setUsernameInput}
                    placeholder="Add a username"
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>
              )}
              <InfoRow label="Signup Method" value={user?.provider || '—'} />
              <InfoRow label="Joined" value={new Date(user!.createdAt).toLocaleString()} />
            </View>
            {usernameLocked ? null : (
              <>
                <TouchableOpacity onPress={onSave} disabled={!canSave || saving} style={[styles.saveButton, (!canSave || saving) && styles.saveDisabled]}>
                  <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Username'}</Text>
                </TouchableOpacity>
                {error ? <Text style={styles.errorInline}>{error}</Text> : null}
              </>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
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
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  rowValue: {
    fontSize: 14,
    color: '#111827',
    maxWidth: '60%',
    textAlign: 'right',
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#dc2626',
  },
  errorInline: {
    marginTop: 8,
    color: '#dc2626',
  },
  saveButton: {
    marginTop: 16,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});


