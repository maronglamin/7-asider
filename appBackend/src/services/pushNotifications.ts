import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import webpush from 'web-push';
import { prisma } from '../db/prisma';

const expo = new Expo();

const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT || 'mailto:support@seven-aside.local';
const WEB_PUSH_PUBLIC = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
const WEB_PUSH_PRIVATE = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';

let webPushConfigured = false;
if (WEB_PUSH_PUBLIC && WEB_PUSH_PRIVATE) {
  try {
    webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC, WEB_PUSH_PRIVATE);
    webPushConfigured = true;
  } catch (e) {
    console.warn('[push] web-push VAPID init failed', e);
  }
} else if (WEB_PUSH_PUBLIC && !WEB_PUSH_PRIVATE) {
  console.warn(
    '[push] WEB_PUSH_VAPID_PUBLIC_KEY is set but WEB_PUSH_VAPID_PRIVATE_KEY is missing. Browsers can subscribe, but web push cannot be sent until the private key is configured on this server.',
  );
} else if (!WEB_PUSH_PUBLIC && WEB_PUSH_PRIVATE) {
  console.warn('[push] WEB_PUSH_VAPID_PRIVATE_KEY is set but WEB_PUSH_VAPID_PUBLIC_KEY is missing — web push is disabled.');
}

export function isWebPushConfigured(): boolean {
  return webPushConfigured;
}

/** Public key for PushManager.subscribe (browser / PWA). Does not require the private key to be present. */
export function getVapidPublicKeyForClient(): string | null {
  const k = String(WEB_PUSH_PUBLIC || '').trim();
  return k.length ? k : null;
}

export type BookingPushOpenAs = 'owner' | 'customer';

export type BookingPushData = {
  type: string;
  bookingId: string;
  openAs: BookingPushOpenAs;
};

function pushDataForTransport(data: BookingPushData): Record<string, string> {
  return {
    type: String(data.type),
    bookingId: String(data.bookingId),
    openAs: data.openAs === 'customer' ? 'customer' : 'owner',
  };
}

