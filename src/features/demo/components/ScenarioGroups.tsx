import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth';
import { useParking } from '@/features/parking';
import { demoControl, defaultScenario, type DemoScenario } from '@/services';
import { AppText } from '@/shared/components/AppText';
import { Badge } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import type { DemoDeviceState } from '@/shared/types/session';

interface ScenarioGroup {
  id: string;
  title: string;
  checks: string;
  steps: string[];
  scenario?: Partial<DemoScenario>;
  device?: Partial<DemoDeviceState>;
  /** 준비하면서 등록 차량 연결 해제(주차 추정)까지 발생시킨다. */
  disconnect?: boolean;
}

// 05_데모_시나리오.md의 10개 시연 그룹. 준비는 다음 응답·이벤트만 바꾸고 기록·차량을 지우지 않는다.
const groups: ScenarioGroup[] = [
  {
    id: 'D01',
    title: '로그인·차량 등록',
    checks: '로그인 실패·재시도, 기기 목록 없음·등록 실패',
    scenario: { login: 'fail-once', vehicleRegister: 'fail-once' },
    steps: [
      '마이페이지에서 로그아웃 후 다시 로그인하면 한 번 실패해요. 다시 시도하면 들어가요.',
      '마이페이지 → 차량 변경에서 등록이 한 번 실패해요. 기존 차량은 그대로예요.',
      '목록 없음은 아래 세부 설정의 ‘기기 목록’에서 바꿀 수 있어요.',
    ],
  },
  {
    id: 'D02',
    title: '홈·차량·권한',
    checks: '권한 거부·제한 안내, 블루투스 꺼짐',
    device: { locationPermission: 'foreground', bluetoothEnabled: true },
    steps: [
      '홈 상단이 ‘감지가 제한돼요’로 바뀌고 아래에 권한 안내가 보여요.',
      '‘권한 설정’에서 데모 권한을 다시 고를 수 있어요.',
      '블루투스 꺼짐은 세부 설정의 ‘휴대폰 블루투스’를 꺼서 확인해요.',
    ],
  },
  {
    id: 'D03',
    title: '타이머·게이지',
    checks: '수동·자동 확정, 터치 정지·재개, 15초 연장, 재측정',
    scenario: { locate: 'yongin', reconnectAt: null },
    disconnect: true,
    steps: [
      '홈 → ‘주차 위치 확인하기’로 들어가요.',
      '지도를 누르고 있으면 시간이 멈추고, 손을 떼면 남은 시간부터 줄어요.',
      '‘시간 연장’은 15초로 되돌려요. 0초가 되면 자동으로 확정돼요.',
    ],
  },
  {
    id: 'D04',
    title: 'GPS·지원 지역',
    checks: '조회 실패·수동 지정, 용인시 밖 안내',
    scenario: { locate: 'unavailable' },
    disconnect: true,
    steps: [
      '위치를 받지 못해 목록에서 직접 고르는 화면이 나와요(자동 확정 꺼짐).',
      '‘광교호수공원(지원 지역 밖 예시)’을 고르면 확정할 수 없어요.',
      '용인시 밖 GPS는 세부 설정의 ‘GPS 위치’에서 바꿔요.',
    ],
  },
  {
    id: 'D05',
    title: '분석·기록',
    checks: '분석 실패 → 다시 분석, 같은 기록 갱신, 6개 필터',
    scenario: { locate: 'yongin', analysis: 'error-once' },
    disconnect: true,
    steps: [
      '주차 확인을 마치면 ‘분석 실패’로 저장돼요.',
      '‘다시 분석하기’를 누르면 같은 기록이 2단계로 갱신돼요.',
      '기록 탭에서 필터를 바꿔 확인해요.',
    ],
  },
  {
    id: 'D06',
    title: '지도·검색',
    checks: '이름·주소 검색, 결과 없음, 신고 건수 ON/OFF',
    scenario: { placeSearch: 'normal' },
    steps: [
      '지도 탭에서 ‘수지’를 검색해 결과를 골라요.',
      '‘부산’처럼 없는 이름은 결과 없음 안내가 나와요.',
      '‘신고 건수’ 스위치로 건수 표시를 켜고 꺼요.',
    ],
  },
  {
    id: 'D07',
    title: '주변 주차장',
    checks: '거리순, 500m/1km, 필터, 결과 없음',
    scenario: { parkingLots: 'far-only' },
    steps: [
      '주변 주차장 탭을 열면 500m 안에 없어 1km까지 찾은 결과가 나와요.',
      '필터로 목록이 비면 ‘1km로 넓혀 보기’로 다시 찾아요.',
      '운영 중·공영·유료 필터를 바꾸면 목록과 핀이 함께 바뀌어요.',
    ],
  },
  {
    id: 'D08',
    title: '재연결 취소',
    checks: '횡단보도 대기 중 재연결 → 취소, 새 기록 없음',
    scenario: { locate: 'yongin', reconnectAt: 'awaiting-crosswalk-answer' },
    disconnect: true,
    steps: [
      '주차 위치를 확정하고 횡단보도 질문이 뜨면 잠시 뒤 차량이 다시 연결돼요.',
      '진행이 취소되고 홈으로 돌아가요. 새 기록은 남지 않아요.',
    ],
  },
  {
    id: 'D09',
    title: '사후 설문',
    checks: '위험 리포트 확인 후 재탑승 시 설문, 건너뛰기, 재노출 방지',
    scenario: { locate: 'yongin', analysis: 'level-1' },
    disconnect: true,
    steps: [
      '주차 확인을 마치고 1단계 리포트를 확인해요.',
      '데모 설정의 ‘재연결’을 누르면 설문이 떠요. 같은 주차에는 다시 묻지 않아요.',
      '마이페이지에서 설문을 끄면 나타나지 않아요.',
    ],
  },
  {
    id: 'D10',
    title: '보관·복원·정리',
    checks: '홈 이어가기, 재실행·재로그인 복원, 초기화·탈퇴',
    steps: [
      '주차 확인 중 뒤로 나가 홈의 ‘이어가기’로 돌아와요. 시간은 그대로예요.',
      '앱을 완전히 종료했다가 다시 열어도 진행이 이어져요.',
      '로그아웃 후 재로그인, 아래 ‘데모 초기화’, 마이페이지 ‘회원 탈퇴’를 확인해요.',
    ],
  },
];

