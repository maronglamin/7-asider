// Dynamic Expo config to inject env vars into Constants.expoConfig.extra
require('dotenv').config();

const productionApiBase = 'https://seven-aside.phantommetrics.gm';
// Prefer .env API_BASE so emulator/dev can hit live server; fallback to production URL (never localhost unless you set API_BASE locally)
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    API_BASE: process.env.API_BASE || productionApiBase,
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


