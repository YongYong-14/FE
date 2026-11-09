import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: '세울까말까',
  slug: 'seulkkamalkka',
  version: '0.1.0',
  scheme: 'seulkkamalkka',
  platforms: ['android', 'web'],
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  android: {
    package: 'com.yongyong14.seulkkamalkka',
    versionCode: 1,
    blockedPermissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.RECORD_AUDIO',
    ],
  },
  plugins: ['expo-router', ['expo-splash-screen', { backgroundColor: '#f5f5f5' }]],
};

export default config;
