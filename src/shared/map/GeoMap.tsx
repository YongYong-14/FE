import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';

import { requireOptionalNativeModule } from 'expo';

import { colors } from '@/shared/theme/tokens';
import {
  createProjector,
  visibleTiles,
  zoomAround,
  type MapView,
  type ViewSize,
} from '@/shared/utils/mercator';

// 끌어서 이동·두 손가락 확대(모바일)·휠 확대(웹)가 되는 지도.
// Android에서 카카오 네이티브 앱 키와 지도 모듈이 있으면 카카오 지도, 그 밖(웹·키 없는 빌드)은 타일 지도를 쓴다.
// 위에 올리는 표시 요소(children)는 같은 좌표 계산(createProjector)으로 px 위치를 정한다.

const KAKAO_APP_KEY = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY?.trim() || null;
/** 지도 모듈이 빠진 이전 개발 빌드에서는 타일 지도로 대신한다. */
const kakaoMapAvailable =
  Platform.OS === 'android' && !!KAKAO_APP_KEY && !!requireOptionalNativeModule('RNCKakaoMap');
// 웹 번들과 모듈 없는 빌드에서 카카오 지도 코드를 불러오지 않도록 필요할 때만 가져온다.
const KakaoGeoMap: typeof import('./KakaoGeoMap').KakaoGeoMap | null = kakaoMapAvailable
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./KakaoGeoMap').KakaoGeoMap
  : null;

