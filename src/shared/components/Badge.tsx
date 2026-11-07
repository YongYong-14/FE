import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radii, spacing } from '@/shared/theme/tokens';

export type BadgeTone = 'neutral' | 'primary' | 'danger' | 'warning' | 'success';

const tones: Record<BadgeTone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: colors.neutralSoft, fg: colors.neutralText, dot: colors.textSecondary },
  primary: { bg: colors.primarySoft, fg: colors.primary, dot: colors.primary },
  danger: { bg: colors.dangerSoft, fg: colors.dangerText, dot: colors.danger },
  warning: { bg: colors.warningSoft, fg: colors.warningText, dot: colors.warning },
  success: { bg: colors.successSoft, fg: colors.successText, dot: colors.successText },
};

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  size?: 'md' | 'sm';
}

/** 상태 라벨. 색만으로 의미를 전달하지 않도록 항상 글자를 함께 표시한다. */
export function Badge({ label, tone = 'neutral', dot, size = 'md' }: BadgeProps) {
  const palette = tones[tone];
  return (
    <View
      style={[styles.badge, size === 'sm' && styles.small, { backgroundColor: palette.bg }]}
      accessibilityRole="text"
    >
      {dot ? <View style={[styles.dot, { backgroundColor: palette.dot }]} /> : null}
      <AppText
        variant={size === 'sm' ? 'micro' : 'caption'}
        weight="bold"
        style={{ color: palette.fg }}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    minHeight: 28,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  small: { minHeight: 22, paddingHorizontal: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
