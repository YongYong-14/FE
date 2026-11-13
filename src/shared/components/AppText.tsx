import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts, textMetrics } from '@/shared/theme/tokens';

const tones = {
  default: colors.ink,
  body: colors.textBody,
  secondary: colors.textSecondary,
  primary: colors.primary,
  danger: colors.dangerText,
  inverse: colors.inverse,
} as const;

export type TextVariant = keyof typeof variants;
export type TextTone = keyof typeof tones;

interface AppTextProps extends TextProps {
  weight?: keyof typeof fonts;
  variant?: TextVariant;
  tone?: TextTone;
}

export function AppText({
  weight = 'regular',
  variant = 'body',
  tone = 'default',
  style,
  ...props
}: AppTextProps) {
  const override = StyleSheet.flatten(style);
  const metrics = textMetrics(
    override?.fontSize ?? variants[variant].fontSize,
    variant === 'display' || variant === 'title' || variant === 'heading' ? 1.5 : 1.6,
  );
  return (
    <Text
      textBreakStrategy="balanced"
      {...props}
      style={[
        styles.base,
        variants[variant],
        { color: tones[tone], fontFamily: fonts[weight] },
        style,
        metrics,
      ]}
    />
  );
}

// 글자 배율을 막지 않고, 줄바꿈을 허용하는 기본 크기 단계.
const variants = StyleSheet.create({
  display: { fontSize: 26 },
  title: { fontSize: 24 },
  heading: { fontSize: 20 },
  subtitle: { fontSize: 17 },
  body: { fontSize: 15 },
  label: { fontSize: 14 },
  caption: { fontSize: 13 },
  micro: { fontSize: 12 },
});
const styles = StyleSheet.create({
  base: {
    flexShrink: 1,
    ...Platform.select({ web: { wordBreak: 'keep-all' as const }, default: {} }),
  },
});
