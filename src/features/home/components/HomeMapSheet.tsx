import { useRef, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { MapBottomSheet } from '@/shared/components/MapBottomSheet';
import { colors, radii, shadows, spacing, touchTarget } from '@/shared/theme/tokens';

/** 홈 전용 내용과 현 위치 도구를 공통 지도 시트에 배치한다. */
export function HomeMapSheet({
  map,
  locating,
  locationError,
  onLocate,
  children,
}: {
  map: ReactNode;
  locating: boolean;
  locationError: string | null;
  onLocate: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  return (
    <MapBottomSheet
      map={map}
      accessibilityLabel="홈 정보 패널 높이"
      onCollapse={() => scroll.current?.scrollTo({ y: 0, animated: false })}
      mapTools={
        <>
          {locating || locationError ? (
            <View style={styles.locationMessage} accessibilityLiveRegion="polite">
              <AppText variant="micro" tone="secondary">
                {locating ? '현재 위치를 확인하고 있어요' : locationError}
              </AppText>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="현재 위치로 이동"
            accessibilityState={{ disabled: locating, busy: locating }}
            disabled={locating}
            onPress={onLocate}
            style={({ pressed }) => [styles.locate, pressed && { opacity: 0.75 }]}
          >
            {locating ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Icon name="locate" color={colors.primary} size={24} />
            )}
          </Pressable>
        </>
      }
    >
      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingLeft: spacing.xl + insets.left, paddingRight: spacing.xl + insets.right },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </MapBottomSheet>
  );
}

const styles = StyleSheet.create({
  locationMessage: {
    flexShrink: 1,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    boxShadow: shadows.floating,
  },
  locate: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
  scroll: { flex: 1 },
  content: { gap: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
});
