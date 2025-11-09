// Dynamic Expo config to inject env vars into Constants.expoConfig.extra
require('dotenv').config();

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    API_BASE: process.env.API_BASE || 'http://localhost:4000',
  },
  plugins: [
    ...(config.plugins || []),
    'expo-secure-store',
  ],
});


