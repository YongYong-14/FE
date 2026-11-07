import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '@/shared/theme/tokens';

interface ScreenProps {
  /** 하단에 고정되는 버튼 영역. 짧은 화면에서도 본문은 스크롤로 접근한다. */
  footer?: ReactNode;
  background?: string;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  /** 본문을 위아래로 벌려 배치한다(로그인처럼 상하 분리 레이아웃). */
  spread?: boolean;
}

export function Screen({
  children,
  footer,
  background = colors.background,
  edges = ['top', 'left', 'right', 'bottom'],
  contentStyle,
  spread,
}: PropsWithChildren<ScreenProps>) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={edges}>
      <ScrollView
        contentContainerStyle={[styles.content, spread && styles.spread, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { backgroundColor: background }]}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  spread: { justifyContent: 'space-between' },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
});
