import { Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { getAppPublicUrl, PRODUCTION_APP_PUBLIC_URL } from '../lib/app-public-url';

export function getNavigationLinking() {
  const prefixes = [
    ExpoLinking.createURL('/'),
    getAppPublicUrl(),
    PRODUCTION_APP_PUBLIC_URL,
  ];
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    if (!prefixes.includes(window.location.origin)) {
      prefixes.push(window.location.origin);
    }
  }

  return {
    prefixes: [...new Set(prefixes.filter(Boolean))],
    config: {
      screens: {
        OwnerBookingDetail: 'owner-booking/:bookingId',
        CustomerBookedDetails: 'my-booking/:bookingId',
        Booking: 'book/:fieldId',
        FieldAdvert: 'field/:fieldId',
        JoinSquad: 'join/:code',
        SquadDetail: 'squad/:squadId',
        ChallengeAccept: 'challenge/:token',
        ManageFieldInvite: 'manage-invite/:token',
      },
    },
  };
}
