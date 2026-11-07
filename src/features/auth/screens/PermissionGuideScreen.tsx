import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppModal } from '@/shared/components/AppModal';
import { AppText } from '@/shared/components/AppText';
import { Badge, type BadgeTone } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';
import { Icon, type IconName } from '@/shared/components/Icon';
import { IconButton } from '@/shared/components/IconButton';
import { Screen } from '@/shared/components/Screen';
import { IconTile } from '@/shared/components/Surface';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import type {
  BluetoothPermission,
  DemoDeviceState,
  LocationPermission,
} from '@/shared/types/session';

import { useSession } from '../state/SessionProvider';

type Step = 'location' | 'location-always' | 'bluetooth' | 'battery' | null;

const locationStatus: Record<LocationPermission, { label: string; tone: BadgeTone }> = {
  unset: { label: '필수', tone: 'neutral' },
  denied: { label: '거부됨', tone: 'danger' },
  foreground: { label: '사용 중에만', tone: 'warning' },
  always: { label: '항상 허용', tone: 'success' },
};

const bluetoothStatus: Record<BluetoothPermission, { label: string; tone: BadgeTone }> = {
  unset: { label: '필수', tone: 'neutral' },
  denied: { label: '거부됨', tone: 'danger' },
  granted: { label: '허용됨', tone: 'success' },
};

