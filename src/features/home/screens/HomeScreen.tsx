import { useSession } from '@/features/auth';
import { AppText } from '@/shared/components/AppText';
import { Screen } from '@/shared/components/Screen';

export function HomeScreen() {
  const { snapshot } = useSession();
  return (
    <Screen>
      <AppText variant="title" weight="black">
        세울까말까
      </AppText>
      <AppText weight="bold">등록한 차량</AppText>
      <AppText>{snapshot.vehicle?.name}</AppText>
      <AppText>아직 주차 기록이 없어요.</AppText>
    </Screen>
  );
}
