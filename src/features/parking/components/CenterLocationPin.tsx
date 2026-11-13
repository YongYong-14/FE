import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { colors, radii, shadows, spacing } from '@/shared/theme/tokens';

/** 핀 끝은 지도 정중앙에 고정한다. 터치는 아래의 지도에 전달한다. */
export function CenterLocationPin({ hint }: { hint: string }) {
  return (
    <View pointerEvents="none" style={styles.anchor} accessibilityLabel="지도 중앙 주차 위치 핀">
      <View style={styles.pin}>
        <View style={styles.pinIcon}>
          <Icon name="car" size={20} color={colors.inverse} />
        </View>
      </View>
      <View style={styles.shadow} />
      <View style={styles.tooltip}>
        <AppText variant="caption" weight="bold" tone="inverse" style={styles.center}>
          {hint}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  pin: {
    position: 'absolute',
    left: -22,
    top: -54,
    width: 44,
    height: 44,
    backgroundColor: colors.ink,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    borderBottomLeftRadius: 4,
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadows.pin,
  },
  pinIcon: { transform: [{ rotate: '45deg' }] },
  shadow: {
    position: 'absolute',
    left: -6,
    top: -3,
    width: 12,
    height: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  tooltip: {
    position: 'absolute',
    width: 264,
    left: -132,
    top: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.ink,
  },
  center: { textAlign: 'center' },
});
