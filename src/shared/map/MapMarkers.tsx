import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { colors, radii, shadows } from '@/shared/theme/tokens';
import type { MapPoint, RiskArea } from '@/shared/types/map';

// 실제 지도에 올리는 표시 요소. 현재 지도의 투영 좌표를 사용한다.

const levelColor = { 1: colors.mapLevelOne, 2: colors.warning } as const;

export function RiskAreaShape({ area }: { area: RiskArea }) {
  const color = levelColor[area.level];
  const common = { borderColor: color, borderWidth: 1.6, backgroundColor: `${color}38` };
  if (area.shape.kind === 'rect') {
    const { width, height } = area.shape.rect;
    const side = Math.min(
      typeof width === 'number' ? width : 8,
      typeof height === 'number' ? height : 8,
    );
    return (
      <View
        pointerEvents="none"
        style={[
          styles.abs,
          area.shape.rect,
          common,
          // 작은 구역은 채움만 그려 테두리 최소 픽셀 때문에 범위가 커지지 않게 한다.
          { borderRadius: Math.min(4, side / 4), borderWidth: side >= 4 ? 1.6 : 0 },
        ]}
      />
    );
  }
  const { center, size } = area.shape;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.abs,
        common,
        {
          left: center.left,
          top: center.top,
          width: size,
          height: size,
          borderWidth: size >= 4 ? 1.6 : 0,
          borderRadius: size / 2,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
      ]}
    />
  );
}

/** 서버가 제공한 신고 건수 말풍선. */
export function CountBubble({
  point,
  count,
  placement = 'above',
}: {
  point: MapPoint;
  count: number;
  /** above: 기준점 위에 말풍선 아래 끝을 맞춘다. below: 기준점 아래에 위 끝을 맞춘다. */
  placement?: 'above' | 'below';
}) {
  return (
    <View pointerEvents="none" style={[styles.abs, styles.bubbleAnchor, point]}>
      <View
        style={[styles.bubble, placement === 'below' ? styles.bubbleBelow : styles.bubbleAbove]}
      >
        {/* 기준점 폭이 0이라 웹에서 숫자와 "건" 사이가 줄바꿈되지 않게 한 줄로 고정한다. */}
        <AppText variant="micro" weight="bold" numberOfLines={1} style={styles.bubbleText}>
          {count.toLocaleString('ko-KR')}건
        </AppText>
      </View>
    </View>
  );
}

/** 말풍선 예상 크기(px). 겹치는 말풍선을 거를 때 쓴다. */
export function countBubbleSize(count: number): { width: number; height: number } {
  const label = `${count.toLocaleString('ko-KR')}건`;
  return { width: Math.max(40, 18 + label.length * 8), height: 22 };
}

/** 현재 위치 파란 점. */
export function LocationDot({ point }: { point: MapPoint }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.abs, styles.dot, point]}
      accessibilityLabel="현재 위치"
    />
  );
}

/** 검색으로 고른 장소 핀과 이름표. */
export function PlacePin({ point, label }: { point: MapPoint; label: string }) {
  return (
    <View pointerEvents="none" style={[styles.abs, styles.pinAnchor, point]}>
      <View style={styles.placePin}>
        <Icon name="location" size={18} color={colors.inverse} />
      </View>
      <View style={styles.pinLabel}>
        <AppText variant="micro" weight="bold" numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

/** 주차장 핀. 선택된 핀은 크게 표시하고 전달받은 거리 문구를 붙인다. */
export function LotPin({
  point,
  selected,
  caption,
  label,
  onPress,
}: {
  point: MapPoint;
  selected: boolean;
  caption?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <View style={[styles.abs, styles.pinAnchor, point]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        hitSlop={8}
        style={[styles.lot, selected && styles.lotSelected]}
      >
        <Icon name="parking" size={selected ? 22 : 18} color={colors.ink} filled />
      </Pressable>
      {selected && caption ? (
        <View style={styles.pinLabel}>
          <AppText variant="micro" weight="bold">
            {caption}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  bubbleAnchor: { width: 0, height: 0, alignItems: 'center', overflow: 'visible' },
  bubble: {
    position: 'absolute',
    minWidth: 40,
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
  bubbleAbove: { bottom: 0 },
  bubbleBelow: { top: 0 },
  bubbleText: { flexShrink: 0 },
  dot: {
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
    boxShadow: '0 0 0 6px rgba(31,99,224,0.18)',
  },
  pinAnchor: { width: 0, height: 0, alignItems: 'center', overflow: 'visible' },
  placePin: {
    position: 'absolute',
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.surface,
    boxShadow: shadows.pin,
  },
  pinLabel: {
    position: 'absolute',
    top: 24,
    maxWidth: 160,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.xs,
    backgroundColor: colors.surface,
    boxShadow: shadows.raised,
  },
  lot: {
    position: 'absolute',
    top: -16,
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.parkingLine,
    backgroundColor: colors.parkingSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotSelected: {
    top: -20,
    width: 40,
    height: 40,
    borderRadius: 12,
    borderColor: colors.surface,
    backgroundColor: colors.parking,
    boxShadow: shadows.pin,
  },
});
