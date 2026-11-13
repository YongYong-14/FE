import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { colors, spacing } from '@/shared/theme/tokens';
import type { Coordinate } from '@/shared/types/location';
import { createProjector, type Projector, type ViewSize } from '@/shared/utils/mercator';
import { GeoMap, MAP_ATTRIBUTION } from './GeoMap';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, YONGIN_MAP_CENTER } from './constants';
import { LocationDot } from './MapMarkers';

/** 실제 지도를 공통으로 사용한다. 위치가 없으면 시작 중심만 표시하고 핀은 만들지 않는다. */
export function CoordinateMap({
  coordinate,
  zoom = 17,
  recenterKey = 0,
  marker = 'car',
  style,
  children,
}: {
  coordinate: Coordinate | null;
  zoom?: number;
  /** 같은 GPS 좌표에서도 현 위치 버튼으로 이동한 지도를 다시 중앙에 맞춘다. */
  recenterKey?: number;
  marker?: 'car' | 'location' | 'none';
  style?: ViewStyle;
  children?: (projector: Projector) => ReactNode;
}) {
  const sourceKey = `${coordinate?.latitude},${coordinate?.longitude}:${zoom}:${recenterKey}`;
  const [navigation, setNavigation] = useState({
    sourceKey,
    view: { center: coordinate ?? YONGIN_MAP_CENTER, zoom },
  });
  const view =
    navigation.sourceKey === sourceKey
      ? navigation.view
      : { center: coordinate ?? YONGIN_MAP_CENTER, zoom };
  if (navigation.sourceKey !== sourceKey) setNavigation({ sourceKey, view });
  const [size, setSize] = useState<ViewSize>({ width: 0, height: 0 });
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
