import { useRef, useState } from 'react';
import { StyleSheet, View, type DimensionValue, type GestureResponderEvent } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { colors, radii, shadows, spacing } from '@/shared/theme/tokens';

interface DraggablePinProps {
  left: DimensionValue;
  top: DimensionValue;
  hint: string;
  accuracyRadius?: number;
  /** 손을 뗀 위치의 이동량(px). */
  onDrop: (dx: number, dy: number) => void;
  disabled?: boolean;
}

/**
 * 지도 일러스트 위 위치 핀. 끌어서 위치를 보정한다.
 * 시간 정지·재개는 화면 전체 터치 처리에서 담당하므로 여기서는 이동만 다룬다.
 */
export function DraggablePin({
  left,
  top,
  hint,
  accuracyRadius = 49,
  onDrop,
  disabled,
}: DraggablePinProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const base = useRef({ x: 0, y: 0 });
  const grant = useRef({ pageX: 0, pageY: 0 });

  function delta(event: GestureResponderEvent) {
    return {
      x: base.current.x + event.nativeEvent.pageX - grant.current.pageX,
      y: base.current.y + event.nativeEvent.pageY - grant.current.pageY,
    };
  }

  const handlers = disabled
    ? {}
    : {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => false,
        onResponderGrant: (event: GestureResponderEvent) => {
          grant.current = { pageX: event.nativeEvent.pageX, pageY: event.nativeEvent.pageY };
        },
        onResponderMove: (event: GestureResponderEvent) => setOffset(delta(event)),
        onResponderRelease: (event: GestureResponderEvent) => {
          const next = delta(event);
          const moved = Math.abs(next.x - base.current.x) + Math.abs(next.y - base.current.y) > 4;
          base.current = next;
          setOffset(next);
          if (moved) onDrop(next.x, next.y);
        },
        onResponderTerminate: () => setOffset(base.current),
      };

  return (
    <View
      style={[
        styles.anchor,
        { left, top, transform: [{ translateX: offset.x }, { translateY: offset.y }] },
      ]}
      pointerEvents="box-none"
    >
      <View
        pointerEvents="none"
        style={[
          styles.accuracy,
          {
            width: accuracyRadius * 2,
            height: accuracyRadius * 2,
            borderRadius: accuracyRadius,
            left: -accuracyRadius,
            top: -accuracyRadius,
          },
        ]}
      />
      <View pointerEvents="none" style={styles.tooltip}>
        <AppText variant="caption" weight="bold" tone="inverse" style={styles.center}>
          {hint}
        </AppText>
      </View>
      <View
        {...handlers}
        style={styles.touch}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="주차 위치 핀"
        accessibilityHint="끌어서 실제 주차한 위치로 옮겨요"
      >
        <View style={styles.pin}>
          <View style={styles.pinIcon}>
            <Icon name="car" size={20} color={colors.inverse} />
          </View>
        </View>
      </View>
      <View pointerEvents="none" style={styles.shadow} />
    </View>
  );
}

const PIN = 44;

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 0, height: 0 },
  accuracy: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(31,99,224,0.45)',
    backgroundColor: 'rgba(31,99,224,0.14)',
  },
  tooltip: {
    position: 'absolute',
    width: 264,
    left: -132,
    top: -122,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: colors.ink,
  },
  center: { textAlign: 'center' },
  touch: {
    position: 'absolute',
    left: -32,
    top: -84,
    width: 64,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  pin: {
    width: PIN,
    height: PIN,
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
    top: -4,
    width: 12,
    height: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
