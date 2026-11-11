import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { nativeBluetooth } from '@/services/device/bluetooth';
import {
  locationPermission,
  requestBackgroundLocationPermission,
  requestLocationPermission,
} from '@/services/device/location';
import { AppModal } from '@/shared/components/AppModal';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Notice } from '@/shared/components/Notice';
import { Screen } from '@/shared/components/Screen';
import { Card } from '@/shared/components/Surface';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { spacing } from '@/shared/theme/tokens';
import type { BluetoothPermission, LocationPermission } from '@/shared/types/session';
import { useSession } from '../state/SessionProvider';

const labels: Record<LocationPermission | BluetoothPermission, string> = {
  unset: '미설정',
  denied: '허용 안 됨',
  foreground: '앱 사용 중 허용',
  always: '항상 허용',
  granted: '허용됨',
};

export function NativePermissionGuideScreen({ mode }: { mode: 'onboarding' | 'settings' }) {
  const router = useRouter();
  const { snapshot, updateDevice, completeOnboarding } = useSession();
  const [backgroundGuide, setBackgroundGuide] = useState(false);
  const { run, isRunning, error } = useAsyncAction((cause) =>
    cause instanceof Error ? cause.message : '권한 설정을 확인해 주세요.',
  );
  const sync = useCallback(async () => {
    const [location, bluetooth] = await Promise.all([
      locationPermission(),
      nativeBluetooth.permission(),
    ]);
    await updateDevice({ locationPermission: location, bluetoothPermission: bluetooth });
    return { location, bluetooth };
  }, [updateDevice]);
  useEffect(() => {
    void sync().catch(() => undefined);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync().catch(() => undefined);
    });
    return () => listener.remove();
  }, [sync]);
  const finish = () =>
    void run(async () => {
      await sync();
      if (mode === 'onboarding') await completeOnboarding();
      else router.back();
    });

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <>
          {error ? <Notice title="권한 설정을 확인해 주세요" description={error} /> : null}
          <Button
            label="권한 설정하기"
            loading={isRunning}
            onPress={() =>
              void run(async () => {
                await requestLocationPermission();
                await nativeBluetooth.requestPermission();
                const result = await sync();
                if (result.location === 'foreground') setBackgroundGuide(true);
                else if (result.location === 'denied' || result.bluetooth === 'denied')
                  await nativeBluetooth.openAppSettings();
              })
            }
          />
          <Button
            label={mode === 'onboarding' ? '계속하기' : '완료'}
            variant="outline"
            disabled={isRunning}
            onPress={finish}
          />
        </>
      }
    >
      <AppText variant="title" weight="black">
        주차를 감지하려면{'\n'}권한이 필요해요
      </AppText>
      <AppText variant="caption" tone="secondary">
        등록한 기기의 연결 상태와 실제 GPS 위치를 사용해요. 권한 요청 시 Android의 시스템 창이
        열려요.
      </AppText>
      <Card>
        <AppText variant="label" weight="bold">
          위치 · {labels[snapshot.device.locationPermission]}
        </AppText>
        <AppText variant="caption" tone="secondary">
          주차 위치를 확인해요. 설정에서 정확한 위치와 ‘항상 허용’을 선택해 주세요.
        </AppText>
      </Card>
      <Card>
        <AppText variant="label" weight="bold">
          근처 기기 · {labels[snapshot.device.bluetoothPermission]}
        </AppText>
        <AppText variant="caption" tone="secondary">
          휴대폰에 등록된 기기를 읽고 선택한 기기의 연결·해제를 감지해요.
        </AppText>
      </Card>
      <Button
        label="블루투스 설정 열기"
        variant="ghost"
        onPress={() => void run(nativeBluetooth.openSettings)}
      />
      <Button
        label="앱 권한 설정 열기"
        variant="ghost"
        onPress={() => void run(nativeBluetooth.openAppSettings)}
      />
      <Button
        label="배터리 최적화 설정 (선택)"
        variant="ghost"
        onPress={() => void run(nativeBluetooth.openBatterySettings)}
      />
      <AppText variant="micro" tone="secondary">
        기기를 연결하거나 해제하는 작업은 휴대폰의 블루투스 설정에서 해 주세요. 앱을 강제로 중지하면
        다시 실행할 때까지 감지가 중단돼요.
      </AppText>
      <AppModal visible={backgroundGuide} onBackPress={() => setBackgroundGuide(false)}>
        <View style={styles.content}>
          <AppText variant="subtitle" weight="bold">
            위치 권한을 항상 허용해 주세요
          </AppText>
          <AppText variant="body">
            다른 앱을 사용하는 동안에도 주차 위치를 확인하려면 설정에서 위치 권한을 ‘항상 허용’으로
            선택해 주세요.
          </AppText>
          <Button
            label="설정으로 이동"
            onPress={() => {
              setBackgroundGuide(false);
              void run(async () => {
                await requestBackgroundLocationPermission();
                await sync();
              });
            }}
          />
          <Button
            label="앱 사용 중에만 이용"
            variant="ghost"
            onPress={() => setBackgroundGuide(false)}
          />
        </View>
      </AppModal>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.lg, paddingTop: spacing.xl } });
