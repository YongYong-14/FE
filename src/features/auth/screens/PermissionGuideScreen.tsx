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
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { Icon, type IconName } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { Screen } from '@/shared/components/Screen';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors, iconSize, radii, spacing, touchTarget } from '@/shared/theme/tokens';
import { useSession } from '../state/SessionProvider';

type PermissionState = 'granted' | 'partial' | 'none';

/** 권한 한 줄. 카드·색 타일 없이 목록으로 보여 주고 상태는 오른쪽 끝에만 표시한다. */
function PermissionRow({
  icon,
  title,
  description,
  state,
  stateLabel,
  onPress,
  disabled,
}: {
  icon: IconName;
  title: string;
  description: string;
  state: PermissionState;
  /** 허용 전에는 화살표만 보여 주고, 읽어 주는 문구로만 쓴다. */
  stateLabel: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${stateLabel}. ${description}`}
    >
      <View style={styles.rowIcon}>
        <Icon name={icon} size={iconSize.md} color={colors.ink} />
      </View>
      <View style={styles.rowTexts}>
        <AppText variant="body" weight="bold">
          {title}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {description}
        </AppText>
      </View>
      {state === 'none' ? (
        <Icon name="chevron-forward" size={iconSize.sm} color={colors.textSecondary} />
      ) : (
        <AppText
          variant="caption"
          weight="bold"
          style={{ color: state === 'granted' ? colors.primary : colors.warningText }}
        >
          {stateLabel}
        </AppText>
      )}
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
  const locationState: PermissionState =
    device.locationPermission === 'always'
      ? 'granted'
      : device.locationPermission === 'foreground'
        ? 'partial'
        : 'none';

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
      <View>
        <AppText variant="caption" weight="bold" tone="secondary" style={styles.section}>
          필수 권한
        </AppText>
        <PermissionRow
          icon="location-outline"
          title="위치"
          description="앱을 닫아도 주차 위치를 확인해요"
          state={locationState}
          stateLabel={
            locationState === 'granted'
              ? '항상 허용'
              : locationState === 'partial'
                ? '사용 중에만'
                : '허용 안 됨'
          }
          disabled={busy}
          onPress={() => void run(nativeBluetooth.openAppSettings)}
        />
        <View style={styles.divider} />
        <PermissionRow
          icon="bluetooth"
          title="근처 기기"
          description="차량과 연결이 끊기는 순간을 감지해요"
          state={device.bluetoothPermission === 'granted' ? 'granted' : 'none'}
          stateLabel={device.bluetoothPermission === 'granted' ? '허용됨' : '허용 안 됨'}
          disabled={busy}
          onPress={() => void run(nativeBluetooth.openAppSettings)}
        />
        <AppText
          variant="caption"
          weight="bold"
          tone="secondary"
          style={[styles.section, styles.sectionGap]}
        >
          선택 권한
        </AppText>
        <PermissionRow
          icon="notifications-outline"
          title="알림"
          description="주차를 감지하면 위치 확인 알림을 보내요"
          state={notification === 'granted' ? 'granted' : 'none'}
          stateLabel={notification === 'granted' ? '허용됨' : '허용 안 됨'}
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
        <View style={styles.divider} />
        <PermissionRow
          icon="battery-charging-outline"
          title="배터리 사용 제한 해제"
          description="백그라운드 감지가 중단되지 않게 해요"
          state="none"
          stateLabel="설정에서 변경"
          disabled={busy}
          onPress={() => void run(nativeBluetooth.openBatterySettings)}
        />
      </View>
      <AppText variant="micro" tone="secondary">
        선택 권한은 허용하지 않아도 앱을 이용할 수 있어요. 권한은 휴대폰 설정에서 언제든 바꿀 수
        있어요.
      </AppText>
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

const ROW_ICON = 40;

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xxxl, paddingBottom: spacing.lg, gap: spacing.xl },
  footer: { gap: spacing.sm },
  nav: { marginTop: -spacing.xl, marginLeft: -spacing.md },
  section: { paddingBottom: spacing.xs },
  sectionGap: { paddingTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget,
    paddingVertical: spacing.md,
  },
  rowPressed: { opacity: 0.6 },
  rowIcon: {
    width: ROW_ICON,
    height: ROW_ICON,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  rowTexts: { flex: 1 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: ROW_ICON + spacing.md,
    backgroundColor: colors.line,
  },
});
