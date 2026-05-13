import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiGet, apiPostAuth } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof atob !== 'undefined' ? atob(base64) : '';
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerWebPush(authToken: string): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    await navigator.serviceWorker.ready;
  } catch {
    return;
  }

  const fromConfig = String((Constants.expoConfig?.extra as any)?.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  let publicKey: string | null = fromConfig || null;
  if (!publicKey) {
    const res = await apiGet<{ publicKey: string | null }>('/push/vapid-public-key');
    publicKey = res.publicKey;
  }
  if (!publicKey) {
    await tryExpoTokenOnWeb(authToken);
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const perm = typeof Notification !== 'undefined' ? await Notification.requestPermission() : 'denied';
    if (perm !== 'granted') return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await apiPostAuth('/push/register', { channel: 'web_push', token: JSON.stringify(sub.toJSON()) }, authToken);
  } catch (e) {
    console.log('[push] web_push register failed', e);
    await tryExpoTokenOnWeb(authToken);
  }
}

async function tryExpoTokenOnWeb(authToken: string): Promise<void> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    if (!projectId) return;
    const res = await Notifications.getExpoPushTokenAsync({ projectId: String(projectId) });
    await apiPostAuth('/push/register', { channel: 'expo', token: res.data }, authToken);
  } catch {
    /* optional path */
  }
}

/**
 * Play Store–friendly disclosure before the Android POST_NOTIFICATIONS prompt.
 * Returns true only if the user chooses to continue to the system permission dialog.
 */
function confirmAndroidNotificationDisclosure(): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(true);
  const appName = String(Constants.expoConfig?.name || '7a-side').trim() || '7a-side';
  return new Promise((resolve) => {
    Alert.alert(
      'Booking alerts',
      `${appName} uses notifications only to tell you about booking activity that may need your attention — for example when a customer books or reschedules time at a field you manage.\n\n` +
        'This permission is optional. You can tap Not now and keep using the app, or allow alerts and change your choice anytime in Android Settings → Apps → ' +
        appName +
        ' → Notifications.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Allow notifications', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

async function registerNativeExpo(authToken: string): Promise<void> {
  if (!Device.isDevice) return;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let st = existing;
  if (st !== 'granted') {
    if (Platform.OS === 'android') {
      const proceed = await confirmAndroidNotificationDisclosure();
      if (!proceed) return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    st = status;
  }
  if (st !== 'granted') return;
  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
  if (!projectId) {
    console.log('[push] missing eas.projectId in app config');
    return;
  }
  const res = await Notifications.getExpoPushTokenAsync({ projectId: String(projectId) });
  await apiPostAuth('/push/register', { channel: 'expo', token: res.data }, authToken);
}

/**
 * Registers this device for the signed-in user so the backend can send alerts (e.g. new booking for field owners).
 * Safe to call on every session; duplicates upsert on the server.
 */
export async function registerOwnerPushForCurrentSession(authToken: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await registerWebPush(authToken);
      return;
    }
    await registerNativeExpo(authToken);
  } catch (e) {
    console.log('[push] register skipped', e);
  }
}
