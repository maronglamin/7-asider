import { Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';

export function getNavigationLinking() {
  const prefixes = [ExpoLinking.createURL('/')];
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    if (!prefixes.includes(window.location.origin)) {
      prefixes.push(window.location.origin);
    }
  }

  return {
    prefixes,
    config: {
      screens: {
        OwnerBookingDetail: 'owner-booking/:bookingId',
      },
    },
  };
}
