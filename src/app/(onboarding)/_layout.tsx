import { Stack } from 'expo-router';

import { useSession } from '@/features/auth';
import { missingAgreementsOf } from '@/shared/types/session';

export default function OnboardingLayout() {
  const { snapshot } = useSession();
  const signedIn = Boolean(snapshot.user);
  const agreed = missingAgreementsOf(snapshot).length === 0;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !agreed}>
        <Stack.Screen name="agreements" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && agreed && !snapshot.onboardingCompleted}>
        <Stack.Screen name="permissions" />
      </Stack.Protected>
      <Stack.Protected
        guard={signedIn && agreed && snapshot.onboardingCompleted && !snapshot.vehicle}
      >
        <Stack.Screen name="vehicle-registration" />
      </Stack.Protected>
    </Stack>
  );
}
