import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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

// Import auth screens
import { OnboardingScreen } from './src/screens/auth/OnboardingScreen';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { RegisterScreen } from './src/screens/auth/RegisterScreen';
import { EmailLoginScreen } from './src/screens/auth/EmailLoginScreen';

// Import components
import { BottomTabBar } from './src/components/BottomTabBar';
import { AuthProvider } from './src/context/AuthContext';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

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
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}