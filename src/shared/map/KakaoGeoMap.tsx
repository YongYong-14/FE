import {
  initializeKakaoMapSDK,
  KakaoMapView,
  type KakaoMapViewRef,
  type MapOptions,
  type ShapeScene,
} from '@react-native-kakao/map';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { colors, spacing } from '@/shared/theme/tokens';
import type { Coordinate } from '@/shared/types/location';
import { TILE_SIZE, type MapView, type ViewSize } from '@/shared/utils/mercator';

import { OUTSIDE_BOUNDS, YONGIN_BOUNDARY } from './yonginBoundary';

// Android 카카오 지도. 끌기·확대는 카카오 SDK가 처리하고, 멈추면 화면 범위를 재서
// 웹 메르카토르 view(center·zoom)로 알린다. 표시 요소(children)는 그 view 기준 px로 위에 겹치며,
// 지도가 움직이는 동안에는 위치가 어긋나지 않도록 숨긴다.

let initializing: Promise<void> | null = null;
function initialize(appKey: string) {
  initializing ??= initializeKakaoMapSDK(appKey).catch((error: unknown) => {
    initializing = null;
    throw error;
  });
  return initializing;
}

/** 북쪽 위 평면 지도로 고정한다(표시 요소의 px 계산이 회전·기울기를 모른다). */
const BASE_OPTIONS: MapOptions = {
  gestures: { rotate: false, tilt: false, rotateZoom: false },
  compass: { visible: false },
  poi: { visible: true, clickable: false },
};

/** 서비스 지역 밖을 회색으로 덮는다. 큰 사각형에서 용인시만 구멍으로 비운다. */
const OUTSIDE_SCENE: ShapeScene = {
  styleSets: [
    {
      type: 'polygon',
      id: 'outside-service-area',
      styles: [{ levels: [{ level: 0, fillColor: colors.mapOutside }] }],
    },
  ],
  // zIndex를 낮게 주면 지도 타일 아래에 깔려 보이지 않는다. SDK 기본 순서(10000)를 쓴다.
  layers: [{ id: 'service-area' }],
  shapes: [
    {
      id: 'outside-yongin',
      layerId: 'service-area',
      styleSetId: 'outside-service-area',
      geometry: {
        type: 'geographicPolygon',
        parts: [{ outer: OUTSIDE_BOUNDS, holes: [YONGIN_BOUNDARY] }],
      },
    },
  ],
};

const near = (a: Coordinate, b: Coordinate) =>
  Math.abs(a.latitude - b.latitude) < 1e-6 && Math.abs(a.longitude - b.longitude) < 1e-6;

interface KakaoCamera extends Coordinate {
  zoomLevel: number;
}

interface KakaoGeoMapProps {
  appKey: string;
  view: MapView;
  size: ViewSize;
  minZoom: number;
  maxZoom: number;
  onViewChange: (view: MapView) => void;
  onSizeChange: (size: ViewSize) => void;
  onMoveStart?: () => void;
  onIdle?: (view: MapView) => void;
  children?: ReactNode;
  style?: ViewStyle;
}

