import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

type PendingBookingPush = { bookingId: string; openAs: 'owner' | 'customer' };
let pendingBookingPush: PendingBookingPush | null = null;

function flushPendingBookingPushNavigation() {
  if (!pendingBookingPush || !navigationRef.isReady()) return;
  const { bookingId, openAs } = pendingBookingPush;
  try {
    if (openAs === 'customer') {
      (navigationRef as any).navigate('CustomerBookedDetails', {
        bookingId,
        booking: { id: bookingId },
      });
    } else {
      (navigationRef as any).navigate('OwnerBookingDetail', { bookingId });
    }
    pendingBookingPush = null;
  } catch (e) {
    console.warn('[nav] booking push navigate failed', e);
  }
}

/** @deprecated use navigateToBookingFromPush */
export function flushPendingOwnerBookingNavigation() {
  flushPendingBookingPushNavigation();
}

/**
 * Queue navigation from a booking push (native or service worker).
 * `openAs` controls which detail screen opens; defaults to owner (field) view.
 */
export function navigateToBookingFromPush(bookingId: string, openAsRaw?: unknown) {
  const id = String(bookingId || '').trim();
  if (!id) return;
  const openAs = openAsRaw === 'customer' ? 'customer' : 'owner';
  pendingBookingPush = { bookingId: id, openAs };
  flushPendingBookingPushNavigation();
}

/** @deprecated use navigateToBookingFromPush(bookingId, 'owner') */
export function navigateToOwnerBookingFromPush(bookingId: string) {
  navigateToBookingFromPush(bookingId, 'owner');
}

export function onNavigationContainerReady() {
  flushPendingBookingPushNavigation();
}
