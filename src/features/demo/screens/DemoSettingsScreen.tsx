import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { describeError, systemService } from '@/services';

import { ParkingDemoPanel } from '@/features/parking';

import { ScenarioGroups } from '../components/ScenarioGroups';
import { useAppReset } from '@/providers/useAppReset';
import { AppModal } from '@/shared/components/AppModal';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { Card } from '@/shared/components/Surface';
import { spacing } from '@/shared/theme/tokens';

/** 서버 연결 상태(GET /health). 데모 모드에서는 서버를 쓰지 않는다. */
function ServerStatus() {
  const [result, setResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const api = systemService.mode === 'api';
  return (
    <Card>
      <AppText variant="subtitle" weight="bold">
        서버 연결
      </AppText>
      <AppText variant="caption" tone="secondary">
        {api
          ? `API 서버: ${systemService.baseUrl ?? ''}`
          : '데모 모드예요. EXPO_PUBLIC_API_BASE_URL을 설정하면 서버 API로 연결해요.'}
      </AppText>
      {api ? (
        <View style={styles.status}>
          <Button
            label="연결 확인"
            size="md"
            variant="outline"
            loading={checking}
            onPress={() => {
              setChecking(true);
              void systemService
                .health()
                .then((health) =>
                  setResult(health.ok ? `정상 응답 (${health.status})` : `응답 ${health.status}`),
                )
                .catch((cause: unknown) => setResult(describeError(cause, '연결하지 못했어요.')))
                .finally(() => setChecking(false));
            }}
          />
          {result ? (
            <AppText variant="caption" tone="body" accessibilityLiveRegion="polite">
              {result}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// 시연 도구: 10개 시나리오 그룹 → 세부 다음 응답·이벤트 → 데모 초기화.
// 준비만으로 등록 차량·기록을 지우거나 진행 중인 확인을 덮어쓰지 않는다.
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
      <ServerStatus />
      <AppText variant="subtitle" weight="bold" accessibilityRole="header">
        시연 시나리오
      </AppText>
      <ScenarioGroups />
      <AppText variant="subtitle" weight="bold" accessibilityRole="header" style={styles.section}>
        세부 설정
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
  section: { marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  status: { gap: spacing.sm, marginTop: spacing.sm },
});
