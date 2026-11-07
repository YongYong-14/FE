import { Redirect } from 'expo-router';

import { useSession } from '@/features/auth';

export default function EntryRoute() {
  const { snapshot } = useSession();
  if (!snapshot.user) return <Redirect href="/(onboarding)/login" />;
  if (!snapshot.onboardingCompleted) return <Redirect href="/(onboarding)/permissions" />;
  if (!snapshot.vehicle) return <Redirect href="/(onboarding)/vehicle-registration" />;
  return <Redirect href="/(main)/(tabs)/home" />;
}
