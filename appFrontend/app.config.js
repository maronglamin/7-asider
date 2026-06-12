// Dynamic Expo config to inject env vars into Constants.expoConfig.extra
require('dotenv').config();

const appJson = require('./app.json');

const productionApiBase = 'https://seven-aside.phantommetrics.gm';

/** Version / build for Constants — read from app.json (same source Gradle uses via JsonSlurper). */
function readExpoVersionFromAppJson() {
  const expo = appJson.expo || {};
  return {
    version: expo.version,
    versionCode: expo.android?.versionCode,
  };
}

const { version: appJsonVersion, versionCode: appJsonVersionCode } = readExpoVersionFromAppJson();

// Prefer .env API_BASE so emulator/dev can hit live server; fallback to production URL (never localhost unless you set API_BASE locally)
module.exports = ({ config }) => ({
  ...config,
  version: appJsonVersion || config.version,
  android: {
    ...(config.android || {}),
    versionCode: appJsonVersionCode ?? config.android?.versionCode,
    // Strip broad photo/video storage permissions; gallery uses Android photo picker (no READ_MEDIA_*).
    blockedPermissions: [
      ...(config.android?.blockedPermissions || []),
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  extra: {
    ...(config.extra || {}),
    API_BASE: process.env.API_BASE || productionApiBase,
    APP_VERSION: appJsonVersion || config.version || '',
    APP_BUILD: appJsonVersionCode != null ? String(appJsonVersionCode) : '',
    // Web Push: public key only (from .env). Never put WEB_PUSH_VAPID_PRIVATE_KEY here — it must stay server-side only.
    WEB_PUSH_VAPID_PUBLIC_KEY: (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim(),
    GOOGLE_WEB_CLIENT_ID: (
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      (config.extra || {}).GOOGLE_WEB_CLIENT_ID ||
      ''
    ).trim(),
    GOOGLE_IOS_CLIENT_ID: (
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
      (config.extra || {}).GOOGLE_IOS_CLIENT_ID ||
      ''
    ).trim(),
    GOOGLE_ANDROID_CLIENT_ID: (
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
      (config.extra || {}).GOOGLE_ANDROID_CLIENT_ID ||
      ''
    ).trim(),
  },
  plugins: [
    ...(config.plugins || []),
    'expo-web-browser',
    '@react-native-community/datetimepicker',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission:
          'To attach photos when uploading payment receipts for bookings or adding images of your field for listing. Photos are only used for these features.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#16a34a',
        sounds: [],
      },
    ],
  ],
});
