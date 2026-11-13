import { Redirect } from 'expo-router';

import { useSession } from '@/features/auth';
import { hasVehicleEntryAccess, missingAgreementsOf } from '@/shared/types/session';

export default function EntryRoute() {
  const { snapshot } = useSession();
  if (!snapshot.user) return <Redirect href="/(onboarding)/login" />;
  if (missingAgreementsOf(snapshot).length > 0) return <Redirect href="/(onboarding)/agreements" />;
  if (!snapshot.onboardingCompleted) return <Redirect href="/(onboarding)/permissions" />;
  if (!hasVehicleEntryAccess(snapshot))
    return <Redirect href="/(onboarding)/vehicle-registration" />;
  return <Redirect href="/(main)/(tabs)/home" />;
}
