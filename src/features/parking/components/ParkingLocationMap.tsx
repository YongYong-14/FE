import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { resolvePlace } from '@/services/device/location';
import { AppText } from '@/shared/components/AppText';
import { GeoMap, MAP_ATTRIBUTION } from '@/shared/map/GeoMap';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, YONGIN_MAP_CENTER } from '@/shared/map/constants';
import { colors, spacing } from '@/shared/theme/tokens';
import type { SelectedPlace } from '@/shared/types/location';
import type { GpsFix } from '@/shared/types/parking';
import { distanceMeters } from '@/shared/utils/geo';
import { createProjector, type MapView, type ViewSize } from '@/shared/utils/mercator';
import { CenterLocationPin } from './CenterLocationPin';

const DEFAULT_ZOOM = 17;
const LOOKUP_DELAY_MS = 250;
// SDK 카메라의 소수점 차이로 최초 GPS 위치가 사용자 보정으로 바뀌지 않게 한다.
const SAME_POSITION_METERS = 0.75;

type Lookup = {
  source: SelectedPlace | null;
  phase: 'ready' | 'moving' | 'resolving' | 'error';
  error?: string;
};

/** 중앙 핀 아래의 지도 좌표를 선택한다. 지도 이동과 주소 확인 중에는 확정을 보류한다. */
export function ParkingLocationMap({
  place,
  editable,
  gps,
  onSelect,
  onLookupPending,
}: {
  place: SelectedPlace | null;
  editable: boolean;
  gps?: GpsFix;
  onSelect: (place: SelectedPlace) => void;
  onLookupPending: (pending: boolean) => void;
}) {
  const [navigation, setNavigation] = useState({
    source: place,
    view: { center: place?.coordinate ?? YONGIN_MAP_CENTER, zoom: DEFAULT_ZOOM },
  });
  // GPS 재측정·주소 검색은 중앙에 맞추고 지도에서 고른 위치는 확대 단계를 유지한다.
  const view =
    navigation.source === place ||
    (place && distanceMeters(place.coordinate, navigation.view.center) < SAME_POSITION_METERS)
      ? navigation.view
      : { center: place?.coordinate ?? YONGIN_MAP_CENTER, zoom: DEFAULT_ZOOM };
  if (navigation.source !== place) setNavigation({ source: place, view });

  const [size, setSize] = useState<ViewSize>({ width: 0, height: 0 });
  const [lookup, setLookup] = useState<Lookup>({ source: place, phase: 'ready' });
  const latest = useRef({ place, editable });
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const invalidate = useCallback(() => {
    request.current++;
    clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    latest.current = { place, editable };
    return () => {
      invalidate();
      onLookupPending(false);
    };
  }, [place, editable, onLookupPending, invalidate]);

  const moveStart = useCallback(() => {
    if (!editable || !place) return;
    request.current++;
    clearTimeout(timer.current);
    onLookupPending(true);
    setLookup({ source: place, phase: 'moving' });
  }, [editable, place, onLookupPending]);

  const selectCenter = useCallback(
    (next: MapView) => {
      if (!editable || !place) return;
      const id = ++request.current;
      clearTimeout(timer.current);
      if (distanceMeters(place.coordinate, next.center) < SAME_POSITION_METERS) {
        setLookup({ source: place, phase: 'ready' });
        onLookupPending(false);
        return;
      }
      onLookupPending(true);
      setLookup({ source: place, phase: 'resolving' });
      timer.current = setTimeout(() => {
        const isCurrent = () =>
          request.current === id && latest.current.editable && latest.current.place === place;
        void resolvePlace(next.center)
          .then((selected) => {
            if (!isCurrent()) return;
            onSelect(selected);
            setLookup({ source: selected, phase: 'ready' });
            onLookupPending(false);
          })
          .catch((cause: unknown) => {
            if (!isCurrent()) return;
            setLookup({
              source: place,
              phase: 'error',
              error: cause instanceof Error ? cause.message : '주소를 확인하지 못했어요.',
            });
            // 중앙 좌표와 이전 주소가 다른 상태에서는 수동·자동 확정을 계속 막는다.
          });
      }, LOOKUP_DELAY_MS);
    },
    [editable, place, onLookupPending, onSelect],
  );

  const state = lookup.source === place ? lookup.phase : 'ready';
  const hint = !editable
    ? '확인한 주차 위치예요'
    : state === 'moving'
      ? '중앙 핀에 주차한 위치를 맞춰 주세요'
      : state === 'resolving'
        ? '선택한 위치의 주소를 확인하고 있어요'
        : state === 'error'
          ? `${lookup.error} 지도를 움직여 다시 시도해 주세요.`
          : '지도를 움직여 주차 위치를 맞춰 주세요';
  const projector = createProjector(view, size);
  const gpsPoint = gps ? projector.toScreen(gps.coordinate) : null;
  const radius = gps ? projector.metersToPixels(gps.accuracyMeters) : 0;

  return (
    <View style={styles.root}>
      <View pointerEvents={editable ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
        <GeoMap
          view={view}
          size={size}
          minZoom={MAP_MIN_ZOOM}
          maxZoom={MAP_MAX_ZOOM}
          onViewChange={(next) => setNavigation({ source: place, view: next })}
          onSizeChange={setSize}
          onMoveStart={moveStart}
          onIdle={selectCenter}
        >
          {gpsPoint && radius > 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.accuracy,
                {
                  left: gpsPoint.x - radius,
                  top: gpsPoint.y - radius,
                  width: radius * 2,
                  height: radius * 2,
                  borderRadius: radius,
                },
              ]}
            />
          ) : null}
        </GeoMap>
      </View>
      {place ? <CenterLocationPin hint={hint} /> : null}
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
  root: { flex: 1, overflow: 'hidden' },
  accuracy: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(31,99,224,0.45)',
    backgroundColor: 'rgba(31,99,224,0.14)',
  },
  attribution: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
  },
});
