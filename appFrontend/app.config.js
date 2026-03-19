// Dynamic Expo config to inject env vars into Constants.expoConfig.extra
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const productionApiBase = 'https://seven-aside.phantommetrics.gm';
const androidBuildGradlePath = path.join(__dirname, 'android', 'app', 'build.gradle');

function readAndroidVersionInfo() {
  try {
    const buildGradle = fs.readFileSync(androidBuildGradlePath, 'utf8');
    const versionName = buildGradle.match(/versionName\s+"([^"]+)"/)?.[1];
    const versionCode = buildGradle.match(/versionCode\s+(\d+)/)?.[1];
    return {
      versionName: versionName || undefined,
      versionCode: versionCode ? Number(versionCode) : undefined,
    };
  } catch (_error) {
    return {};
  }
}

const androidVersionInfo = readAndroidVersionInfo();
// Prefer .env API_BASE so emulator/dev can hit live server; fallback to production URL (never localhost unless you set API_BASE locally)
module.exports = ({ config }) => ({
  ...config,
  version: androidVersionInfo.versionName || config.version,
  android: {
    ...(config.android || {}),
    versionCode: androidVersionInfo.versionCode || config.android?.versionCode,
  },
  extra: {
    ...(config.extra || {}),
    API_BASE: process.env.API_BASE || productionApiBase,
    APP_VERSION: androidVersionInfo.versionName || config.version || '',
    APP_BUILD: androidVersionInfo.versionCode != null ? String(androidVersionInfo.versionCode) : '',
  },
  plugins: [
    ...(config.plugins || []),
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: 'To attach photos when uploading payment receipts for bookings or adding images of your field for listing. Photos are only used for these features.',
      },
    ],
  ],
});


