import { useSession } from '@/features/auth';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors } from '@/shared/theme/tokens';

export function LoginScreen() {
  const { signIn, isSaving } = useSession();
  const { run, isRunning, error } = useAsyncAction();
  return (
    <Screen>
      <AppText variant="title" weight="black">
        세울까말까
      </AppText>
      <AppText>주차한 위치의 위험을 확인하고 주변 주차장을 찾아보세요.</AppText>
      <AppText variant="caption" style={{ color: colors.muted }}>
        데모 계정으로 이용해요.
      </AppText>
      <Button
        label="카카오로 시작하기"
        onPress={() => void run(signIn)}
        loading={isRunning || isSaving}
      />
      {error && (
        <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </AppText>
      )}
    </Screen>
  );
}
