import { Stack } from 'expo-router';

import { SurveyHost } from '@/features/survey';
import { colors } from '@/shared/theme/tokens';

export default function MainLayout() {
  return (
    <>
      <MainStack />
      {/* 재탑승 사후 설문은 화면과 무관하게 한 곳에서만 띄운다. */}
      <SurveyHost />
    </>
  );
}

function MainStack() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="parking/confirm" options={{ headerShown: false }} />
      <Stack.Screen name="parking/result" options={{ headerShown: false }} />
      <Stack.Screen name="records/[recordId]" options={{ headerShown: false }} />
      <Stack.Screen name="settings/vehicle" options={{ headerShown: false }} />
      <Stack.Screen name="settings/permissions" options={{ headerShown: false }} />
      <Stack.Screen name="settings/demo" options={{ title: '데모 설정' }} />
      <Stack.Screen name="settings/legal" options={{ title: '약관 및 개인정보' }} />
    </Stack>
  );
}
