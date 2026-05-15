import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert, AppState, InteractionManager, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

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
import ContractInvitationScreen from './src/screens/admin/ContractInvitationScreen';
import ContractInvitationsListScreen from './src/screens/admin/ContractInvitationsListScreen';
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
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { apiGet } from './src/api/client';
import { registerServiceWorker } from './src/pwa/registerServiceWorker';
import { installWebDocumentLayout, installWebNativeCompat } from './src/utils/webNativeCompat';
import { navigationRef, onNavigationContainerReady, flushPendingOwnerBookingNavigation } from './src/navigation/navigationRef';
import { getNavigationLinking } from './src/navigation/linking';
import { PushDeepLinkHandler } from './src/navigation/PushDeepLinkHandler';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

installWebDocumentLayout();
installWebNativeCompat();
registerServiceWorker();

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

type AppErrorBoundaryState = { hasError: boolean; message?: string };

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  override componentDidCatch(error: Error) {
    console.error('[App] uncaught render error', error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <View style={appErrorStyles.container}>
          <Text style={appErrorStyles.title}>Something went wrong</Text>
          {this.state.message ? (
            <Text style={appErrorStyles.detail}>{this.state.message}</Text>
          ) : null}
        </View>
      );
    }
    return this.props.children;
  }
}

const appErrorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  detail: { color: '#dcfce7', fontSize: 14 },
});

const appShellStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#f9fafb' : '#16a34a',
    ...(Platform.OS === 'web'
      ? ({
          alignItems: 'center',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          minHeight: 0,
          height: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
        } as const)
      : null),
  },
  shell: {
    flex: 1,
    width: '100%',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web'
      ? ({
          maxWidth: 1180,
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          height: '100%',
          maxHeight: '100%',
          alignSelf: 'center',
          shadowColor: '#000000',
          shadowOpacity: 0.08,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 6 },
        } as any)
      : null),
  },
  /** Fills #root so NavigationContainer + tab scenes get a bounded height on RN-web (mobile PWA). */
  webNavHost: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    height: '100%',
    maxHeight: '100%',
  },
});

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      sceneContainerStyle={Platform.OS === 'web' ? { flex: 1, minHeight: 0, minWidth: 0 } : undefined}
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

function RootNavigator() {
  const { user, token } = useAuth();
  const initialRouteName = user && token ? 'Main' : 'Onboarding';
  const linking = useMemo(() => getNavigationLinking(), []);

  useEffect(() => {
    if (user && token) {
      flushPendingOwnerBookingNavigation();
    }
  }, [user, token]);

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      onReady={onNavigationContainerReady}
    >
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            ...(Platform.OS === 'web'
              ? { cardStyle: { flex: 1, minHeight: 0, minWidth: 0 } as const }
              : {}),
          }}
          initialRouteName={initialRouteName}
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
        <Stack.Screen name="ContractInvitation" component={ContractInvitationScreen} />
        <Stack.Screen name="ContractInvitationsList" component={ContractInvitationsListScreen} />
        <Stack.Screen name="BanksWallets" component={BanksWalletsScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="LinkEasypay" component={LinkEasypayScreen} />
        <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
      </Stack.Navigator>
      <PushDeepLinkHandler />
      </View>
    </NavigationContainer>
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

      const isWeb = Platform.OS === 'web';
      const nextNotice: ReleaseNotice = {
        mode: isWeb ? 'none' : response.mode,
        updateAvailable: isWeb ? false : response.updateAvailable,
        forceUpdate: isWeb ? false : response.forceUpdate,
        title: response.title,
        message: response.message,
        storeUrl: response.storeUrl,
        latestVersion: response.latestVersion,
        latestBuild: response.latestBuild,
      };

      if (!nextNotice.updateAvailable) {
        setReleaseNotice(null);
        return;
      }

      const releaseKey = getReleaseKey(nextNotice);
      if (!nextNotice.forceUpdate && dismissedReleaseKeyRef.current === releaseKey) return;
      setReleaseNotice(nextNotice);
    } catch (error) {
      console.log('[App] release check skipped', error);
    } finally {
      checkingReleaseRef.current = false;
    }
  }, [releasePath]);

  useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      checkRelease();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkRelease();
    });

    return () => {
      interaction.cancel?.();
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
    <AppErrorBoundary>
    <GestureHandlerRootView style={appShellStyles.root}>
      <View style={appShellStyles.shell}>
        <SafeAreaProvider>
          <View style={Platform.OS === 'web' ? appShellStyles.webNavHost : { flex: 1 }}>
            <AuthProvider>
              <RootNavigator />
              <AppReleaseSheet
                notice={releaseNotice}
                onDismiss={handleDismissRelease}
                onUpdate={handleUpdateRelease}
              />
            </AuthProvider>
          </View>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}