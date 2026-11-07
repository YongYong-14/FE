import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth';
import { demoControl, type DemoScenario } from '@/services';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Card } from '@/shared/components/Surface';
import { colors, radii, spacing } from '@/shared/theme/tokens';

import { useParking } from '../state/ParkingProvider';

// 주차·기기 시나리오 제어 패널(팀원1 제공).
// 데모 설정 화면(팀원2)의 시나리오 UI가 완성되면 이 패널을 그 안에 배치하거나 대체한다.

type Option<T> = { value: T; label: string };

function Segmented<T extends string | null>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.group}>
      <AppText variant="caption" weight="bold" tone="secondary">
        {title}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <AppText
                variant="caption"
                weight="bold"
                style={{ color: selected ? colors.inverse : colors.ink }}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <AppText variant="subtitle" weight="bold">
        {title}
      </AppText>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

export function ParkingDemoPanel() {
  const { snapshot, updateDevice } = useSession();
  const parking = useParking();
  const [scenario, setScenario] = useState<DemoScenario>(demoControl.get());
  useEffect(() => demoControl.subscribe(setScenario), []);

  const device = snapshot.device;
  const set = (patch: Partial<DemoScenario>) => demoControl.set(patch);

  return (
    <View style={styles.wrap}>
      <Section title="등록 차량 이벤트">
        <AppText variant="caption" tone="secondary">
          현재: {device.vehicleConnected ? '연결됨' : '연결 해제됨'}
          {parking.progress ? ' · 주차 확인 진행 중' : ''}
        </AppText>
        <View style={styles.row}>
          <Button
            label="연결 해제(주차 추정)"
            size="md"
            onPress={() => void parking.simulateDisconnect()}
            disabled={!device.vehicleConnected}
            style={styles.flex}
          />
          <Button
            label="재연결"
            size="md"
            variant="outline"
            onPress={() => void parking.simulateReconnect()}
            disabled={device.vehicleConnected}
            style={styles.flex}
          />
        </View>
        <Segmented
          title="재연결 예약 (해당 단계에 도달하면 발생)"
          value={scenario.reconnectAt}
          onChange={(reconnectAt) => set({ reconnectAt })}
          options={[
            { value: null, label: '없음' },
            { value: 'confirming-location', label: '위치 선택 중' },
            { value: 'awaiting-crosswalk-answer', label: '횡단보도 대기' },
            { value: 'analyzing', label: '분석 중' },
          ]}
        />
      </Section>

      <Section title="다음 응답">
        <Segmented
          title="GPS 위치"
          value={scenario.locate}
          onChange={(locate) => set({ locate })}
          options={[
            { value: 'yongin', label: '용인시 내' },
            { value: 'outside', label: '용인시 밖' },
            { value: 'unavailable', label: '조회 실패' },
          ]}
        />
        <Segmented
          title="분석 결과"
          value={scenario.analysis}
          onChange={(analysis) => set({ analysis })}
          options={[
            { value: 'level-1', label: '1단계' },
            { value: 'level-2', label: '2단계' },
            { value: 'no-risk-found', label: '위험 없음' },
            { value: 'insufficient-data', label: '정보 부족' },
            { value: 'failed', label: '분석 실패' },
            { value: 'error-once', label: '요청 오류 1회' },
          ]}
        />
        <Segmented
          title="로그인"
          value={scenario.login}
          onChange={(login) => set({ login })}
          options={[
            { value: 'success', label: '성공' },
            { value: 'fail-once', label: '실패 1회' },
          ]}
        />
        <Segmented
          title="기기 목록"
          value={scenario.vehicleList}
          onChange={(vehicleList) => set({ vehicleList })}
          options={[
            { value: 'normal', label: '정상' },
            { value: 'empty', label: '목록 없음' },
            { value: 'fail-once', label: '조회 실패 1회' },
          ]}
        />
        <Segmented
          title="차량 등록"
          value={scenario.vehicleRegister}
          onChange={(vehicleRegister) => set({ vehicleRegister })}
          options={[
            { value: 'success', label: '성공' },
            { value: 'fail-once', label: '실패 1회' },
          ]}
        />
        <Segmented
          title="주변 주차장"
          value={scenario.parkingLots}
          onChange={(parkingLots) => set({ parkingLots })}
          options={[
            { value: 'normal', label: '정상' },
            { value: 'far-only', label: '500m 안 없음' },
            { value: 'none', label: '1km 안 없음' },
          ]}
        />
        <Segmented
          title="장소 검색"
          value={scenario.placeSearch}
          onChange={(placeSearch) => set({ placeSearch })}
          options={[
            { value: 'normal', label: '정상' },
            { value: 'fail-once', label: '실패 1회' },
          ]}
        />
      </Section>

      <Section title="데모 권한·블루투스">
        <Segmented
          title="위치 권한"
          value={device.locationPermission}
          onChange={(locationPermission) => void updateDevice({ locationPermission })}
          options={[
            { value: 'unset', label: '미설정' },
            { value: 'always', label: '항상 허용' },
            { value: 'foreground', label: '사용 중에만' },
            { value: 'denied', label: '거부' },
          ]}
        />
        <Segmented
          title="블루투스 권한"
          value={device.bluetoothPermission}
          onChange={(bluetoothPermission) => void updateDevice({ bluetoothPermission })}
          options={[
            { value: 'unset', label: '미설정' },
            { value: 'granted', label: '허용' },
            { value: 'denied', label: '거부' },
          ]}
        />
        <Segmented
          title="휴대폰 블루투스"
          value={device.bluetoothEnabled ? 'on' : 'off'}
          onChange={(value) => void updateDevice({ bluetoothEnabled: value === 'on' })}
          options={[
            { value: 'on', label: '켜짐' },
            { value: 'off', label: '꺼짐' },
          ]}
        />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  sectionBody: { gap: spacing.md, marginTop: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  group: { gap: spacing.xs + 2 },
  chips: { gap: spacing.sm, paddingRight: spacing.sm },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
});
