// Dynamic Expo config to inject env vars into Constants.expoConfig.extra
require('dotenv').config();

const productionApiBase = 'https://seven-aside.phantommetrics.gm';
const defaultApiBase = process.env.NODE_ENV === 'production' ? productionApiBase : 'http://localhost:4000';

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    API_BASE: process.env.API_BASE || defaultApiBase,
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


