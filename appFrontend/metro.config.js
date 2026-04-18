// Required for expo-updates (EAS Update): Metro must hash assets for embedded/update manifests.
// https://docs.expo.dev/bare/installing-updates/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
