import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { colors, radii, spacing } from '@/shared/theme/tokens';

type NoticeTone = 'danger' | 'info' | 'warning';

const tones: Record<NoticeTone, { bg: string; icon: IconName; iconColor: string }> = {
  danger: { bg: colors.dangerSoft, icon: 'alert-circle', iconColor: colors.danger },
  info: { bg: colors.primarySoft, icon: 'information-circle', iconColor: colors.primary },
  warning: { bg: colors.warningSoft, icon: 'warning', iconColor: colors.warning },
};

/** 화면 안 인라인 안내. 오류는 보조 기술에 즉시 알린다. */
export function Notice({
  title,
  description,
  tone = 'danger',
}: {
  title: string;
  description?: string;
  tone?: NoticeTone;
}) {
  const palette = tones[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: palette.bg }]}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      <Icon name={palette.icon} color={palette.iconColor} size="lg" />
      <View style={styles.texts}>
        <AppText variant="label" weight="bold">
          {title}
        </AppText>
        {description ? (
          <AppText variant="micro" tone="body">
            {description}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** 화면 하단 어두운 안내 막대(권한 부족·블루투스 꺼짐). */
export function BottomBanner({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <AppText variant="micro" tone="inverse" style={styles.bannerText}>
        {message}
      </AppText>
      <Button label={actionLabel} onPress={onAction} variant="inverse" size="sm" />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
  },
  texts: { flex: 1, gap: spacing.xxs },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.toast,
  },
  bannerText: { flex: 1 },
});
