import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { isNativeDeviceMode, nativeBluetooth } from '@/services/device/bluetooth';
import {
  locationPermission,
  requestBackgroundLocationPermission,
  requestLocationPermission,
} from '@/services/device/location';
import { AppModal } from '@/shared/components/AppModal';
import { AppText } from '@/shared/components/AppText';
import { Badge, type BadgeTone } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import type { IconName } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { Screen } from '@/shared/components/Screen';
import { IconTile } from '@/shared/components/Surface';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useSession } from '../state/SessionProvider';

function PermissionCard({
  icon,
  tint,
  title,
  description,
  status,
  onPress,
  disabled,
}: {
  icon: IconName;
  tint: string;
  title: string;
  description: string;
  status: { label: string; tone: BadgeTone };
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${status.label}. ${description}`}
    >
      <IconTile name={icon} size={48} background={tint} />
      <View style={styles.cardTexts}>
        <View style={styles.cardHead}>
          <AppText variant="label" weight="bold">
            {title}
          </AppText>
          <Badge label={status.label} tone={status.tone} size="sm" />
        </View>
        <AppText variant="micro" tone="secondary">
          {description}
        </AppText>
      </View>
    </Pressable>
  );
}

/** 로그인 후 실제 OS 권한을 요청하고, 설정 복귀 시 상태를 다시 읽는다. */
export function PermissionGuideScreen({
  mode = 'onboarding',
}: {
  mode?: 'onboarding' | 'settings';
}) {
  const router = useRouter();
  const { snapshot, updateDevice, completeOnboarding, isSaving } = useSession();
  const [backgroundGuide, setBackgroundGuide] = useState(false);
  const [notification, setNotification] = useState<'denied' | 'granted'>('denied');
  const { run, isRunning, error } = useAsyncAction((cause) =>
    cause instanceof Error ? cause.message : '권한 설정을 확인해 주세요.',
  );
  const busy = isRunning || isSaving;
  const sync = useCallback(async () => {
    const [location, bluetooth, notifications] = await Promise.all([
      locationPermission(),
      nativeBluetooth.permission(),
      nativeBluetooth.notificationPermission(),
    ]);
    await updateDevice({ locationPermission: location, bluetoothPermission: bluetooth });
    return { location, bluetooth, notifications };
  }, [updateDevice]);
  useEffect(() => {
    if (!isNativeDeviceMode) return;
    const refresh = () =>
      void sync().then(
        (result) => setNotification(result.notifications),
        () => undefined,
      );
    refresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => listener.remove();
  }, [sync]);
  const finish = async () => {
    if (isNativeDeviceMode) await sync();
    if (mode === 'onboarding') await completeOnboarding();
    else router.back();
  };
  const request = async () => {
    if (!isNativeDeviceMode)
      throw new Error('권한 설정과 차량 등록은 Android 앱에서 이용해 주세요.');
    const foreground = await requestLocationPermission();
    const bluetooth = await nativeBluetooth.requestPermission();
    // 알림은 선택 권한이라 거절해도 다음 단계로 넘어간다.
    await nativeBluetooth.requestNotificationPermission().catch(() => 'denied' as const);
    const result = await sync();
    setNotification(result.notifications);
    if (!foreground.granted || bluetooth !== 'granted') {
      throw new Error(
        '허용하지 않은 권한이 있어요. 권한 카드를 눌러 앱 설정에서 변경할 수 있어요.',
      );
    }
    if (result.location !== 'always') setBackgroundGuide(true);
    else await finish();
  };
  const device = snapshot.device;
  const locationStatus: { label: string; tone: BadgeTone } =
    device.locationPermission === 'always'
      ? { label: '허용됨', tone: 'success' }
      : device.locationPermission === 'foreground'
        ? { label: '사용 중에만', tone: 'warning' }
        : { label: '필수', tone: 'neutral' };

  return (
    <Screen
      background={colors.surface}
      contentStyle={styles.content}
      footerStyle={styles.footer}
      footer={
        <>
          {error ? <Notice title="권한 설정을 확인해 주세요" description={error} /> : null}
          <Button
            label={mode === 'onboarding' ? '권한 허용하기' : '권한 설정하기'}
            loading={busy}
            onPress={() => void run(request)}
          />
          <Button
            label={mode === 'onboarding' ? '나중에 설정' : '완료'}
            variant="ghost"
            disabled={busy}
            onPress={() => void run(finish)}
          />
        </>
      }
    >
      {mode === 'settings' ? (
        <View style={styles.nav}>
          <IconButton name="chevron-back" label="뒤로 가기" onPress={() => router.back()} />
        </View>
      ) : null}
      <AppText variant="title" weight="black" accessibilityRole="header">
        주차를 감지하려면{'\n'}권한이 필요해요
      </AppText>
      <AppText variant="caption" tone="secondary">
        앱을 닫아도 감지하려면 위치 권한을 ‘항상 허용’으로 설정해야 해요.
      </AppText>
      <View style={styles.list}>
        <PermissionCard
          icon="location-outline"
          tint={colors.primary}
          title="위치 항상 허용"
          description="앱을 닫았을 때도 주차 위치를 확인해요"
          status={locationStatus}
          disabled={busy}
          onPress={() => void run(nativeBluetooth.openAppSettings)}
        />
        <PermissionCard
          icon="bluetooth"
          tint={colors.bluetooth}
          title="블루투스"
          description="차량과 연결이 끊기는 순간을 알아채요"
          status={
            device.bluetoothPermission === 'granted'
              ? { label: '허용됨', tone: 'success' }
              : { label: '필수', tone: 'neutral' }
          }
          disabled={busy}
          onPress={() => void run(nativeBluetooth.openAppSettings)}
        />
        <PermissionCard
          icon="notifications-outline"
          tint={colors.warning}
          title="알림"
          description="앱을 닫았을 때 주차를 감지하면 위치 확인을 알려요"
          status={
            notification === 'granted'
              ? { label: '허용됨', tone: 'success' }
              : { label: '선택', tone: 'neutral' }
          }
          disabled={busy}
          onPress={() =>
            void run(async () => {
              // 이미 거절해 시스템 창이 다시 뜨지 않으면 앱 설정에서 바꾼다.
              if ((await nativeBluetooth.requestNotificationPermission()) !== 'granted')
                await nativeBluetooth.openAppSettings();
              setNotification((await sync()).notifications);
            })
          }
        />
        <PermissionCard
          icon="battery-charging-outline"
          tint={colors.sage}
          title="배터리 최적화 예외"
          description="백그라운드 감지가 꺼지지 않게 해요"
          status={{ label: '선택', tone: 'neutral' }}
          disabled={busy}
          onPress={() => void run(nativeBluetooth.openBatterySettings)}
        />
      </View>
      <AppModal visible={backgroundGuide} onBackPress={() => setBackgroundGuide(false)}>
        <AppText variant="subtitle" weight="bold">
          위치 권한을 항상 허용해 주세요
        </AppText>
        <AppText variant="body" tone="body">
          다른 앱을 사용하거나 화면을 끈 동안에도 주차 위치를 확인하려면 다음 설정에서 ‘항상 허용’을
          선택해 주세요.
        </AppText>
        <Button
          label="설정으로 이동"
          loading={busy}
          onPress={() =>
            void run(async () => {
              await requestBackgroundLocationPermission();
              setBackgroundGuide(false);
              await finish();
            })
          }
        />
        <Button
          label="앱 사용 중에만 이용"
          variant="ghost"
          disabled={busy}
          onPress={() => {
            setBackgroundGuide(false);
            void run(finish);
          }}
        />
      </AppModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 48, gap: spacing.xxl },
  footer: { gap: spacing.sm },
  nav: { marginTop: -spacing.xxxl, marginLeft: -spacing.md },
  list: { gap: spacing.xxl, marginRight: spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  cardTexts: { flex: 1, gap: spacing.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
