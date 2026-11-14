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
  /** 좁은 시트 안에서 스크롤 없이 보이도록 아이콘을 빼고 버튼을 한 줄에 놓는다. */
  compact?: boolean;
}

/** 로딩·빈 상태·오류·지역 안내를 같은 틀로 보여준다. */
export function StateView({
  icon,
  loading,
  title,
  description,
  actions,
  tone = 'muted',
  compact = false,
}: StateViewProps) {
  return (
    <View
      style={[styles.box, compact && styles.compactBox, tone === 'muted' && styles.muted]}
      accessibilityLiveRegion="polite"
    >
      {compact ? (
        loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : null
      ) : (
        <View style={styles.iconWrap}>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : icon ? (
            <Icon name={icon} color={colors.textSecondary} size="lg" />
          ) : null}
        </View>
      )}
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
      {actions ? (
        <View style={[styles.actions, compact && styles.compactActions]}>{actions}</View>
      ) : null}
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
  compactBox: { gap: spacing.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
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
  compactActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
