import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { colors, radii, shadows } from '@/shared/theme/tokens';
import type { MapPoint, RiskArea } from '@/shared/types/map';

// 지도 일러스트 위에 올리는 표시 요소. 좌표는 공통 비율 좌표를 쓴다.

const levelColor = { 1: colors.danger, 2: colors.warning } as const;

export function RiskAreaShape({ area }: { area: RiskArea }) {
  const color = levelColor[area.level];
  const common = { borderColor: color, borderWidth: 1.6, backgroundColor: `${color}38` };
  if (area.shape.kind === 'rect') {
    return (
      <View
        pointerEvents="none"
        style={[styles.abs, area.shape.rect, common, { borderRadius: 4 }]}
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
          borderRadius: size / 2,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
      ]}
    />
  );
}

/** 신고 건수 말풍선. 예시 수치다. */
export function CountBubble({ point, count }: { point: MapPoint; count: number }) {
  return (
    <View pointerEvents="none" style={[styles.abs, styles.bubbleAnchor, point]}>
      <View style={styles.bubble}>
        <AppText variant="micro" weight="bold">
          {count}건
        </AppText>
      </View>
    </View>
  );
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

/** 주차장 핀. 선택된 핀은 크게 표시하고 도보 시간을 붙인다. */
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
        <AppText weight="black" style={{ fontSize: selected ? 18 : 15, lineHeight: 22 }}>
          P
        </AppText>
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
    bottom: 0,
    minWidth: 40,
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.14)',
  },
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
    boxShadow: '0px 2px 6px rgba(0,0,0,0.12)',
  },
  lot: {
    position: 'absolute',
    top: -16,
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0b000',
    backgroundColor: '#fff6d1',
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
    boxShadow: '0px 3px 4px rgba(0,0,0,0.22)',
  },
});
