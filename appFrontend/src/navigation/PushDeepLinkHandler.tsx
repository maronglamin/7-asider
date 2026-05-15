import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { navigateToBookingFromPush } from './navigationRef';

function extractBookingIdFromNotificationData(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const raw = data['bookingId'];
  if (raw == null) return undefined;
  return String(raw).trim() || undefined;
}

function openAsFromNotificationData(data: Record<string, unknown> | undefined): 'owner' | 'customer' {
  if (data?.['openAs'] === 'customer') return 'customer';
  return 'owner';
}

/**
 * Handles native/push notification opens and web service worker postMessage → booking detail.
 * Must render under NavigationContainer.
 */
export function PushDeepLinkHandler() {
  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification?.request?.content?.data as Record<string, unknown> | undefined;
      const id = extractBookingIdFromNotificationData(data);
      if (id) navigateToBookingFromPush(id, openAsFromNotificationData(data));
    };

    void Notifications.getLastNotificationResponseAsync().then(handleResponse);

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }
    const onMessage = (event: MessageEvent) => {
      const d = event.data;
      if (d && typeof d === 'object') {
        if (d.type === 'OPEN_BOOKING_PUSH' && d.bookingId) {
          navigateToBookingFromPush(String(d.bookingId), d.openAs);
        } else if (d.type === 'OPEN_OWNER_BOOKING' && d.bookingId) {
          navigateToBookingFromPush(String(d.bookingId), 'owner');
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return null;
}
