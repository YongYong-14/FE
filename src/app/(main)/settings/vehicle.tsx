import { useRouter } from 'expo-router';

import { VehicleRegistrationScreen } from '@/features/vehicle/screens/VehicleRegistrationScreen';

export default function VehicleChangeRoute() {
  const router = useRouter();
  return <VehicleRegistrationScreen onComplete={() => router.back()} />;
}
