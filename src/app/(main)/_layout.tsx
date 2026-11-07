import { Stack } from 'expo-router';

export default function MainLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="parking/confirm" options={{ title: '주차 위치 확인' }} />
      <Stack.Screen name="parking/result" options={{ title: '분석 결과' }} />
      <Stack.Screen name="records/[recordId]" options={{ title: '주차 기록' }} />
      <Stack.Screen name="settings/vehicle" options={{ title: '차량 변경' }} />
      <Stack.Screen name="settings/demo" options={{ title: '데모 설정' }} />
      <Stack.Screen name="settings/legal" options={{ title: '약관 및 개인정보' }} />
    </Stack>
  );
}
