import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { colors, radii, shadows, spacing } from '@/shared/theme/tokens';

import { useParking } from '../state/ParkingProvider';

const VISIBLE_MS = 8000;

/**
 * 06 위험 알림. 서버는 푸시를 보내지 않고 알림 여부(notify.decision)만 정한다.
 * 앱은 SEND이고 유효기간(expiresAt) 안이며 처음인 주차만 띄우고, 띄운 뒤 표시 결과를 보고한다.
 * OS 알림(expo-notifications)은 새 개발 빌드가 필요해 지금은 앱 안 알림으로 띄운다.
 */
export function AlertHost() {
  const router = useRouter();
  const { pendingAlert, acknowledgeAlert, dismissAlert } = useParking();

  useEffect(() => {
    if (!pendingAlert) return;
    // 표시 직전에 유효기간을 다시 확인한다.
    if (Date.parse(pendingAlert.expiresAt) <= Date.now()) {
      dismissAlert();
      return;
    }
    acknowledgeAlert(pendingAlert);
    const timeout = setTimeout(dismissAlert, VISIBLE_MS);
    return () => clearTimeout(timeout);
  }, [pendingAlert, acknowledgeAlert, dismissAlert]);

  if (!pendingAlert) return null;
  const tone = pendingAlert.level === 1 ? colors.danger : colors.warning;

  return (
    <SafeAreaView edges={['top']} style={styles.wrap} pointerEvents="box-none">
      <View
        style={[styles.card, { borderLeftColor: tone }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
      >
        <Pressable
          style={styles.body}
          accessibilityRole="button"
          accessibilityLabel={`${pendingAlert.title}. ${pendingAlert.body}. 자세히 보기`}
          onPress={() => {
            dismissAlert();
            router.push({
              pathname: '/parking/result',
              params: { recordId: pendingAlert.recordId },
            });
          }}
        >
          <Icon name="notifications" color={tone} size="lg" />
          <View style={styles.texts}>
            <AppText variant="label" weight="bold">
              {pendingAlert.title}
            </AppText>
            <AppText variant="caption" tone="body">
              {pendingAlert.body}
            </AppText>
          </View>
        </Pressable>
        <Pressable
          onPress={dismissAlert}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="알림 닫기"
        >
          <Icon name="close" color={colors.textSecondary} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderLeftWidth: 5,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  texts: { flex: 1, gap: 2 },
});
