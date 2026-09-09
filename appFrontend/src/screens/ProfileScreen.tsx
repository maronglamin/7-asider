import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { Wallet, LogOut, Edit, PlusSquare, User, ShieldCheck, Trash2, Lock, Link2, RefreshCw, KeyRound, Smartphone, LifeBuoy } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { needsDisplayName, useAuth } from '../context/AuthContext';
import { apiGetAuth, apiPatchAuth } from '../api/client';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export function ProfileScreen() {
  const { user, clearAuth, token, updateUser } = useAuth();
  const navigation = useNavigation();
  const [ownsFields, setOwnsFields] = useState(false);
  const [managesFields, setManagesFields] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const insets = useSafeAreaInsets();
  const needsName = needsDisplayName(user);

  const handleCheckForUpdate = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Web app updates', 'The PWA updates automatically when a new web version is deployed. Refresh the page to load the latest version.');
      return;
    }

    if (!Updates.isEnabled) {
      Alert.alert(
        'Updates unavailable',
        'Live updates are not enabled in this build. Install the app from the Play Store for the production version.',
      );
      return;
    }
    setUpdateBusy(true);
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        Alert.alert('Up to date', 'You already have the latest version.');
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert(
        'Update downloaded',
        'Restart now to apply the latest version. If you choose Later, the update will apply the next time you fully close and reopen the app.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Restart now',
            onPress: () => {
              Updates.reloadAsync();
            },
          },
        ],
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Please try again in a moment.';
      Alert.alert('Update check failed', message);
    } finally {
      setUpdateBusy(false);
    }
  };

  const menuItems = [
    {
      label: 'Register Field',
      icon: PlusSquare,
      onPress: () => navigation.navigate('MyFields' as never),
    },
    ...(user?.supadmin ? [{ label: 'Super Admin', icon: ShieldCheck, onPress: () => navigation.navigate('SuperAdmin' as never) }] : []),
    ...(ownsFields || managesFields ? [{ label: 'Bookings', icon: Wallet, onPress: () => navigation.navigate('OwnerBookings' as never) }] : []),
    ...(ownsFields
      ? [{ label: 'Link To directPay', icon: Link2, onPress: () => navigation.navigate('LinkEasypay' as never) }]
      : []),
    {
      label: 'Profile Information',
      icon: Edit,
      onPress: () => navigation.navigate('UserInfo' as never),
    },
    {
      label: 'Help & Support',
      icon: LifeBuoy,
      onPress: () => navigation.navigate('HelpSupport' as never),
    },
    {
      label: user?.appLockType === 'pin' ? 'Change PIN' : 'Set PIN',
      icon: KeyRound,
      onPress: () =>
        navigation.navigate((user?.appLockType === 'pin' ? 'VerifyPin' : 'SetPin') as never),
    },
    {
      label: 'Device lock',
      icon: Smartphone,
      onPress: () => navigation.navigate('DeviceLock' as never),
    },
    {
      label: 'Banks & Wallets',
      icon: Wallet,
      onPress: () => navigation.navigate('BanksWallets' as never),
    },
    ...(user?.hasPassword
      ? [
          {
            label: 'Change Password',
            icon: Lock,
            onPress: () => navigation.navigate('ChangePassword' as never),
          },
        ]
      : []),
    ...(Updates.isEnabled
      ? [
          {
            label: 'Check for app update',
            icon: RefreshCw,
            onPress: handleCheckForUpdate,
            disabledWhile: updateBusy,
          },
        ]
      : []),
    {
      label: 'Delete Account',
      icon: Trash2,
      onPress: () => navigation.navigate('DeleteAccount' as never),
    },
  ];

  const displayName = user?.name?.trim() || 'Complete your profile';

  const saveName = async () => {
    const next = nameInput.trim();
    if (next.length < 2) {
      setNameError('Enter your full name');
      return;
    }
    if (!token) return;
    setSavingName(true);
    setNameError('');
    try {
      const updated = await apiPatchAuth<{ name?: string | null }>('/auth/me', { name: next }, token);
      updateUser({ name: updated.name ?? next });
    } catch (e: any) {
      setNameError(e.message || 'Could not save your name');
    } finally {
      setSavingName(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!token) {
          setOwnsFields(false);
          setManagesFields(false);
          return;
        }
        const res = await apiGetAuth<{ exists: boolean; ownsFields?: boolean; managesFields?: boolean }>(`/fields/kyc/me`, token as string);
        setOwnsFields(!!res.ownsFields || !!res.exists);
        setManagesFields(!!res.managesFields);
      } catch (_) {
        setOwnsFields(false);
        setManagesFields(false);
      }
    })();
  }, [token]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      {/* Header with Profile Info */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.profileInfo}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarIcon}>
              <User size={40} color="#16a34a" />
            </View>
            {!!user?.supadmin && (
              <View style={styles.supBadge}>
                <ShieldCheck size={14} color="#ffffff" />
              </View>
            )}
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName}</Text>
            <Text style={styles.userHandle}>{user?.email || ''}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={[styles.content, Platform.OS === 'web' ? { minHeight: 0, minWidth: 0 } : null]} showsVerticalScrollIndicator={false}>
        {needsName ? (
          <View style={styles.onboardingCard}>
            <Text style={styles.onboardingTitle}>Complete your profile</Text>
            <Text style={styles.onboardingBody}>
              Add your name so teammates and field owners know who you are.
            </Text>
            <Text style={styles.inputLabel}>Full name</Text>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={(value) => {
                setNameInput(value);
                setNameError('');
              }}
              placeholder="Your name"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
              autoFocus
            />
            {nameError ? <Text style={styles.nameError}>{nameError}</Text> : null}
            <TouchableOpacity
              style={[styles.saveNameButton, (savingName || nameInput.trim().length < 2) && styles.saveNameDisabled]}
              onPress={saveName}
              disabled={savingName || nameInput.trim().length < 2}
            >
              {savingName ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveNameText}>Save and continue</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.menuContainer}>
            {menuItems.map((item: any, index) => {
              const Icon = item.icon;
              const busy = item.disabledWhile;
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.menuItem, busy ? styles.menuItemDisabled : null]}
                  onPress={item.onPress}
                  disabled={!!busy}
                >
                  <View style={styles.menuIconContainer}>
                    {busy ? (
                      <ActivityIndicator size="small" color="#16a34a" />
                    ) : (
                      <Icon size={20} color="#16a34a" />
                    )}
                  </View>
                  <Text style={styles.menuLabel}>{busy ? 'Checking for update…' : item.label}</Text>
                  {!busy ? <Text style={styles.menuArrow}>›</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Logout Button */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => {
              clearAuth();
              (navigation as any).reset({ index: 0, routes: [{ name: 'Onboarding' }] });
            }}
          >
            <LogOut size={20} color="#dc2626" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>7-aside v1.0.1</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  supBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#16a34a',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  userHandle: {
    fontSize: 16,
    color: '#dcfce7',
    marginBottom: 4,
  },
  userLocation: {
    fontSize: 14,
    color: '#dcfce7',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    color: '#dcfce7',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  menuContainer: {
    padding: 16,
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          alignSelf: 'center',
          width: '100%',
          maxWidth: 640,
        } as any)
      : null),
  },
  onboardingCard: {
    margin: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'web'
      ? ({
          alignSelf: 'center',
          width: '100%',
          maxWidth: 640,
        } as any)
      : null),
  },
  onboardingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  onboardingBody: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 22,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  nameError: {
    marginTop: 8,
    color: '#dc2626',
    fontSize: 13,
  },
  saveNameButton: {
    marginTop: 16,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveNameDisabled: {
    backgroundColor: '#d1d5db',
  },
  saveNameText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  menuItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  menuItemDisabled: {
    opacity: 0.85,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    backgroundColor: '#dcfce7',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  menuArrow: {
    fontSize: 20,
    color: '#9ca3af',
  },
  logoutContainer: {
    padding: 16,
    ...(Platform.OS === 'web'
      ? ({
          alignSelf: 'center',
          width: '100%',
          maxWidth: 640,
        } as any)
      : null),
  },
  logoutButton: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  logoutText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
  versionContainer: {
    alignItems: 'center',
    paddingBottom: 24,
    ...(Platform.OS === 'web'
      ? ({
          alignSelf: 'center',
          width: '100%',
          maxWidth: 640,
        } as any)
      : null),
  },
  versionText: {
    fontSize: 14,
    color: '#6b7280',
  },
});