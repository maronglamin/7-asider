import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert, AppState, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import 'react-native-gesture-handler';

// Import screens
import { MatchesScreen } from './src/screens/MatchesScreen';
import { BookScreen } from './src/screens/BookScreen';
import { SquadsScreen } from './src/screens/SquadsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { BookingScreen } from './src/screens/BookingScreen';
import { RegisterFieldScreen, FieldDetailScreen } from './src/screens/fieldKyc';
import FindFieldScreen from './src/screens/FindFieldScreen';
import CustomerBookedDetails from './src/screens/CustomerBookedDetails';
import OwnerBookingsScreen from './src/screens/fieldAssetOwner/OwnerBookingsScreen';
import OwnerBookingDetail from './src/screens/fieldAssetOwner/OwnerBookingDetail';
import MyFieldsScreen from './src/screens/fieldKyc/MyFieldsScreen';
import UserInfoScreen from './src/screens/userInfo/UserInfoScreen';
import SuperAdminScreen from './src/screens/admin/SuperAdminScreen';
import AdminUsersScreen from './src/screens/admin/AdminUsersScreen';
import AssetOwnersScreen from './src/screens/admin/AssetOwnersScreen';
import FieldDetailAdminScreen from './src/screens/admin/FieldDetailAdminScreen';
import AdminBookingsScreen from './src/screens/admin/AdminBookingsScreen';
import AdminBookingsListScreen from './src/screens/admin/AdminBookingsListScreen';
import UsersScreen from './src/screens/admin/UsersScreen';
import BanksWalletsScreen from './src/screens/BanksWalletsScreen';
import DeleteAccountScreen from './src/screens/DeleteAccountScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import LinkEasypayScreen from './src/screens/LinkEasypayScreen';

// Import auth screens
import { OnboardingScreen } from './src/screens/auth/OnboardingScreen';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { RegisterScreen } from './src/screens/auth/RegisterScreen';
import { EmailLoginScreen } from './src/screens/auth/EmailLoginScreen';
import { ForgotPasswordScreen } from './src/screens/auth/ForgotPasswordScreen';

// Import components
import { BottomTabBar } from './src/components/BottomTabBar';
import { AppReleaseSheet, ReleaseNotice } from './src/components/AppReleaseSheet';
import { AuthProvider } from './src/context/AuthContext';
import { apiGet } from './src/api/client';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

type ReleaseResponse = ReleaseNotice & {
  currentVersion?: string | null;
  currentBuild?: string | null;
};

function getCurrentReleaseInfo() {
  const extra = (Constants?.expoConfig?.extra as any) || {};
  const version = String(
    Constants?.['nativeAppVersion']
      || extra.APP_VERSION
      || Constants?.expoConfig?.version
      || ''
  ).trim();
  const build = String(
    Constants?.['nativeBuildVersion']
      || extra.APP_BUILD
      || ''
  ).trim();

  return { version, build };
}

function getReleaseKey(notice: ReleaseNotice | null): string {
  if (!notice) return '';
  return `${notice.mode}:${notice.latestVersion || ''}:${notice.latestBuild || ''}`;
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen 
        name="Matches" 
        component={MatchesScreen}
        options={{
          tabBarLabel: 'Matches',
        }}
      />
      <Tab.Screen 
        name="Book" 
        component={BookScreen}
        options={{
          tabBarLabel: 'Book',
        }}
      />
      <Tab.Screen 
        name="Squads" 
        component={SquadsScreen}
        options={{
          tabBarLabel: 'Squads',
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [releaseNotice, setReleaseNotice] = useState<ReleaseNotice | null>(null);
  const checkingReleaseRef = useRef(false);
  const dismissedReleaseKeyRef = useRef('');

  const releasePath = useMemo(() => {
    const { version, build } = getCurrentReleaseInfo();
    const params = [`platform=${encodeURIComponent(Platform.OS)}`];
    if (version) params.push(`version=${encodeURIComponent(version)}`);
    if (build) params.push(`build=${encodeURIComponent(build)}`);
    return `/app/release?${params.join('&')}`;
  }, []);

  const checkRelease = useCallback(async () => {
    if (checkingReleaseRef.current) return;
    checkingReleaseRef.current = true;

    try {
      const response = await apiGet<ReleaseResponse>(releasePath);
      if (!response.updateAvailable) {
        setReleaseNotice(null);
        return;
      }

      const nextNotice: ReleaseNotice = {
        mode: response.mode,
        updateAvailable: response.updateAvailable,
        forceUpdate: response.forceUpdate,
        title: response.title,
        message: response.message,
        storeUrl: response.storeUrl,
        latestVersion: response.latestVersion,
        latestBuild: response.latestBuild,
      };

      const releaseKey = getReleaseKey(nextNotice);
      if (!response.forceUpdate && dismissedReleaseKeyRef.current === releaseKey) return;
      setReleaseNotice(nextNotice);
    } catch (error) {
      console.log('[App] release check skipped', error);
    } finally {
      checkingReleaseRef.current = false;
    }
  }, [releasePath]);

  useEffect(() => {
    checkRelease();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkRelease();
    });

    return () => {
      subscription.remove();
    };
  }, [checkRelease]);

  const handleDismissRelease = useCallback(() => {
    if (!releaseNotice || releaseNotice.forceUpdate) return;
    dismissedReleaseKeyRef.current = getReleaseKey(releaseNotice);
    setReleaseNotice(null);
  }, [releaseNotice]);

  const handleUpdateRelease = useCallback(async () => {
    const url = String(releaseNotice?.storeUrl || '').trim();
    if (!url) {
      Alert.alert('Update link missing', 'The update link is not configured yet.');
      return;
    }

    try {
      await Linking.openURL(url);
    } catch (_error) {
      Alert.alert('Unable to open update link', 'Please try again in a moment.');
    }
  }, [releaseNotice?.storeUrl]);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" backgroundColor="#16a34a" />
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
            }}
            initialRouteName="Onboarding"
          >
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="EmailLogin" component={EmailLoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Booking" component={BookingScreen} />
            <Stack.Screen name="MyFields" component={MyFieldsScreen} />
            <Stack.Screen name="RegisterField" component={RegisterFieldScreen} />
            <Stack.Screen name="FieldDetail" component={FieldDetailScreen} />
          <Stack.Screen name="FindField" component={FindFieldScreen} />
          <Stack.Screen name="CustomerBookedDetails" component={CustomerBookedDetails} />
          <Stack.Screen name="OwnerBookings" component={OwnerBookingsScreen} />
          <Stack.Screen name="OwnerBookingDetail" component={OwnerBookingDetail} />
          <Stack.Screen name="UserInfo" component={UserInfoScreen} />
          <Stack.Screen name="SuperAdmin" component={SuperAdminScreen} />
          <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
          <Stack.Screen name="AssetOwners" component={AssetOwnersScreen} />
          <Stack.Screen name="FieldDetailAdmin" component={FieldDetailAdminScreen} />
          <Stack.Screen name="AdminBookings" component={AdminBookingsScreen} />
          <Stack.Screen name="AdminBookingsList" component={AdminBookingsListScreen} />
          <Stack.Screen name="Users" component={UsersScreen} />
          <Stack.Screen name="BanksWallets" component={BanksWalletsScreen} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <Stack.Screen name="LinkEasypay" component={LinkEasypayScreen} />
          <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        <AppReleaseSheet
          notice={releaseNotice}
          onDismiss={handleDismissRelease}
          onUpdate={handleUpdateRelease}
        />
      </AuthProvider>
    </SafeAreaProvider>
  );
}