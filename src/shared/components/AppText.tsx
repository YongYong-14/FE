import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '@/shared/theme/tokens';

const tones = {
  default: colors.ink,
  body: colors.textBody,
  secondary: colors.textSecondary,
  primary: colors.primary,
  danger: colors.dangerText,
  inverse: colors.inverse,
} as const;

export type TextVariant = keyof typeof styles;
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
  return (
    <Text
      {...props}
      style={[
        styles.base,
        styles[variant],
        { color: tones[tone], fontFamily: fonts[weight] },
        style,
      ]}
    />
  );
}

// 글자 배율을 막지 않고, 줄바꿈을 허용하는 기본 크기 단계.
const styles = StyleSheet.create({
  base: { flexShrink: 1 },
  display: { fontSize: 26, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 34, letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  subtitle: { fontSize: 17, lineHeight: 25 },
  body: { fontSize: 15, lineHeight: 23 },
  label: { fontSize: 14, lineHeight: 21 },
  caption: { fontSize: 13, lineHeight: 20 },
  micro: { fontSize: 12, lineHeight: 18 },
});
