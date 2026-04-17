import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Wallet, LogOut, Edit, PlusSquare, User, ShieldCheck, Trash2, Lock, Link2 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { apiGetAuth } from '../api/client';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export function ProfileScreen() {
  const { user, clearAuth, token } = useAuth() as any;
  const navigation = useNavigation();
  const [hasKyc, setHasKyc] = useState(false);
  const insets = useSafeAreaInsets();

  const menuItems = [
    {
      label: 'Register Field',
      icon: PlusSquare,
      onPress: () => navigation.navigate('MyFields' as never),
    },
    ...(user?.supadmin ? [{ label: 'Super Admin', icon: ShieldCheck, onPress: () => navigation.navigate('SuperAdmin' as never) }] : []),
    ...(hasKyc ? [{ label: 'Bookings', icon: Wallet, onPress: () => navigation.navigate('OwnerBookings' as never) }] : []),
    ...(hasKyc
      ? [{ label: 'Link To EasyPay', icon: Link2, onPress: () => navigation.navigate('LinkEasypay' as never) }]
      : []),
    {
      label: 'Profile Information',
      icon: Edit,
      onPress: () => navigation.navigate('UserInfo' as never),
    },
    {
      label: 'Banks & Wallets',
      icon: Wallet,
      onPress: () => navigation.navigate('BanksWallets' as never),
    },
    {
      label: 'Change Password',
      icon: Lock,
      onPress: () => navigation.navigate('ChangePassword' as never),
    },
    {
      label: 'Delete Account',
      icon: Trash2,
      onPress: () => navigation.navigate('DeleteAccount' as never),
    },
  ];

  const displayName = user?.name ?? (user?.email ? user.email.split('@')[0] : '');

  useEffect(() => {
    (async () => {
      try {
        if (!token) { setHasKyc(false); return; }
        const res = await apiGetAuth<{ exists: boolean }>(`/fields/kyc/me`, token as string);
        setHasKyc(!!res.exists);
      } catch (_) {
        setHasKyc(false);
      }
    })();
  }, [token]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" backgroundColor="#16a34a" />
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
            <Text style={styles.userName}>{displayName || ' '}</Text>
            <Text style={styles.userHandle}>{user?.email || ''}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {menuItems.map((item: any, index) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity key={index} style={styles.menuItem} onPress={item.onPress}>
                <View style={styles.menuIconContainer}>
                  <Icon size={20} color="#16a34a" />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>

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
          <Text style={styles.versionText}>7-aside v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Platform.OS === 'ios' ? '#f9fafb' : '#16a34a',
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
  },
  versionText: {
    fontSize: 14,
    color: '#6b7280',
  },
});