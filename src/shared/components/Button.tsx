import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { colors, radii, spacing } from '@/shared/theme/tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
}

export function Button({ label, onPress, disabled, loading, secondary }: ButtonProps) {
  const unavailable = Boolean(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (pressed || unavailable) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.primary : colors.surface} />
      ) : (
        <AppText weight="bold" style={{ color: secondary ? colors.primary : colors.surface }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  secondary: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  dimmed: { opacity: 0.55 },
});
