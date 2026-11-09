import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth';
import { bluetoothDeviceService, describeError, vehicleService } from '@/services';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { Notice } from '@/shared/components/Notice';
import { Screen } from '@/shared/components/Screen';
import { StateView } from '@/shared/components/StateView';
import { IconTile } from '@/shared/components/Surface';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import type { DeviceKind, PairedDevice } from '@/shared/types/session';

const kindLabel: Record<DeviceKind, string> = {
  'car-audio': '차량 오디오',
  earphone: '이어폰',
  speaker: '스피커',
};

function DeviceRow({
  vehicle,
  selected,
  current,
  disabled,
  onPress,
}: {
  vehicle: PairedDevice;
  selected: boolean;
  current: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const caption = [vehicle.kind ? kindLabel[vehicle.kind] : null, current ? '현재 등록됨' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${vehicle.name}${caption ? `, ${caption}` : ''}`}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={[styles.row, selected && styles.rowSelected]}
    >
      <IconTile
        name="bluetooth"
        size={40}
        background={selected ? colors.primary : colors.surface}
        color={selected ? colors.inverse : colors.textSecondary}
      />
      <View style={styles.rowTexts}>
        <AppText variant="label" weight="bold">
          {vehicle.name}
        </AppText>
        {caption ? (
          <AppText variant="micro" tone="secondary">
            {caption}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]} />
    </Pressable>
  );
}

/**
 * 최초 차량 등록과 차량 변경이 함께 쓰는 화면.
 * 페어링 기기 목록은 앱(OS)이 읽고, 고른 기기의 이름·MAC 주소만 서버에 등록한다(PUT /vehicle).
 * 새 등록이 성공해야 기존 차량을 교체하며, 취소·실패 시 기존 등록과 기록을 유지한다.
 */
export function VehicleRegistrationScreen({ onComplete }: { onComplete?: () => void }) {
  const router = useRouter();
  const { snapshot, registerVehicle, isSaving } = useSession();
  const isChange = Boolean(snapshot.vehicle);
  const [vehicles, setVehicles] = useState<PairedDevice[]>([]);
  const currentAddress = snapshot.vehicle?.bluetoothAddress ?? null;
  const [selected, setSelected] = useState<string | null>(currentAddress);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { run, isRunning, error } = useAsyncAction((cause) =>
    describeError(cause, '다시 시도해 주세요.'),
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      setVehicles(await bluetoothDeviceService.listPairedDevices());
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    bluetoothDeviceService
      .listPairedDevices()
      .then((items) => {
        if (active) setVehicles(items);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const busy = isRunning || isSaving;
  const unchanged = isChange && selected !== null && selected === currentAddress;

  return (
    <Screen
      background={colors.surface}
      contentStyle={styles.content}
      footer={
        <>
          {error ? (
            <Notice
              title="차량을 등록하지 못했어요"
              description={isChange ? `기존 차량은 그대로 유지돼요. ${error}` : error}
            />
          ) : null}
          <Button
            label={isChange ? '이 차량으로 변경하기' : '등록하고 시작하기'}
            disabled={!selected || isLoading || vehicles.length === 0 || unchanged}
            loading={busy}
            onPress={() =>
              void run(async () => {
                const device = vehicles.find((item) => item.address === selected);
                if (!device) return;
                const registered = await vehicleService.register(device);
                await registerVehicle(registered);
                onComplete?.();
              })
            }
          />
          <AppText variant="micro" tone="secondary" style={styles.center}>
            데모 기기 목록이에요. 실제 블루투스 탐색은 하지 않아요.
          </AppText>
        </>
      }
    >
      {isChange ? (
        <View style={styles.nav}>
          <IconButton name="chevron-back" label="차량 변경 취소" onPress={() => router.back()} />
        </View>
      ) : null}
      <View style={styles.header}>
        <AppText variant="title" weight="black" accessibilityRole="header">
          {isChange ? '바꿀 차량의 블루투스를\n선택해 주세요' : '내 차의 블루투스를\n선택해 주세요'}
        </AppText>
        <AppText variant="caption" tone="secondary">
          선택한 기기의 연결이 끊기면 주차로 판단해요. 차량은 1대만 등록할 수 있어요.
        </AppText>
      </View>

      {isLoading ? (
        <StateView
          loading
          title="기기를 찾고 있어요"
          description="휴대폰과 페어링된 기기를 불러오는 중이에요."
        />
      ) : loadError ? (
        <StateView
          icon="alert-circle-outline"
          title="기기 목록을 불러오지 못했어요"
          description="잠시 후 다시 찾아 주세요."
          actions={
            <Button label="다시 찾기" variant="outline" size="md" onPress={() => void load()} />
          }
        />
      ) : vehicles.length === 0 ? (
        <StateView
          icon="bluetooth"
          title="페어링된 블루투스 기기가 없어요"
          description={'휴대폰 블루투스 설정에서 차량과 먼저\n연결한 뒤 다시 찾아 주세요.'}
          actions={
            <Button label="다시 찾기" variant="outline" size="md" onPress={() => void load()} />
          }
        />
      ) : (
        <View style={styles.list} accessibilityRole="radiogroup">
          {vehicles.map((vehicle) => (
            <DeviceRow
              key={vehicle.address}
              vehicle={vehicle}
              selected={selected === vehicle.address}
              current={currentAddress === vehicle.address}
              disabled={busy}
              onPress={() => setSelected(vehicle.address)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, gap: spacing.xl },
  nav: { marginLeft: -spacing.md, marginBottom: -spacing.sm },
  header: { gap: spacing.sm, paddingTop: spacing.sm },
  list: { gap: spacing.sm + 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + 1,
    padding: 15,
    borderRadius: radii.md,
    borderWidth: 1.6,
    borderColor: colors.surfaceMuted,
    backgroundColor: colors.surfaceMuted,
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rowTexts: { flex: 1, gap: spacing.xxs },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, borderColor: colors.line },
  radioSelected: { borderWidth: 6.5, borderColor: colors.primary },
  center: { textAlign: 'center' },
});