export function ScenarioGroups() {
  const { snapshot, updateDevice } = useSession();
  const parking = useParking();
  const [openId, setOpenId] = useState<string | null>(null);
  const [preparedId, setPreparedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function prepare(group: ScenarioGroup) {
    setBusy(true);
    try {
      demoControl.set({ ...defaultScenario, ...group.scenario });
      if (group.device) await updateDevice(group.device);
      if (group.disconnect && !parking.progress) {
        if (!snapshot.device.vehicleConnected) await parking.simulateReconnect();
        await parking.simulateDisconnect();
      }
      setPreparedId(group.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.list}>
      {groups.map((group) => {
        const open = openId === group.id;
        const prepared = preparedId === group.id;
        return (
          <View key={group.id} style={styles.card}>
            <Pressable
              onPress={() => setOpenId(open ? null : group.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={styles.head}
            >
              <AppText variant="caption" weight="black" tone="primary" style={styles.id}>
                {group.id}
              </AppText>
              <View style={styles.flex}>
                <AppText variant="label" weight="bold">
                  {group.title}
                </AppText>
                <AppText variant="micro" tone="secondary">
                  {group.checks}
                </AppText>
              </View>
              {prepared ? <Badge label="준비됨" tone="success" size="sm" /> : null}
              <Icon
                name={open ? 'chevron-up' : 'chevron-down'}
                size="sm"
                color={colors.textSecondary}
              />
            </Pressable>
            {open ? (
              <View style={styles.body}>
                {group.steps.map((step, index) => (
                  <View key={step} style={styles.step}>
                    <AppText variant="micro" weight="bold" tone="secondary">
                      {index + 1}
                    </AppText>
                    <AppText variant="caption" tone="body" style={styles.flex}>
                      {step}
                    </AppText>
                  </View>
                ))}
                {group.scenario || group.device || group.disconnect ? (
                  <Button
                    label={prepared ? '다시 준비하기' : '이 시나리오 준비'}
                    size="md"
                    loading={busy}
                    onPress={() => void prepare(group)}
                    accessibilityHint={
                      group.disconnect
                        ? '다음 응답을 바꾸고 등록 차량 연결 해제를 발생시켜요'
                        : '다음 응답을 바꿔요'
                    }
                  />
                ) : null}
                {group.disconnect && parking.progress ? (
                  <AppText variant="micro" tone="secondary">
                    진행 중인 주차 확인이 있어 연결 해제는 건너뛰어요. 다음 응답만 바뀌어요.
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: { borderRadius: radii.md, backgroundColor: colors.surface, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  id: { width: 32 },
  flex: { flex: 1 },
  body: { gap: spacing.sm + 2, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  step: { flexDirection: 'row', gap: spacing.sm },
});
