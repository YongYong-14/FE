import Ionicons from '@expo/vector-icons/Ionicons';
import { NotoSansKR_400Regular } from '@expo-google-fonts/noto-sans-kr/400Regular';
import { NotoSansKR_700Bold } from '@expo-google-fonts/noto-sans-kr/700Bold';
import { NotoSansKR_900Black } from '@expo-google-fonts/noto-sans-kr/900Black';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { useSession } from '@/features/auth';
import { AppProviders } from '@/providers/AppProviders';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { colors } from '@/shared/theme/tokens';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { snapshot, isLoading, loadError, retryLoad } = useSession();
  const ready = Boolean(snapshot.user && snapshot.onboardingCompleted && snapshot.vehicle);

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
        <AppText>정보를 불러오고 있어요.</AppText>
      </Screen>
    );
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
    NotoSansKR_400Regular,
    NotoSansKR_700Bold,
    NotoSansKR_900Black,
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (fontError) return <Text>글꼴을 불러오지 못했어요. 앱을 다시 실행해 주세요.</Text>;
  if (!fontsLoaded) return null;

  return (
    <AppProviders>
      <StatusBar style="dark" />
      <RootNavigator />
    </AppProviders>
  );
}