export function KakaoGeoMap({
  appKey,
  view,
  size,
  minZoom,
  maxZoom,
  onViewChange,
  onSizeChange,
  onMoveStart,
  onIdle,
  children,
  style,
}: KakaoGeoMapProps) {
  const [sdk, setSdk] = useState<'loading' | 'ready' | 'error'>('loading');
  const [moving, setMoving] = useState(true);
  /** 카카오 줌 단계로 바꾼 확대 범위. 첫 측정 전에는 SDK 기본값을 쓴다. */
  const [zoomRange, setZoomRange] = useState<MapOptions['zoomRange']>();
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<KakaoMapViewRef>(null);
  /** 카카오 zoomLevel − 메르카토르 zoom. 멈출 때마다 다시 잰다. */
  const zoomOffset = useRef(0);
  /** SDK가 실제로 지원하는 범위. 화면별 확대 제한을 적용하기 전에 한 번 읽는다. */
  const nativeZoomLimits = useRef<NonNullable<MapOptions['zoomRange']> | null>(null);
  /** 마지막으로 잰 카카오 카메라. view가 여기서 온 값이면 카메라를 다시 옮기지 않는다. */
  const camera = useRef<KakaoCamera | null>(null);
  const latest = useRef({ size, minZoom, maxZoom, onViewChange, onMoveStart, onIdle });
  const userMoving = useRef(false);
  const [initialCamera] = useState(() => ({
    latitude: view.center.latitude,
    longitude: view.center.longitude,
    zoomLevel: Math.round(view.zoom),
  }));

  useEffect(() => {
    latest.current = { size, minZoom, maxZoom, onViewChange, onMoveStart, onIdle };
  }, [size, minZoom, maxZoom, onViewChange, onMoveStart, onIdle]);

  useEffect(() => {
    let active = true;
    initialize(appKey).then(
      () => active && setSdk('ready'),
      () => active && setSdk('error'),
    );
    return () => {
      active = false;
    };
  }, [appKey]);

  /** 화면 양 끝의 경도 차로 메르카토르 확대 단계를 구해 view로 알린다. */
  async function measure(settled = false) {
    const map = mapRef.current;
    const { size: current, minZoom: low, maxZoom: high } = latest.current;
    if (!map || current.width < 2 || current.height < 2 || userMoving.current) return;
    try {
      const y = current.height / 2;
      const [position, left, right, info] = await Promise.all([
        map.getCamera(),
        map.screenToCoordinate({ x: 0, y }),
        map.screenToCoordinate({ x: current.width - 1, y }),
        nativeZoomLimits.current ? Promise.resolve(null) : map.getMapInfo(),
      ]);
      const limits = nativeZoomLimits.current ?? info?.zoomRange;
      if (!limits) return;
      nativeZoomLimits.current = limits;
      const span = right.longitude - left.longitude;
      if (!(span > 0)) return;
      const zoom = Math.log2(((current.width - 1) * 360) / (span * TILE_SIZE));
      const offset = position.zoomLevel - zoom;
      zoomOffset.current = offset;
      camera.current = position;
      setZoomRange((previous) => {
        // 화면 px·밀도에 따른 보정으로 범위를 넘으면 SDK가 INVALID_ARGUMENT를 낸다.
        const withinSdk = (level: number) =>
          Math.max(limits.min, Math.min(limits.max, Math.round(level)));
        const next = { min: withinSdk(low + offset), max: withinSdk(high + offset) };
        return previous?.min === next.min && previous.max === next.max ? previous : next;
      });
      const next = {
        center: { latitude: position.latitude, longitude: position.longitude },
        zoom,
      };
      latest.current.onViewChange(next);
      if (settled && !userMoving.current) latest.current.onIdle?.(next);
    } catch {
      // 지도 준비 전·크기 변경 중의 측정 실패는 다음 멈춤에서 다시 잰다.
    } finally {
      setMoving(false);
    }
  }

  // 확대 버튼·검색·현재 위치처럼 화면이 정한 view로 카메라를 옮긴다.
  const { latitude, longitude } = view.center;
  const zoom = view.zoom;
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const target = { latitude, longitude };
    const level = zoom + zoomOffset.current;
    const last = camera.current;
    if (last && near(last, target) && Math.abs(last.zoomLevel - level) < 0.5) return;
    const zoomLevel = Math.round(
      Math.min(Math.max(level, zoomRange?.min ?? -Infinity), zoomRange?.max ?? Infinity),
    );
    camera.current = { ...target, zoomLevel };
    setMoving(true);
    // 이미 같은 자리면 멈춤 이벤트가 오지 않을 수 있어 이동이 끝날 즈음 한 번 더 잰다.
    const timer = setTimeout(() => void measure(true), 400);
    map.moveCamera({ ...target, zoomLevel }, { duration: 250 }).catch(() => setMoving(false));
    return () => clearTimeout(timer);
  }, [mapReady, latitude, longitude, zoom, zoomRange]);

  return (
    <View
      style={[styles.container, style]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) onSizeChange({ width, height });
      }}
    >
      {sdk === 'ready' ? (
        <KakaoMapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialCamera={initialCamera}
          options={{ ...BASE_OPTIONS, zoomRange }}
          shapes={OUTSIDE_SCENE}
          onMapReady={() => setMapReady(true)}
          onError={() => setSdk('error')}
          onCameraMoveStart={(event) => {
            userMoving.current = event.reason === 'gesture';
            setMoving(true);
            latest.current.onMoveStart?.();
          }}
          onCameraIdle={() => {
            userMoving.current = false;
            void measure(true);
          }}
          onViewportChanged={() => void measure()}
          accessibilityLabel="카카오 지도. 끌어서 이동하고 두 손가락이나 확대 버튼으로 크기를 바꿀 수 있어요"
        />
      ) : (
        <View style={styles.state}>
          {sdk === 'loading' ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <AppText variant="caption" tone="secondary">
              카카오 지도를 불러오지 못했어요. 카카오맵 사용 설정과 키 해시를 확인해 주세요.
            </AppText>
          )}
        </View>
      )}
      {!moving ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: colors.mapLand },
  state: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
});
