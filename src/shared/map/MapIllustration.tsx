import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { colors, shadows } from '@/shared/theme/tokens';

// Figma 지도 스타일을 재현한 정적 일러스트(232:2185 기준).
// 실제 지도 SDK가 아니며, 비율 좌표로 배치해 화면 크기에 맞춰 늘어난다.

type Rect = {
  left: DimensionValue;
  top: DimensionValue;
  width: DimensionValue;
  height: DimensionValue;
};

const blocks: Rect[] = [
  { left: '4%', top: '3%', width: '38%', height: '22%' },
  { left: '60%', top: '3%', width: '36%', height: '22%' },
  { left: '4%', top: '42%', width: '38%', height: '25%' },
  { left: '60%', top: '42%', width: '36%', height: '20%' },
  { left: '4%', top: '78%', width: '38%', height: '27%' },
];

const buildings: Rect[] = [
  { left: '11%', top: '9%', width: '15%', height: '8%' },
  { left: '67%', top: '50%', width: '13%', height: '7%' },
  { left: '15%', top: '50%', width: '12%', height: '9%' },
];

function Box({ rect, style }: { rect: Rect; style: ViewStyle }) {
  return <View style={[styles.abs, rect, style]} />;
}

export function MapIllustration({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return (
    <View style={[styles.map, style]} accessibilityLabel="예시 지도" accessibilityRole="image">
      {blocks.map((rect, index) => (
        <Box key={`b${index}`} rect={rect} style={styles.block} />
      ))}
      <Box rect={{ left: '60%', top: '67%', width: '36%', height: '30%' }} style={styles.park} />
      {buildings.map((rect, index) => (
        <Box key={`g${index}`} rect={rect} style={styles.building} />
      ))}
      <Box rect={{ left: '45%', top: 0, width: '12%', height: '100%' }} style={styles.road} />
      <Box rect={{ left: 0, top: '29%', width: '100%', height: '9%' }} style={styles.mainRoad} />
      <Box rect={{ left: 0, top: '70%', width: '100%', height: '3.6%' }} style={styles.road} />
      <AppText variant="micro" style={[styles.label, { left: '76%', top: '31.5%' }]}>
        수지로
      </AppText>
      <AppText
        variant="micro"
        style={[styles.label, styles.parkLabel, { left: '64%', top: '80%' }]}
      >
        풍덕천 근린공원
      </AppText>
      {children}
    </View>
  );
}

/** 지도 위 위험 구역 원. 중심 좌표(비율)와 지름(px)으로 지정한다. */
export function RiskZone({
  left,
  top,
  size,
  tone,
}: {
  left: DimensionValue;
  top: DimensionValue;
  size: number;
  tone: 'danger' | 'warning' | 'primary';
}) {
  const color = { danger: colors.danger, warning: colors.warning, primary: colors.primary }[tone];
  return (
    <View
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left,
          top,
          width: size,
          height: size,
          borderRadius: size / 2,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderWidth: 2,
          borderColor: `${color}99`,
          backgroundColor: `${color}29`,
        },
      ]}
    />
  );
}

/** 주차 위치 마커(검은 원 + 차량 아이콘). */
export function ParkingMarker({ left, top }: { left: DimensionValue; top: DimensionValue }) {
  return (
    <View pointerEvents="none" style={[styles.abs, styles.marker, { left, top }]}>
      <Icon name="car" size={16} color={colors.inverse} />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { backgroundColor: colors.mapLand, overflow: 'hidden' },
  abs: { position: 'absolute' },
  block: { backgroundColor: colors.mapBase, borderRadius: 3 },
  park: { backgroundColor: colors.park, borderRadius: 3 },
  building: { backgroundColor: colors.mapBuilding, borderRadius: 2 },
  road: { backgroundColor: colors.surface },
  mainRoad: { backgroundColor: colors.road },
  label: { position: 'absolute', color: colors.mapLabel, fontSize: 11 },
  parkLabel: { color: colors.sage },
  marker: {
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadows.pin,
  },
});
