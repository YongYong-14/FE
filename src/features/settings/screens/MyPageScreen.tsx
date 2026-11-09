import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { useAppReset } from '@/providers/useAppReset';
import {
  describeError,
  isApiMode,
  notificationSettingsService,
  systemService,
  type NotificationSettings,
} from '@/services';
import { AppModal } from '@/shared/components/AppModal';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { IconTile } from '@/shared/components/Surface';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { hasDetectionPermissions } from '@/shared/types/session';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <AppText variant="caption" weight="bold" tone="secondary" accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

function Row({
  title,
  description,
  trailing,
  onPress,
  last,
  danger,
}: {
  title: string;
  description?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
}) {
  const content = (
    <>
      <View style={styles.rowTexts}>
        <AppText
          variant="label"
          weight="bold"
          style={danger ? { color: colors.dangerText } : undefined}
        >
          {title}
        </AppText>
        {description ? (
          <AppText variant="micro" tone="secondary">
            {description}
          </AppText>
        ) : null}
      </View>
      {trailing ??
        (onPress ? <Icon name="chevron-forward" size="sm" color={colors.textSecondary} /> : null)}
    </>
  );
  if (!onPress) return <View style={[styles.row, !last && styles.divider]}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
      style={[styles.row, !last && styles.divider]}
    >
      {content}
    </Pressable>
  );
}

type SettingKey = 'cautionEnabled' | 'nightEnabled';

