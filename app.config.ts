import type { ExpoConfig } from 'expo/config';

const kakaoNativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY?.trim();
const plugins: NonNullable<ExpoConfig['plugins']> = [
  'expo-router',
  [
    'expo-splash-screen',
    {
      image: './assets/branding/splash.png',
      imageWidth: 240,
      resizeMode: 'contain',
      backgroundColor: '#F9F7F2',
    },
  ],
  [
    'expo-location',
    { isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: false },
  ],
  [
    'expo-build-properties',
    {
      android: {
        extraMavenRepos: ['https://devrepo.kakao.com/nexus/content/groups/public/'],
      },
    },
  ],
];

// 카카오 SDK 키를 추가·변경하면 Android를 다시 빌드한다. 키가 없으면 로그인에서 설정 오류를 표시한다.
if (kakaoNativeAppKey) {
  plugins.push(['@react-native-seoul/kakao-login', { kakaoAppKey: kakaoNativeAppKey }]);
}

const config: ExpoConfig = {
  name: '세울까말까',
  slug: 'seulkkamalkka',
  version: '0.1.0',
  icon: './assets/branding/app-icon.png',
  scheme: 'seulkkamalkka',
  platforms: ['android', 'web'],
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/branding/adaptive-icon.png',
      backgroundColor: '#F9F7F2',
    },
    package: 'com.yongyong14.seulkkamalkka',
    versionCode: 1,
    // 알림 권한은 주차 감지 알림(modules/vehicle-bluetooth)에서 쓴다.
    blockedPermissions: ['android.permission.BLUETOOTH_SCAN', 'android.permission.RECORD_AUDIO'],
  },
  web: { favicon: './assets/branding/favicon.png' },
  plugins,
};

export default config;
