import { useSession } from '@/features/auth';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';

export function PermissionGuideScreen() {
  const { completeOnboarding, isSaving } = useSession();
  const { run, isRunning, error } = useAsyncAction();
  return (
    <Screen>
      <AppText variant="title" weight="black">
        위치와 차량 연결을 확인해요
      </AppText>
      <AppText>차량 연결이 해제되면 주차 위치를 확인하고 위험 정보를 살펴볼 수 있어요.</AppText>
      <AppText>이번 데모에서는 실제 위치·블루투스 권한을 요청하지 않아요.</AppText>
      <Button
        label="안내 확인했어요"
        onPress={() => void run(completeOnboarding)}
        loading={isRunning || isSaving}
      />
      {error && <AppText accessibilityRole="alert">{error}</AppText>}
    </Screen>
  );
}
