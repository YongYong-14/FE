import { Stack } from 'expo-router';

import { useSession } from '@/features/auth';
import { hasVehicleEntryAccess, missingAgreementsOf } from '@/shared/types/session';

export default function OnboardingLayout() {
  const { snapshot } = useSession();
  const signedIn = Boolean(snapshot.user);
  const agreed = missingAgreementsOf(snapshot).length === 0;
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
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
        guard={
          signedIn && agreed && snapshot.onboardingCompleted && !hasVehicleEntryAccess(snapshot)
        }
      >
        <Stack.Screen name="vehicle-registration" />
      </Stack.Protected>
    </Stack>
  );
}
