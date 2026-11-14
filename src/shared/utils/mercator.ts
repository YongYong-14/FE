import type { Coordinate } from '@/shared/types/location';
import type { GeoBounds } from '@/shared/types/map';

// 웹 메르카토르(지도 타일 표준) 좌표 계산. 지도 이동·확대와 화면 좌표 변환에 쓴다.

export const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;
/** 확대 0에서 적도 기준 1px의 길이(m). */
const METERS_PER_PIXEL_Z0 = 156_543.033_92;

export interface MapView {
  center: Coordinate;
  /** 소수 확대 단계도 허용한다. */
  zoom: number;
}

export interface ViewSize {
  width: number;
  height: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

const worldSize = (zoom: number) => TILE_SIZE * 2 ** zoom;

function toWorld(coordinate: Coordinate, zoom: number): ScreenPoint {
  const size = worldSize(zoom);
  const latitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, coordinate.latitude));
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((coordinate.longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

function fromWorld(x: number, y: number, zoom: number): Coordinate {
  const size = worldSize(zoom);
  const n = Math.PI - (2 * Math.PI * y) / size;
  return {
    latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    longitude: (x / size) * 360 - 180,
  };
}

/**
 * 첫 좌표를 보이는 영역의 가운데에 둔 채, 나머지 좌표가 모두 화면 안(여백 제외)에 들어오는
 * 가장 큰 정수 확대 단계를 고른다. 어느 단계에서도 다 들어오지 않으면 가장 넓은 단계를 쓴다.
 */
export function fitView(
  points: Coordinate[],
  size: ViewSize,
  options: {
    minZoom: number;
    maxZoom: number;
    padding: { top: number; right: number; bottom: number; left: number };
  },
): MapView {
  const { minZoom, maxZoom, padding } = options;
  const origin = points[0];
  if (!origin) throw new Error('fitView needs at least one point');
  const lowest = Math.ceil(minZoom);
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  let zoom = Math.floor(maxZoom);
  for (; zoom > lowest; zoom -= 1) {
    const center = toWorld(origin, zoom);
    const fits = points.every((point) => {
      const world = toWorld(point, zoom);
      const dx = world.x - center.x;
      const dy = world.y - center.y;
      return (
        dx >= -(halfWidth - padding.left) &&
        dx <= halfWidth - padding.right &&
        dy >= -(halfHeight - padding.top) &&
        dy <= halfHeight - padding.bottom
      );
    });
    if (fits) break;
  }
  return { center: origin, zoom };
}

export interface Projector {
  size: ViewSize;
  /** 화면에 보이는 범위. */
  bounds: GeoBounds;
  toScreen(coordinate: Coordinate): ScreenPoint;
  toCoordinate(point: ScreenPoint): Coordinate;
  metersToPixels(meters: number): number;
}

/** 지도 중심·확대 단계·화면 크기로 좌표 ↔ 화면 px 변환기를 만든다. */
export function createProjector(view: MapView, size: ViewSize): Projector {
  const center = toWorld(view.center, view.zoom);
  const toScreen = (coordinate: Coordinate): ScreenPoint => {
    const point = toWorld(coordinate, view.zoom);
    return { x: point.x - center.x + size.width / 2, y: point.y - center.y + size.height / 2 };
  };
  const toCoordinate = ({ x, y }: ScreenPoint): Coordinate =>
    fromWorld(center.x + x - size.width / 2, center.y + y - size.height / 2, view.zoom);
  const northWest = toCoordinate({ x: 0, y: 0 });
  const southEast = toCoordinate({ x: size.width, y: size.height });
  const metersPerPixel =
    (METERS_PER_PIXEL_Z0 * Math.cos((view.center.latitude * Math.PI) / 180)) / 2 ** view.zoom;
  return {
    size,
    bounds: {
      minLat: southEast.latitude,
      maxLat: northWest.latitude,
      minLng: northWest.longitude,
      maxLng: southEast.longitude,
    },
    toScreen,
    toCoordinate,
    metersToPixels: (meters) => meters / metersPerPixel,
  };
}

/** 화면 위치(point)의 좌표가 확대 후에도 같은 자리에 있도록 새 중심을 구한다. */
export function zoomAround(
  view: MapView,
  size: ViewSize,
  point: ScreenPoint,
  zoom: number,
): MapView {
  const anchor = createProjector(view, size).toCoordinate(point);
  const world = toWorld(anchor, zoom);
  return {
    zoom,
    center: fromWorld(
      world.x - (point.x - size.width / 2),
      world.y - (point.y - size.height / 2),
      zoom,
    ),
  };
}

export interface TilePlacement {
  key: string;
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
  size: number;
}

/** 화면을 덮는 타일 목록. 끌어서 옮길 때 빈칸이 덜 보이도록 바깥으로 overscan장 더 둔다. */
export function visibleTiles(
  view: MapView,
  size: ViewSize,
  maxTileZoom = 19,
  overscan = 1,
): TilePlacement[] {
  if (size.width <= 0 || size.height <= 0) return [];
  const z = Math.max(0, Math.min(maxTileZoom, Math.floor(view.zoom)));
  const scale = 2 ** (view.zoom - z);
  const center = toWorld(view.center, z);
  const halfWidth = size.width / 2 / scale;
  const halfHeight = size.height / 2 / scale;
  const count = 2 ** z;
  const minX = Math.floor((center.x - halfWidth) / TILE_SIZE) - overscan;
  const maxX = Math.floor((center.x + halfWidth) / TILE_SIZE) + overscan;
  const minY = Math.max(0, Math.floor((center.y - halfHeight) / TILE_SIZE) - overscan);
  const maxY = Math.min(count - 1, Math.floor((center.y + halfHeight) / TILE_SIZE) + overscan);
  const tiles: TilePlacement[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      tiles.push({
        key: `${z}/${x}/${y}`,
        z,
        x: ((x % count) + count) % count,
        y,
        left: (x * TILE_SIZE - center.x) * scale + size.width / 2,
        top: (y * TILE_SIZE - center.y) * scale + size.height / 2,
        size: TILE_SIZE * scale,
      });
    }
  }
  return tiles;
}

/**
 * 서버 조회용 고정 격자 칸. 지도 위험 구역 API는 한 변 2km까지만 받으므로
 * 화면 범위를 약 1.8km 칸으로 나눠 조회하고, 같은 칸은 다시 쓰도록 위치를 고정한다.
 */
const BOX_LAT_STEP = 0.016;
const BOX_LNG_STEP = 0.02;

/** 요청 주소에 부동소수 오차(127.10000000000001)가 남지 않게 한다. */
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export interface QueryBox {
  key: string;
  bounds: GeoBounds;
}

export function queryBoxes(
  bounds: GeoBounds,
  maxBoxes = 12,
): { boxes: QueryBox[]; truncated: boolean } {
  const rowStart = Math.floor(bounds.minLat / BOX_LAT_STEP);
  const rowEnd = Math.floor(bounds.maxLat / BOX_LAT_STEP);
  const colStart = Math.floor(bounds.minLng / BOX_LNG_STEP);
  const colEnd = Math.floor(bounds.maxLng / BOX_LNG_STEP);
  const centerRow = (rowStart + rowEnd) / 2;
  const centerCol = (colStart + colEnd) / 2;
  const boxes: (QueryBox & { distance: number })[] = [];
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      boxes.push({
        key: `${row}:${col}`,
        bounds: {
          minLat: round6(row * BOX_LAT_STEP),
          maxLat: round6((row + 1) * BOX_LAT_STEP),
          minLng: round6(col * BOX_LNG_STEP),
          maxLng: round6((col + 1) * BOX_LNG_STEP),
        },
        distance: Math.abs(row - centerRow) + Math.abs(col - centerCol),
      });
    }
  }
  // 너무 넓으면 화면 가운데 칸부터 조회한다.
  const nearest = boxes
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxBoxes)
    .map(({ key, bounds: box }) => ({ key, bounds: box }));
  return { boxes: nearest, truncated: boxes.length > maxBoxes };
}
