import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing, touchTarget } from '@/shared/theme/tokens';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const heightLabels = ['접힘', '중간', '펼침'] as const;

export interface MapBottomSheetHandle {
  /** 접혀 있을 때 내용을 확인할 수 있도록 중간 높이로 펼친다. */
  reveal: () => void;
}

interface MapBottomSheetProps {
  map: ReactNode;
  topBar?: ReactNode;
  mapTools?: ReactNode;
  accessibilityLabel: string;
  collapsedHeight?: number;
  onCollapse?: () => void;
  children: ReactNode;
}

/** 손잡이만 드래그를 처리하고, 시트 내용은 각 화면에서 독립적으로 스크롤한다. */
export const MapBottomSheet = forwardRef<MapBottomSheetHandle, MapBottomSheetProps>(
  function MapBottomSheet(
    { map, topBar, mapTools, accessibilityLabel, collapsedHeight = 116, onCollapse, children },
    ref,
  ) {
    const insets = useSafeAreaInsets();
    const [frameHeight, setFrameHeight] = useState(0);
    const [topHeight, setTopHeight] = useState(0);
    const [toolsHeight, setToolsHeight] = useState(0);
    const hasTopBar = Boolean(topBar);
    const [snapIndex, setSnapIndex] = useState(1);
    const [height] = useState(() => new Animated.Value(0));
    const currentHeight = useRef(0);
    const dragStart = useRef(0);
    const gesture = useRef({ x: 0, y: 0, lastY: 0, lastTime: 0, velocity: 0 });
    const selectedIndex = useRef(1);
    const snapPoints = useMemo(() => {
      // 상단 정보와 지도 조작 버튼을 덮지 않도록 펼침 높이를 제한한다.
      const headroom = hasTopBar
        ? Math.max(topHeight * 2 + touchTarget, topHeight + toolsHeight + spacing.md * 2)
        : insets.top + toolsHeight + spacing.md * 2;
      const maximum = Math.max(collapsedHeight, frameHeight - headroom);
      const minimum = Math.min(collapsedHeight, maximum);
      return [minimum, clamp(frameHeight * 0.46, minimum, maximum), maximum];
    }, [collapsedHeight, frameHeight, hasTopBar, insets.top, toolsHeight, topHeight]);

    useEffect(() => {
      const listener = height.addListener(({ value }) => {
        currentHeight.current = value;
      });
      return () => {
        height.removeListener(listener);
        height.stopAnimation();
      };
    }, [height]);

    useEffect(() => {
      height.stopAnimation();
      height.setValue(snapPoints[selectedIndex.current] ?? snapPoints[0] ?? collapsedHeight);
    }, [collapsedHeight, height, snapPoints]);

    const snapTo = useCallback(
      (index: number) => {
        const next = clamp(index, 0, snapPoints.length - 1);
        selectedIndex.current = next;
        setSnapIndex(next);
        if (next === 0) onCollapse?.();
        Animated.spring(height, {
          toValue: snapPoints[next] ?? collapsedHeight,
          useNativeDriver: false,
          stiffness: 260,
          damping: 30,
          mass: 1,
          overshootClamping: true,
        }).start();
      },
      [collapsedHeight, height, onCollapse, snapPoints],
    );

    useImperativeHandle(
      ref,
      () => ({
        reveal: () => {
          if (selectedIndex.current === 0) snapTo(1);
        },
      }),
      [snapTo],
    );

    const settle = useCallback(
      (velocity = 0) => {
        const projected = currentHeight.current - velocity * 160;
        const nearest = snapPoints.reduce(
          (best, point, index) =>
            Math.abs(point - projected) < Math.abs((snapPoints[best] ?? 0) - projected)
              ? index
              : best,
          0,
        );
        snapTo(nearest);
      },
      [snapPoints, snapTo],
    );

    const beginDrag = useCallback(() => {
      height.stopAnimation();
      dragStart.current = currentHeight.current;
    }, [height]);
    const moveSheet = useCallback(
      (event: GestureResponderEvent) => {
        const { pageY } = event.nativeEvent;
        const previous = gesture.current;
        const elapsed = event.timeStamp - previous.lastTime;
        gesture.current = {
          ...previous,
          lastY: pageY,
          lastTime: event.timeStamp,
          velocity: elapsed > 0 ? (pageY - previous.lastY) / elapsed : 0,
        };
        height.setValue(
          clamp(
            dragStart.current - (pageY - previous.y),
            snapPoints[0] ?? collapsedHeight,
            snapPoints[snapPoints.length - 1] ?? collapsedHeight,
          ),
        );
      },
      [collapsedHeight, height, snapPoints],
    );

    return (
      <View
        style={styles.root}
        onLayout={(event) => setFrameHeight(event.nativeEvent.layout.height)}
      >
        <Animated.View style={[styles.map, { bottom: Animated.subtract(height, radii.sheet) }]}>
          {map}
        </Animated.View>
        {hasTopBar ? (
          <View
            style={styles.topBar}
            pointerEvents="box-none"
            onLayout={(event) => setTopHeight(event.nativeEvent.layout.height)}
          >
            {topBar}
          </View>
        ) : null}
        {mapTools ? (
          <Animated.View
            pointerEvents="box-none"
            onLayout={(event) => setToolsHeight(event.nativeEvent.layout.height)}
            style={[
              styles.mapTools,
              {
                bottom: Animated.add(height, spacing.md),
                left: spacing.lg + insets.left,
                right: spacing.lg + insets.right,
              },
            ]}
          >
            {mapTools}
          </Animated.View>
        ) : null}
        <Animated.View style={[styles.sheet, { height }]}>
          <View
            style={styles.handleArea}
            onStartShouldSetResponderCapture={(event) => {
              const { pageX, pageY } = event.nativeEvent;
              gesture.current = {
                x: pageX,
                y: pageY,
                lastY: pageY,
                lastTime: event.timeStamp,
                velocity: 0,
              };
              return false;
            }}
            onMoveShouldSetResponder={(event) => {
              const dx = event.nativeEvent.pageX - gesture.current.x;
              const dy = event.nativeEvent.pageY - gesture.current.y;
              return Math.abs(dy) > 5 && Math.abs(dy) > Math.abs(dx);
            }}
            onResponderGrant={beginDrag}
            onResponderMove={moveSheet}
            onResponderRelease={() => settle(gesture.current.velocity)}
            onResponderTerminate={() => settle()}
            onResponderTerminationRequest={() => false}
          >
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel={accessibilityLabel}
              accessibilityHint="위아래로 드래그하거나 눌러 높이를 바꿀 수 있어요"
              accessibilityValue={{ min: 0, max: 2, now: snapIndex, text: heightLabels[snapIndex] }}
              aria-valuemin={0}
              aria-valuemax={2}
              aria-valuenow={snapIndex}
              aria-valuetext={heightLabels[snapIndex]}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'increment') snapTo(snapIndex + 1);
                if (event.nativeEvent.actionName === 'decrement') snapTo(snapIndex - 1);
              }}
              onPress={() => snapTo((snapIndex + 1) % snapPoints.length)}
              style={styles.handleButton}
            >
              <View style={styles.handle} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapBase },
  map: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  mapTools: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    boxShadow: shadows.sheet,
    overflow: 'hidden',
  },
  handleArea: {
    height: touchTarget,
    ...Platform.select({ web: { touchAction: 'none' as const }, default: {} }),
  },
  handleButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
});
