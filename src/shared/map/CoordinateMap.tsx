import { useContext, useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { MapSheetInsetContext } from '@/shared/components/MapBottomSheet';
import { Icon } from '@/shared/components/Icon';
import { colors, spacing } from '@/shared/theme/tokens';
import type { Coordinate } from '@/shared/types/location';
import { createProjector, fitView, type Projector, type ViewSize } from '@/shared/utils/mercator';
import { GeoMap, MAP_ATTRIBUTION } from './GeoMap';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, YONGIN_MAP_CENTER } from './constants';
import { LocationDot } from './MapMarkers';

/** 핀이 가장자리에서 잘리지 않게 두는 여백. 위쪽은 상태 표시줄과 핀 높이만큼 더 둔다. */
const FIT_PADDING = { top: 72, right: 36, bottom: 44, left: 36 };

/** 실제 지도를 공통으로 사용한다. 위치가 없으면 시작 중심만 표시하고 핀은 만들지 않는다. */
export function CoordinateMap({
  coordinate,
  zoom = 17,
  recenterKey = 0,
  marker = 'car',
  fit,
  style,
  children,
}: {
  coordinate: Coordinate | null;
  zoom?: number;
  /** 같은 GPS 좌표에서도 현 위치 버튼으로 이동한 지도를 다시 중앙에 맞춘다. */
  recenterKey?: number;
  marker?: 'car' | 'location' | 'none';
  /** 화면 안에 모두 보여야 하는 좌표. 기준 좌표는 가운데에 두고 확대 단계만 여기에 맞춘다. */
  fit?: Coordinate[];
  style?: ViewStyle;
  children?: (projector: Projector) => ReactNode;
}) {
  const [size, setSize] = useState<ViewSize>({ width: 0, height: 0 });
  // 지도는 시트가 올라온 높이의 절반만큼 위로 밀려 있어 가운데는 항상 보이는 영역의 가운데다.
  // 기본 높이의 시트가 가리는 만큼만 위아래 여백으로 빼고 핀이 들어오는 확대 단계를 고른다.
  const inset = Math.round(useContext(MapSheetInsetContext).middle);
  // 시트를 끄는 동안에는 다시 맞추지 않고, 지도 크기가 잠시 멈춘 뒤에만 맞춘다.
  const [fitSize, setFitSize] = useState<ViewSize | null>(null);
  const fitting = Boolean(fit && fit.length > 0);
  useEffect(() => {
    if (!fitting || size.width <= 0 || size.height <= 0) return;
    const timer = setTimeout(() => setFitSize(size), 200);
    return () => clearTimeout(timer);
  }, [fitting, size]);
  const fitKey = fitting && fit ? fit.map((c) => `${c.latitude},${c.longitude}`).join('|') : '';
  const sourceKey = `${coordinate?.latitude},${coordinate?.longitude}:${zoom}:${recenterKey}:${inset}:${fitKey}:${fitKey && fitSize ? `${Math.round(fitSize.width)}x${Math.round(fitSize.height)}` : ''}`;
  const target = () =>
    coordinate && fit && fitting && fitSize
      ? fitView([coordinate, ...fit], fitSize, {
          minZoom: MAP_MIN_ZOOM,
          maxZoom: zoom,
          padding: {
            ...FIT_PADDING,
            top: FIT_PADDING.top + inset / 2,
            bottom: FIT_PADDING.bottom + inset / 2,
          },
        })
      : {
          center: coordinate ?? YONGIN_MAP_CENTER,
          zoom,
        };
  const [navigation, setNavigation] = useState(() => ({ sourceKey, view: target() }));
  const view = navigation.sourceKey === sourceKey ? navigation.view : target();
  if (navigation.sourceKey !== sourceKey) setNavigation({ sourceKey, view });
  const projector = createProjector(view, size);
  const point = coordinate ? projector.toScreen(coordinate) : null;
  return (
    <View style={[styles.container, style]}>
      <GeoMap
        view={view}
        size={size}
        minZoom={MAP_MIN_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        onViewChange={(next) => setNavigation({ sourceKey, view: next })}
        onSizeChange={setSize}
      >
        {point && marker === 'car' ? (
          <View
            pointerEvents="none"
            style={[styles.car, { left: point.x - 18, top: point.y - 18 }]}
          >
            <Icon name="car" size={18} color={colors.inverse} />
          </View>
        ) : point && marker === 'location' ? (
          <LocationDot point={{ left: point.x, top: point.y }} />
        ) : null}
        {size.width > 0 && size.height > 0 ? children?.(projector) : null}
      </GeoMap>
      {MAP_ATTRIBUTION ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="지도 출처 OpenStreetMap"
          style={styles.attribution}
          onPress={() => {
            if (MAP_ATTRIBUTION) void Linking.openURL(MAP_ATTRIBUTION.url).catch(() => undefined);
          }}
        >
          <AppText variant="micro" tone="secondary">
            {MAP_ATTRIBUTION.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  car: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.ink,
  },
  attribution: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
  },
});
