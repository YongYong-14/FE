import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '@/shared/theme/tokens';

interface AppTextProps extends TextProps {
  weight?: keyof typeof fonts;
  variant?: 'body' | 'title' | 'caption';
}

export function AppText({ weight = 'regular', variant = 'body', style, ...props }: AppTextProps) {
  return (
    <Text {...props} style={[styles.base, styles[variant], { fontFamily: fonts[weight] }, style]} />
  );
}

const styles = StyleSheet.create({
  base: { color: colors.ink, flexShrink: 1 },
  body: { fontSize: 16, lineHeight: 26 },
  title: { fontSize: 26, lineHeight: 38 },
  caption: { fontSize: 13, lineHeight: 21 },
});
