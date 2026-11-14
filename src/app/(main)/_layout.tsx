import { Stack } from 'expo-router';

import { ParkingTouchGuard } from '@/features/parking';
import { SurveyHost } from '@/features/survey';
import { colors } from '@/shared/theme/tokens';
import { AppText } from '@/shared/components/AppText';

export default function MainLayout() {
  return (
    <ParkingTouchGuard>
      <MainStack />
      {/* 재탑승 사후 설문은 화면과 무관하게 한 곳에서만 띄운다. */}
      <SurveyHost />
    </ParkingTouchGuard>
  );
}

function MainStack() {
  return (
    <Stack
      screenOptions={{
        // 새 화면은 오른쪽에서 밀려 들어오고, 뒤로 가면 반대로 빠진다.
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
        headerTitle: ({ children }) => (
          <AppText variant="subtitle" weight="bold">
            {children}
          </AppText>
        ),
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="parking/confirm" options={{ headerShown: false }} />
      <Stack.Screen name="parking/result" options={{ headerShown: false }} />
      <Stack.Screen name="records/[recordId]" options={{ headerShown: false }} />
      <Stack.Screen name="settings/vehicle" options={{ headerShown: false }} />
      <Stack.Screen name="settings/permissions" options={{ headerShown: false }} />
      <Stack.Screen name="settings/legal" options={{ title: '약관 및 개인정보' }} />
    </Stack>
  );
}
