import { useRouter } from 'expo-router';

import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';

export default function NotFoundRoute() {
  const router = useRouter();
  return (
    <Screen>
      <AppText>화면을 찾지 못했어요.</AppText>
      <Button label="처음으로" onPress={() => router.replace('/')} />
    </Screen>
  );
}