/** 지도 출처 표기. 카카오 지도는 지도 위에 로고를 직접 그리므로 따로 표기하지 않는다. */
export const MAP_ATTRIBUTION: { label: string; url: string } | null = KakaoGeoMap
  ? null
  : { label: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' };

/** 타일 주소. {z}/{x}/{y}를 바꿔 쓴다. 기본은 OpenStreetMap(출처 표기 필요). */
const TILE_URL =
  process.env.EXPO_PUBLIC_MAP_TILE_URL?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/**
 * OpenStreetMap 타일 정책: 앱을 알 수 있는 User-Agent를 보낸다.
 * 웹은 브라우저 값을 쓴다(헤더를 주면 react-native-web이 fetch로 받아 CORS 사전 요청이 생긴다).
 */
const TILE_HEADERS =
  Platform.OS === 'web'
    ? undefined
    : { 'User-Agent': 'seulkkamalkka/0.1 (+https://github.com/YongYong-14/FE)' };
/** 웹에서 휠 한 칸(약 100px)에 0.25단계씩 확대·축소한다. */
const WHEEL_PIXELS_PER_ZOOM = 400;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const idleGesture = {
  startX: 0,
  startY: 0,
  dx: 0,
  dy: 0,
  scale: 1,
  startDistance: 0,
  pinching: false,
};

function touchDistance(event: GestureResponderEvent): number | null {
  const [first, second] = event.nativeEvent.touches;
  if (!first || !second) return null;
  return Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
}

interface GeoMapProps {
  view: MapView;
  size: ViewSize;
  minZoom: number;
  maxZoom: number;
  onViewChange: (view: MapView) => void;
  onSizeChange: (size: ViewSize) => void;
  /** 지도 조작 시작과 카메라가 멈춘 최종 좌표. 위치 선택 화면의 확정 대기에 사용한다. */
  onMoveStart?: () => void;
  onIdle?: (view: MapView) => void;
  /** 지도와 함께 움직이는 표시 요소. 좌표는 현재 view 기준 px다. */
  children?: ReactNode;
  style?: ViewStyle;
}

export function GeoMap(props: GeoMapProps) {
  return KakaoGeoMap && KAKAO_APP_KEY ? (
    <KakaoGeoMap appKey={KAKAO_APP_KEY} {...props} />
  ) : (
    <TileGeoMap {...props} />
  );
}

function TileGeoMap({
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
}: GeoMapProps) {
  const [pan] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [pinch] = useState(() => new Animated.Value(1));
  const containerRef = useRef<ComponentRef<typeof View>>(null);
  /** 이벤트 처리에서 최신 값을 읽기 위한 참조(렌더 중에는 읽지 않는다). */
  const latest = useRef({ view, size, minZoom, maxZoom, onViewChange, onMoveStart, onIdle });
  const gesture = useRef({ ...idleGesture });
  /** 손을 뗀 뒤 새 view가 그려지면 이동·확대 효과를 0으로 되돌린다. */
  const resetPending = useRef(false);

  useEffect(() => {
    latest.current = { view, size, minZoom, maxZoom, onViewChange, onMoveStart, onIdle };
  }, [view, size, minZoom, maxZoom, onViewChange, onMoveStart, onIdle]);

  useLayoutEffect(() => {
    if (!resetPending.current) return;
    resetPending.current = false;
    pan.setValue({ x: 0, y: 0 });
    pinch.setValue(1);
  }, [view.center.latitude, view.center.longitude, view.zoom, pan, pinch]);

  // ── 끌기·두 손가락 확대. 움직이는 동안은 화면만 옮기고, 손을 떼면 새 view로 확정한다.
  function resetMotion() {
    pan.setValue({ x: 0, y: 0 });
    pinch.setValue(1);
  }

  function rememberStart(event: GestureResponderEvent) {
    const { pageX, pageY } = event.nativeEvent;
    gesture.current = { ...idleGesture, startX: pageX, startY: pageY };
    return false;
  }

  /** 짧게 누르기는 지도 위 버튼·핀이 받도록, 움직이기 시작할 때만 지도가 가져간다. */
  function shouldTakeOver(event: GestureResponderEvent) {
    const { pageX, pageY, touches } = event.nativeEvent;
    const moved = Math.hypot(pageX - gesture.current.startX, pageY - gesture.current.startY);
    return touches.length >= 2 || moved > 4;
  }

  function moveMap(event: GestureResponderEvent) {
    const distance = touchDistance(event);
    if (distance !== null) {
      if (!gesture.current.pinching) {
        gesture.current = { ...gesture.current, pinching: true, startDistance: distance };
        pan.setValue({ x: 0, y: 0 });
        return;
      }
      const scale = clamp(distance / gesture.current.startDistance, 0.25, 4);
      gesture.current.scale = scale;
      pinch.setValue(scale);
      return;
    }
    if (gesture.current.pinching) return;
    const { pageX, pageY } = event.nativeEvent;
    gesture.current.dx = pageX - gesture.current.startX;
    gesture.current.dy = pageY - gesture.current.startY;
    pan.setValue({ x: gesture.current.dx, y: gesture.current.dy });
  }

  function commitMotion() {
    const { view: current, size: currentSize, minZoom: low, maxZoom: high } = latest.current;
    const { dx, dy, scale, pinching } = gesture.current;
    gesture.current = { ...idleGesture };
    let next: MapView | null = null;
    if (pinching) {
      const zoom = clamp(current.zoom + Math.log2(scale), low, high);
      if (zoom !== current.zoom) next = { center: current.center, zoom };
    } else if (dx !== 0 || dy !== 0) {
      const center = createProjector(current, currentSize).toCoordinate({
        x: currentSize.width / 2 - dx,
        y: currentSize.height / 2 - dy,
      });
      next = { center, zoom: current.zoom };
    }
    if (!next) {
      resetMotion();
      latest.current.onIdle?.(current);
      return;
    }
    resetPending.current = true;
    latest.current.onViewChange(next);
    latest.current.onIdle?.(next);
  }

  // 웹: 마우스 휠로 커서 위치를 중심으로 확대·축소한다.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    let pendingZoom = 0;
    let cursor = { x: 0, y: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      latest.current.onMoveStart?.();
      const rect = node.getBoundingClientRect();
      cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      pendingZoom -= event.deltaY / WHEEL_PIXELS_PER_ZOOM;
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        const { view: current, size: currentSize, minZoom: low, maxZoom: high } = latest.current;
        const zoom = clamp(current.zoom + pendingZoom, low, high);
        pendingZoom = 0;
        const next =
          zoom === current.zoom ? current : zoomAround(current, currentSize, cursor, zoom);
        latest.current.onViewChange(next);
        latest.current.onIdle?.(next);
      }, 80);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const tiles = visibleTiles(view, size);

  return (
    <View
      ref={containerRef}
      style={[styles.container, style]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) onSizeChange({ width, height });
      }}
      accessibilityLabel="지도. 끌어서 이동하고 확대 버튼으로 크기를 바꿀 수 있어요"
      onStartShouldSetResponderCapture={rememberStart}
      onMoveShouldSetResponder={shouldTakeOver}
      onResponderGrant={() => {
        gesture.current = { ...gesture.current, dx: 0, dy: 0 };
        latest.current.onMoveStart?.();
      }}
      onResponderMove={moveMap}
      onResponderRelease={commitMotion}
      onResponderTerminate={commitMotion}
      onResponderTerminationRequest={() => false}
    >
      <Animated.View
        pointerEvents="box-none"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: pinch }] },
        ]}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {tiles.map((tile) => (
            <Image
              key={tile.key}
              source={{
                uri: TILE_URL.replace('{z}', String(tile.z))
                  .replace('{x}', String(tile.x))
                  .replace('{y}', String(tile.y)),
                headers: TILE_HEADERS,
              }}
              fadeDuration={0}
              style={[
                styles.tile,
                { left: tile.left, top: tile.top, width: tile.size, height: tile.size },
              ]}
            />
          ))}
        </View>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: colors.mapLand },
  tile: { position: 'absolute' },
});
