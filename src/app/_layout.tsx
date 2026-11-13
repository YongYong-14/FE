import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { useSession } from '@/features/auth';
import { AppProviders } from '@/providers/AppProviders';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { BrandSplash } from '@/shared/components/BrandSplash';
import { colors, fonts } from '@/shared/theme/tokens';
import { hasVehicleEntryAccess, missingAgreementsOf } from '@/shared/types/session';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { snapshot, isLoading, loadError, retryLoad } = useSession();
  const ready = Boolean(
    snapshot.user &&
    missingAgreementsOf(snapshot).length === 0 &&
    snapshot.onboardingCompleted &&
    hasVehicleEntryAccess(snapshot),
  );

  if (isLoading) {
    return <BrandSplash />;
  }
  if (loadError) {
    return (
      <Screen>
        <AppText>{loadError}</AppText>
        <Button label="다시 시도" onPress={() => void retryLoad()} />
      </Screen>
    );
  }

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="terms" />
      <Stack.Protected guard={!ready}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(main)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: require('../../assets/fonts/pretendard/Pretendard-Regular.otf'),
    [fonts.bold]: require('../../assets/fonts/pretendard/Pretendard-Bold.otf'),
    [fonts.black]: require('../../assets/fonts/pretendard/Pretendard-Black.otf'),
    ...FontAwesome6.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (fontError) return <Text>글꼴을 불러오지 못했어요. 앱을 다시 실행해 주세요.</Text>;
  if (!fontsLoaded) return <BrandSplash />;

  return (
    <AppProviders>
      <StatusBar style="dark" />
      <RootNavigator />
    </AppProviders>
  );
}
