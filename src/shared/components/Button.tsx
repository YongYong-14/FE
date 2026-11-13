import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { colors, radii, spacing, touchTarget } from '@/shared/theme/tokens';

export type ButtonVariant =
  'primary' | 'neutral' | 'outline' | 'kakao' | 'ghost' | 'link' | 'inverse';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** 기존 호출부 호환용. `variant="outline"`과 같다. */
  secondary?: boolean;
  size?: 'lg' | 'md' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
}

const variantStyles = {
  primary: { bg: colors.primary, fg: colors.inverse, ripple: 'rgba(255,255,255,0.22)' },
  neutral: { bg: colors.surfaceMuted, fg: colors.ink, ripple: 'rgba(0,0,0,0.08)' },
  outline: { bg: colors.surface, fg: colors.ink, ripple: 'rgba(0,0,0,0.08)' },
  kakao: { bg: colors.kakao, fg: colors.ink, ripple: 'rgba(0,0,0,0.08)' },
  ghost: { bg: 'transparent', fg: colors.textSecondary, ripple: 'rgba(0,0,0,0.06)' },
  link: { bg: 'transparent', fg: colors.primary, ripple: 'rgba(31,99,224,0.10)' },
  inverse: { bg: colors.surface, fg: colors.ink, ripple: 'rgba(0,0,0,0.08)' },
} as const;

const sizes = {
  lg: { minHeight: 56, paddingHorizontal: spacing.md, fontVariant: 'subtitle' as const },
  md: { minHeight: touchTarget, paddingHorizontal: spacing.lg, fontVariant: 'body' as const },
  sm: { minHeight: 36, paddingHorizontal: spacing.md, fontVariant: 'caption' as const },
};

export function Button({
  label,
  onPress,
  variant,
  secondary,
  size = 'lg',
  disabled,
  loading,
  leading,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const resolved: ButtonVariant = variant ?? (secondary ? 'outline' : 'primary');
  const tone = variantStyles[resolved];
  const dimension = sizes[size];
  const unavailable = Boolean(disabled || loading);
  const disabledLook = Boolean(disabled && !loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: unavailable, busy: Boolean(loading) }}
      disabled={unavailable}
      onPress={onPress}
      android_ripple={{ color: tone.ripple }}
      hitSlop={size === 'sm' ? 6 : undefined}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: dimension.minHeight,
          paddingHorizontal: dimension.paddingHorizontal,
          backgroundColor: disabledLook ? colors.track : tone.bg,
        },
        resolved === 'outline' && styles.outline,
        size === 'sm' && styles.small,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.fg} />
      ) : (
        <View style={styles.content}>
          {leading}
          <AppText
            variant={dimension.fontVariant}
            weight="bold"
            style={{ color: disabledLook ? colors.textSecondary : tone.fg, textAlign: 'center' }}
          >
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  outline: { borderColor: colors.line, borderWidth: 1 },
  small: { borderRadius: radii.xs },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.86 },
});
