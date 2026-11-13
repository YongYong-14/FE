import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, radii, shadows, spacing } from '@/shared/theme/tokens';

/** 흰 카드(라운드 14). 회색 배경 위의 정보 묶음에 사용한다. */
export function Card({
  children,
  tone = 'surface',
  style,
}: PropsWithChildren<{ tone?: 'surface' | 'muted'; style?: ViewStyle }>) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tone === 'surface' ? colors.surface : colors.surfaceMuted },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** 색 배경 안의 아이콘 타일. 장식용이므로 보조 기술에서 숨긴다. */
export function IconTile({
  name,
  background = colors.primary,
  color = colors.inverse,
  size = 42,
  iconPixels,
}: {
  name: IconName;
  background?: string;
  color?: string;
  size?: number;
  iconPixels?: number;
}) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          backgroundColor: background,
          borderRadius: radii.sm,
        },
      ]}
    >
      <Icon name={name} color={color} size={iconPixels ?? Math.round(size / 2)} />
    </View>
  );
}

/** 지도 위에 올라가는 하단 시트 표면. */
export function SheetSurface({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return (
    <View style={[styles.sheet, style]}>
      <View style={styles.handle} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.md, padding: spacing.xl, gap: spacing.sm },
  tile: { alignItems: 'center', justifyContent: 'center' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
    boxShadow: shadows.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
});
