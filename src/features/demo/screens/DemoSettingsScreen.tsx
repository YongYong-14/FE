import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ParkingDemoPanel } from '@/features/parking';
import { useAppReset } from '@/providers/useAppReset';
import { AppModal } from '@/shared/components/AppModal';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { spacing } from '@/shared/theme/tokens';

// 임시 구성: 팀원1의 주차·기기 시나리오 제어 패널과 초기화 동작을 연결해 둔 상태.
// 10개 시연 그룹 선택 UI는 데모 설정 담당(팀원2)이 이 화면에 완성한다.
export function DemoSettingsScreen() {
  const reset = useAppReset();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <AppText variant="caption" tone="secondary">
        다음 응답과 기기 이벤트를 준비한 뒤 실제 이용 화면에서 결과를 확인해요. 실제 계정·OS 설정은
        바뀌지 않아요.
      </AppText>
      <ParkingDemoPanel />
      <Button label="데모 초기화" variant="outline" onPress={() => setConfirming(true)} />

      <AppModal visible={confirming} onDismiss={() => !resetting && setConfirming(false)}>
        <View style={styles.texts}>
          <AppText variant="heading" weight="bold">
            데모를 초기화할까요?
          </AppText>
          <AppText variant="body" tone="body">
            로그인 상태, 등록 차량, 주차 기록, 설문과 설정이 처음 상태로 돌아가요.
          </AppText>
        </View>
        <View style={styles.actions}>
          <Button
            label="취소"
            variant="neutral"
            onPress={() => setConfirming(false)}
            disabled={resetting}
            style={styles.flex}
          />
          <Button
            label="초기화"
            loading={resetting}
            onPress={() => {
              setResetting(true);
              void reset().finally(() => {
                setResetting(false);
                setConfirming(false);
              });
            }}
            style={styles.flex}
          />
        </View>
      </AppModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  texts: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
