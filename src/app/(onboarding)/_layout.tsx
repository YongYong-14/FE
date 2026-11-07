import { Stack } from 'expo-router';

import { useSession } from '@/features/auth';

export default function OnboardingLayout() {
  const { snapshot } = useSession();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!snapshot.user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(snapshot.user && !snapshot.onboardingCompleted)}>
        <Stack.Screen name="permissions" />
      </Stack.Protected>
      <Stack.Protected
        guard={Boolean(snapshot.user && snapshot.onboardingCompleted && !snapshot.vehicle)}
      >
        <Stack.Screen name="vehicle-registration" />
      </Stack.Protected>
    </Stack>
  );
}
