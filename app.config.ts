import type { ExpoConfig } from 'expo/config';

const kakaoNativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY?.trim();
const plugins: NonNullable<ExpoConfig['plugins']> = [
  'expo-router',
  ['expo-splash-screen', { backgroundColor: '#f5f5f5' }],
  [
    'expo-build-properties',
    {
      android: {
        extraMavenRepos: ['https://devrepo.kakao.com/nexus/content/groups/public/'],
      },
    },
  ],
];

// 키가 없는 팀원의 데모 실행은 유지한다. 키를 추가·변경하면 Android를 다시 빌드한다.
if (kakaoNativeAppKey) {
  plugins.push(['@react-native-seoul/kakao-login', { kakaoAppKey: kakaoNativeAppKey }]);
}

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
  plugins,
};

export default config;
