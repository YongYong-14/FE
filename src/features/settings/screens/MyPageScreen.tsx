import { useRouter } from 'expo-router';
import { Switch, View } from 'react-native';

import { useSession } from '@/features/auth';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors, spacing } from '@/shared/theme/tokens';

export function MyPageScreen() {
  const router = useRouter();
  const { snapshot, signOut, setSurveyEnabled, isSaving } = useSession();
  const { run, isRunning, error } = useAsyncAction();

  return (
    <Screen>
      <AppText variant="title" weight="black">
        마이페이지
      </AppText>
      <AppText weight="bold">{snapshot.user?.nickname} 님</AppText>
      <AppText>등록 차량: {snapshot.vehicle?.name}</AppText>
      <Button secondary label="차량 변경" onPress={() => router.push('/settings/vehicle')} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppText style={{ flex: 1 }}>재탑승 사후 설문</AppText>
        <Switch
          accessibilityLabel="재탑승 사후 설문"
          value={snapshot.surveyEnabled}
          disabled={isSaving || isRunning}
          onValueChange={(value) => void run(() => setSurveyEnabled(value))}
          trackColor={{ true: colors.primary }}
        />
      </View>
      <Button secondary label="약관 및 개인정보" onPress={() => router.push('/settings/legal')} />
      <Button
        secondary
        label="로그아웃"
        onPress={() => void run(signOut)}
        loading={isRunning || isSaving}
      />
      <Button secondary label="데모 설정" onPress={() => router.push('/settings/demo')} />
      {error && <AppText accessibilityRole="alert">{error}</AppText>}
    </Screen>
  );
}