async function sendPushToUser(userId: string, title: string, body: string, data: BookingPushData) {
  const devices = await prisma.pushDevice.findMany({
    where: { userId },
    select: { id: true, channel: true, token: true },
  });

  const transport = pushDataForTransport(data);
  const expoMessages: ExpoPushMessage[] = [];
  const webSubs: { id: string; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }[] = [];

  let webPushDevicesSkipped = 0;
  for (const d of devices) {
    if (d.channel === 'EXPO' && Expo.isExpoPushToken(d.token)) {
      expoMessages.push({
        to: d.token,
        sound: 'default',
        title,
        body,
        data: transport,
      });
    } else if (d.channel === 'WEB_PUSH') {
      if (!webPushConfigured) {
        webPushDevicesSkipped += 1;
        continue;
      }
      try {
        const parsed = JSON.parse(d.token) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (parsed?.endpoint && parsed?.keys?.p256dh && parsed?.keys?.auth) {
          webSubs.push({
            id: d.id,
            subscription: {
              endpoint: parsed.endpoint,
              keys: { p256dh: parsed.keys.p256dh, auth: parsed.keys.auth },
            },
          });
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  if (webPushDevicesSkipped > 0) {
    console.warn(
      `[push] skipped ${webPushDevicesSkipped} web_push device(s) for user ${userId}: set WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY (and WEB_PUSH_SUBJECT) so web-push can send.`,
    );
  }

  if (expoMessages.length) {
    const chunks = expo.chunkPushNotifications(expoMessages);
    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((t, i) => {
          if (t.status === 'error') {
            console.warn('[push] expo ticket error', t.message, chunk[i]?.to);
          }
        });
      } catch (e) {
        console.warn('[push] expo send batch failed', e);
      }
    }
  }

  if (webSubs.length) {
    const payload = JSON.stringify({
      title,
      body,
      data: transport,
    });
    await Promise.allSettled(
      webSubs.map(async ({ id, subscription }) => {
        try {
          await webpush.sendNotification(subscription, payload, { TTL: 86_400 });
        } catch (e: any) {
          const code = e?.statusCode;
          if (code === 404 || code === 410) {
            await prisma.pushDevice.delete({ where: { id } }).catch(() => {});
          } else {
            console.warn('[push] web-push send failed', code, e?.message);
          }
        }
      }),
    );
  }
}

/** Field owner + booker (actor), deduped when they are the same user. */
export async function notifyNewBookingPushes(params: {
  fieldOwnerUserId: string | null | undefined;
  bookerUserId: string;
  fieldName: string;
  bookingId: string;
  bookerLabel: string;
}): Promise<void> {
  const { fieldOwnerUserId, bookerUserId, fieldName, bookingId, bookerLabel } = params;
  const field = fieldName || 'Field';
  const ownerId = fieldOwnerUserId || null;

  if (ownerId && ownerId === bookerUserId) {
    await sendPushToUser(bookerUserId, 'Booking confirmed', `You're booked at "${field}".`, {
      type: 'NEW_BOOKING',
      bookingId: String(bookingId),
      openAs: 'customer',
    });
    return;
  }

  if (ownerId) {
    await sendPushToUser(ownerId, 'New booking', `${bookerLabel} booked "${field}".`, {
      type: 'NEW_BOOKING',
      bookingId: String(bookingId),
      openAs: 'owner',
    });
  }
  await sendPushToUser(bookerUserId, 'Booking confirmed', `You booked "${field}".`, {
    type: 'NEW_BOOKING',
    bookingId: String(bookingId),
    openAs: 'customer',
  });
}

export async function notifyReschedulePushes(params: {
  fieldOwnerUserId: string | null | undefined;
  bookerUserId: string;
  fieldName: string;
  bookingId: string;
  bookerLabel: string;
}): Promise<void> {
  const { fieldOwnerUserId, bookerUserId, fieldName, bookingId, bookerLabel } = params;
  const field = fieldName || 'Field';
  const ownerId = fieldOwnerUserId || null;

  if (ownerId && ownerId === bookerUserId) {
    await sendPushToUser(bookerUserId, 'Booking updated', `Your booking at "${field}" was rescheduled.`, {
      type: 'BOOKING_RESCHEDULED',
      bookingId: String(bookingId),
      openAs: 'customer',
    });
    return;
  }

  if (ownerId) {
    await sendPushToUser(ownerId, 'Booking rescheduled', `${bookerLabel} rescheduled a booking at "${field}".`, {
      type: 'BOOKING_RESCHEDULED',
      bookingId: String(bookingId),
      openAs: 'owner',
    });
  }
  await sendPushToUser(bookerUserId, 'Booking updated', `Your booking at "${field}" was rescheduled.`, {
    type: 'BOOKING_RESCHEDULED',
    bookingId: String(bookingId),
    openAs: 'customer',
  });
}

export async function notifyBookingCancelledPushes(params: {
  fieldOwnerUserId: string | null | undefined;
  bookerUserId: string;
  fieldName: string;
  bookingId: string;
  bookerLabel: string;
}): Promise<void> {
  const { fieldOwnerUserId, bookerUserId, fieldName, bookingId, bookerLabel } = params;
  const field = fieldName || 'Field';
  const ownerId = fieldOwnerUserId || null;

  if (ownerId && ownerId === bookerUserId) {
    await sendPushToUser(bookerUserId, 'Booking cancelled', `Your booking at "${field}" has been cancelled.`, {
      type: 'BOOKING_CANCELLED',
      bookingId: String(bookingId),
      openAs: 'customer',
    });
    return;
  }

  if (ownerId) {
    await sendPushToUser(ownerId, 'Booking cancelled', `${bookerLabel} cancelled a booking at "${field}".`, {
      type: 'BOOKING_CANCELLED',
      bookingId: String(bookingId),
      openAs: 'owner',
    });
  }
  await sendPushToUser(bookerUserId, 'Booking cancelled', `Your booking at "${field}" has been cancelled.`, {
    type: 'BOOKING_CANCELLED',
    bookingId: String(bookingId),
    openAs: 'customer',
  });
}