/** 알림 설정(GET·PATCH /notification-settings). 1단계 위험 알림은 끌 수 없다. */
function NotificationGroup() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [saving, setSaving] = useState<SettingKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(
    () =>
      notificationSettingsService
        .get()
        .then((value) => {
          setSettings(value);
          setStatus('done');
        })
        .catch(() => setStatus('error')),
    [],
  );

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  function retry() {
    setStatus('loading');
    void fetchSettings();
  }

  async function toggle(key: SettingKey, value: boolean) {
    if (!settings || saving) return;
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    setSaving(key);
    setError(null);
    try {
      setSettings(await notificationSettingsService.update({ [key]: value }));
    } catch (cause) {
      setSettings(previous);
      setError(describeError(cause, '설정을 바꾸지 못했어요. 다시 시도해 주세요.'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Group title="알림">
      {status === 'loading' ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" tone="secondary">
            알림 설정을 불러오고 있어요
          </AppText>
        </View>
      ) : status === 'error' || !settings ? (
        <Row
          title="알림 설정을 불러오지 못했어요"
          description="눌러서 다시 시도해요"
          last
          onPress={retry}
        />
      ) : (
        <>
          <Row
            title="위험(1단계) 알림"
            description="소화전·버스정류소 주변은 항상 알려요"
            trailing={
              <Switch
                accessibilityLabel="위험 알림, 항상 켜짐"
                value
                disabled
                trackColor={{ true: colors.primary, false: colors.line }}
                thumbColor={colors.surface}
              />
            }
          />
          <Row
            title="주의(2단계) 알림"
            description="신고가 몰리는 곳을 알려요. 상위 2% 구역은 꺼도 알려요"
            trailing={
              <Switch
                accessibilityLabel="주의 알림"
                value={settings.cautionEnabled}
                disabled={saving !== null}
                onValueChange={(value) => void toggle('cautionEnabled', value)}
                trackColor={{ true: colors.primary, false: colors.line }}
                thumbColor={colors.surface}
              />
            }
          />
          <Row
            title="야간 주의 알림"
            description="22시~다음 날 7시에도 2단계를 알려요"
            last={!error}
            trailing={
              <Switch
                accessibilityLabel="야간 주의 알림"
                value={settings.nightEnabled}
                disabled={saving !== null}
                onValueChange={(value) => void toggle('nightEnabled', value)}
                trackColor={{ true: colors.primary, false: colors.line }}
                thumbColor={colors.surface}
              />
            }
          />
          {error ? (
            <View style={styles.row}>
              <AppText variant="caption" tone="danger" accessibilityRole="alert">
                {error}
              </AppText>
            </View>
          ) : null}
        </>
      )}
    </Group>
  );
}

export function MyPageScreen() {
  const router = useRouter();
  const { snapshot, signOut, withdraw, setSurveyEnabled, isSaving } = useSession();
  const reset = useAppReset();
  const { run, isRunning, error } = useAsyncAction();
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const permitted = hasDetectionPermissions(snapshot.device);
  const busy = isRunning || isSaving;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title" weight="black" accessibilityRole="header">
          마이페이지
        </AppText>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Icon name="person-outline" size={22} />
          </View>
          <View style={styles.flex}>
            <AppText variant="body" weight="bold">
              {snapshot.user?.nickname} 님
            </AppText>
            <AppText variant="micro" tone="secondary">
              {isApiMode ? '카카오 계정으로 로그인됨' : '카카오 계정으로 로그인됨 (데모)'}
            </AppText>
          </View>
        </View>

        <View style={styles.card}>
          <IconTile
            name="bluetooth"
            size={40}
            background={colors.primarySoft}
            color={colors.primary}
          />
          <View style={styles.flex}>
            <AppText variant="micro" tone="secondary">
              등록한 차량
            </AppText>
            <AppText variant="label" weight="bold">
              {snapshot.vehicle?.name}
            </AppText>
          </View>
          <Button
            label="변경"
            variant="neutral"
            size="sm"
            onPress={() => router.push('/settings/vehicle')}
            accessibilityLabel="등록 차량 변경"
          />
        </View>

        <NotificationGroup />

        <Group title="설정">
          <Row
            title="재탑승 사후 설문"
            description="다시 차에 타면 이전 위험 주차의 단속 여부를 물어봐요"
            last
            trailing={
              <Switch
                accessibilityLabel="재탑승 사후 설문"
                value={snapshot.surveyEnabled}
                disabled={busy}
                onValueChange={(value) => void run(() => setSurveyEnabled(value))}
                trackColor={{ true: colors.primary, false: colors.line }}
                thumbColor={colors.surface}
              />
            }
          />
        </Group>

        <Group title="권한·계정">
          <Row
            title="권한 상태"
            onPress={() => router.push('/settings/permissions')}
            trailing={
              <View style={styles.trailing}>
                <AppText
                  variant="caption"
                  style={{ color: permitted ? colors.textSecondary : colors.warningText }}
                >
                  {permitted ? '모두 허용 (데모)' : '일부 제한'}
                </AppText>
                <Icon name="chevron-forward" size="sm" color={colors.textSecondary} />
              </View>
            }
          />
          <Row title="약관 및 정책" onPress={() => router.push('/settings/legal')} />
          <Row title="로그아웃" onPress={() => void run(signOut)} trailing={<View />} />
          <Row title="회원 탈퇴" last onPress={() => setConfirmWithdraw(true)} />
        </Group>

        <Group title="시연">
          <Row
            title="데모 설정"
            description="시나리오·다음 응답·초기화"
            last
            onPress={() => router.push('/settings/demo')}
          />
        </Group>

        {error ? (
          <AppText variant="caption" tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        <AppText variant="micro" tone="secondary">
          버전 0.1.0 · {isApiMode ? `서버 연결 ${systemService.baseUrl ?? ''}` : '프론트엔드 데모'}
        </AppText>
      </ScrollView>

      <AppModal
        visible={confirmWithdraw}
        onDismiss={() => !withdrawing && setConfirmWithdraw(false)}
      >
        <View style={styles.modalTexts}>
          <AppText variant="heading" weight="bold">
            회원 탈퇴하시겠어요?
          </AppText>
          <AppText variant="body" tone="body">
            {isApiMode
              ? '서버에 저장된 계정·차량·주차 기록·동의 이력이 모두 바로 삭제되고, 되돌릴 수 없어요.'
              : '이 기기에 보관한 데모 계정 정보와 지금까지의 주차 기록이 모두 삭제되고, 되돌릴 수 없어요.'}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {isApiMode
              ? '카카오 계정 연결도 함께 끊어요.'
              : '실제 카카오 계정·서버 데이터는 바뀌지 않아요.'}
          </AppText>
          {withdrawError ? (
            <AppText variant="caption" tone="danger" accessibilityRole="alert">
              {withdrawError}
            </AppText>
          ) : null}
        </View>
        <Button
          label="탈퇴하기"
          style={styles.withdrawButton}
          loading={withdrawing}
          onPress={() => {
            setWithdrawing(true);
            setWithdrawError(null);
            // 서버 삭제(DELETE /me)가 성공한 뒤에만 기기 데이터를 지운다.
            void withdraw()
              .then(async () => {
                await reset();
                setConfirmWithdraw(false);
              })
              .catch((cause: unknown) =>
                setWithdrawError(describeError(cause, '탈퇴하지 못했어요. 다시 시도해 주세요.')),
              )
              .finally(() => setWithdrawing(false));
          }}
        />
        <Button
          label="취소"
          variant="outline"
          disabled={withdrawing}
          onPress={() => setConfirmWithdraw(false)}
        />
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + 1,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.parking,
  },
  group: { gap: 7, marginTop: spacing.xs },
  groupCard: { borderRadius: radii.md, backgroundColor: colors.surface, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowTexts: { flex: 1, gap: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  modalTexts: { gap: spacing.sm },
  withdrawButton: { backgroundColor: colors.danger },
});
