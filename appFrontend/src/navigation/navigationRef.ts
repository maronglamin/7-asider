import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

let pendingOwnerBookingId: string | null = null;

/** Call from `NavigationContainer` `onReady` (and after login) to open a queued owner booking. */
export function flushPendingOwnerBookingNavigation() {
  if (!pendingOwnerBookingId || !navigationRef.isReady()) return;
  const id = pendingOwnerBookingId;
  try {
    (navigationRef as any).navigate('OwnerBookingDetail', { bookingId: id });
    pendingOwnerBookingId = null;
  } catch (e) {
    console.warn('[nav] OwnerBookingDetail navigate failed', e);
  }
}

/** Queue navigation to owner booking detail (used by push / service worker). Waits until nav is ready. */
export function navigateToOwnerBookingFromPush(bookingId: string) {
  const id = String(bookingId || '').trim();
  if (!id) return;
  pendingOwnerBookingId = id;
  flushPendingOwnerBookingNavigation();
}

export function onNavigationContainerReady() {
  flushPendingOwnerBookingNavigation();
}
