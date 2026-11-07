import { Stack } from 'expo-router';

import { colors } from '@/shared/theme/tokens';

export default function MainLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="parking/confirm" options={{ headerShown: false }} />
      <Stack.Screen name="parking/result" options={{ headerShown: false }} />
      <Stack.Screen name="records/[recordId]" options={{ title: '주차 기록' }} />
      <Stack.Screen name="settings/vehicle" options={{ headerShown: false }} />
      <Stack.Screen name="settings/permissions" options={{ headerShown: false }} />
      <Stack.Screen name="settings/demo" options={{ title: '데모 설정' }} />
      <Stack.Screen name="settings/legal" options={{ title: '약관 및 개인정보' }} />
    </Stack>
  );
}
