import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { colors, radii, spacing } from '@/shared/theme/tokens';

interface StateViewProps {
  icon?: IconName;
  loading?: boolean;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: 'muted' | 'plain';
}

/** 로딩·빈 상태·오류·지역 안내를 같은 틀로 보여준다. */
export function StateView({
  icon,
  loading,
  title,
  description,
  actions,
  tone = 'muted',
}: StateViewProps) {
  return (
    <View style={[styles.box, tone === 'muted' && styles.muted]} accessibilityLiveRegion="polite">
      <View style={styles.iconWrap}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : icon ? (
          <Icon name={icon} color={colors.textSecondary} size="lg" />
        ) : null}
      </View>
      <View style={styles.texts}>
        <AppText variant="subtitle" weight="bold" style={styles.center}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="caption" tone="secondary" style={styles.center}>
            {description}
          </AppText>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xxxl + spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
  },
  muted: { backgroundColor: colors.surfaceMuted },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  texts: { gap: spacing.xs, alignItems: 'center' },
  center: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
});