function PermissionCard({
  icon,
  tint,
  title,
  description,
  status,
}: {
  icon: IconName;
  tint: string;
  title: string;
  description: string;
  status: { label: string; tone: BadgeTone };
}) {
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${title}, ${status.label}. ${description}`}
    >
      <IconTile name={icon} background={tint} />
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
    </View>
  );
}

function DemoDialog({
  visible,
  icon,
  guide,
  question,
  options,
}: {
  visible: boolean;
  icon: IconName;
  guide?: string;
  question: string;
  options: { label: string; onPress: () => void; recommended?: boolean }[];
}) {
  return (
    <AppModal visible={visible}>
      {guide ? (
        <View style={styles.guide}>
          <AppText variant="caption" weight="bold" tone="inverse" style={styles.center}>
            {guide}
          </AppText>
        </View>
      ) : null}
      <View style={styles.dialogHead}>
        <Icon name={icon} color={colors.primary} size="lg" />
        <AppText variant="body" style={styles.center}>
          {question}
        </AppText>
        <AppText variant="micro" tone="secondary" style={styles.center}>
          [데모] 실제 Android 권한 창이 아니에요
        </AppText>
      </View>
      <View style={styles.dialogActions}>
        {options.map((option) => (
          <Button
            key={option.label}
            label={option.label}
            variant={option.recommended ? 'primary' : 'neutral'}
            size="md"
            onPress={option.onPress}
          />
        ))}
      </View>
    </AppModal>
  );
}

/**
 * 권한 안내·온보딩. 허용·거부·설정 복귀는 데모 권한 상태로만 기록하며 실제 OS 팝업을 띄우지 않는다.
 * mode="settings"는 홈의 권한 부족 안내에서 다시 들어온 경우다.
 */
export function PermissionGuideScreen({
  mode = 'onboarding',
}: {
  mode?: 'onboarding' | 'settings';
}) {
  const router = useRouter();
  const { snapshot, completeOnboarding, updateDevice, isSaving } = useSession();
  const { run, isRunning, error } = useAsyncAction();
  const [step, setStep] = useState<Step>(null);
  const [draft, setDraft] = useState<
    Pick<DemoDeviceState, 'locationPermission' | 'bluetoothPermission'>
  >({
    locationPermission: snapshot.device.locationPermission,
    bluetoothPermission: snapshot.device.bluetoothPermission,
  });

  function finish(next = draft) {
    setStep(null);
    void run(async () => {
      if (mode === 'onboarding') {
        await completeOnboarding(next);
      } else {
        await updateDevice(next);
        router.back();
      }
    });
  }

  function setLocation(locationPermission: LocationPermission, nextStep: Step) {
    setDraft((previous) => ({ ...previous, locationPermission }));
    setStep(nextStep);
  }

  function setBluetooth(bluetoothPermission: BluetoothPermission) {
    setDraft((previous) => ({ ...previous, bluetoothPermission }));
    setStep('battery');
  }

  const busy = isRunning || isSaving;

  return (
    <Screen
      background={colors.surface}
      contentStyle={styles.content}
      footer={
        <>
          {error ? (
            <AppText
              variant="caption"
              tone="danger"
              accessibilityRole="alert"
              style={styles.center}
            >
              {error}
            </AppText>
          ) : null}
          <Button label="권한 허용하기" onPress={() => setStep('location')} loading={busy} />
          <Button
            label={mode === 'onboarding' ? '나중에 설정' : '닫기'}
            variant="ghost"
            size="md"
            onPress={() => (mode === 'onboarding' ? finish() : router.back())}
            disabled={busy}
          />
        </>
      }
    >
      {mode === 'settings' ? (
        <View style={styles.nav}>
          <IconButton name="chevron-back" label="뒤로 가기" onPress={() => router.back()} />
        </View>
      ) : null}
      <View style={styles.header}>
        <AppText variant="title" weight="black" accessibilityRole="header">
          주차를 감지하려면{'\n'}권한이 필요해요
        </AppText>
        <AppText variant="caption" tone="secondary">
          앱을 닫아도 감지하려면 위치 권한을 ‘항상 허용’으로 설정해야 해요. 이번 데모에서는 실제
          권한을 요청하지 않아요.
        </AppText>
      </View>
      <View style={styles.list}>
        <PermissionCard
          icon="location-outline"
          tint={colors.primary}
          title="위치 · 항상 허용"
          description="앱을 닫았을 때도 주차 위치를 확인해요"
          status={locationStatus[draft.locationPermission]}
        />
        <PermissionCard
          icon="bluetooth"
          tint={colors.bluetooth}
          title="블루투스"
          description="차량과 연결이 끊기는 순간을 알아채요"
          status={bluetoothStatus[draft.bluetoothPermission]}
        />
        <PermissionCard
          icon="battery-charging-outline"
          tint={colors.sage}
          title="배터리 최적화 예외"
          description="백그라운드 감지가 꺼지지 않게 해요"
          status={{ label: '선택', tone: 'neutral' }}
        />
      </View>

      <DemoDialog
        visible={step === 'location'}
        icon="location-outline"
        guide="먼저 ‘앱 사용 중에만 허용’을 눌러 주세요"
        question="‘세울까말까’에서 이 기기의 위치 정보에 액세스하도록 허용하시겠습니까?"
        options={[
          {
            label: '앱 사용 중에만 허용',
            recommended: true,
            onPress: () => setLocation('foreground', 'location-always'),
          },
          { label: '이번만 허용', onPress: () => setLocation('foreground', 'location-always') },
          { label: '허용 안 함', onPress: () => setLocation('denied', 'bluetooth') },
        ]}
      />
      <DemoDialog
        visible={step === 'location-always'}
        icon="settings-outline"
        guide="설정에서 ‘항상 허용’을 선택해 주세요"
        question="위치 권한 설정 화면이에요. 앱을 닫아도 주차를 감지하려면 ‘항상 허용’이 필요해요."
        options={[
          {
            label: '항상 허용',
            recommended: true,
            onPress: () => setLocation('always', 'bluetooth'),
          },
          { label: '앱 사용 중에만 허용', onPress: () => setLocation('foreground', 'bluetooth') },
        ]}
      />
      <DemoDialog
        visible={step === 'bluetooth'}
        icon="bluetooth"
        question="‘세울까말까’에서 근처 기기를 찾고 연결하도록 허용하시겠습니까?"
        options={[
          { label: '허용', recommended: true, onPress: () => setBluetooth('granted') },
          { label: '허용 안 함', onPress: () => setBluetooth('denied') },
        ]}
      />
      <DemoDialog
        visible={step === 'battery'}
        icon="battery-charging-outline"
        question="배터리 최적화에서 ‘세울까말까’를 제외할까요? 설정하지 않아도 이용할 수 있어요."
        options={[
          { label: '설정하고 계속', recommended: true, onPress: () => finish() },
          { label: '건너뛰기', onPress: () => finish() },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xxxl + spacing.lg, gap: spacing.xl + 2 },
  nav: { marginTop: -spacing.xxxl, marginLeft: -spacing.md },
  header: { gap: spacing.sm },
  list: { gap: spacing.sm + 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + 1,
    padding: 15,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  cardTexts: { flex: 1, gap: 3 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, flexWrap: 'wrap' },
  center: { textAlign: 'center' },
  guide: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
  },
  dialogHead: { alignItems: 'center', gap: spacing.sm },
  dialogActions: { gap: spacing.sm },
});
