import type { Coordinate } from '@/shared/types/location';
import type { GeoBounds, MapPoint } from '@/shared/types/map';

// 좌표 계산 도구. 지도 일러스트에 실제 좌표를 비율로 배치할 때 쓴다.

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;

const toRadians = (degree: number) => (degree * Math.PI) / 180;

/** 두 좌표의 직선 거리(m). */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function metersPerDegreeLng(latitude: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos(toRadians(latitude));
}

/** 중심에서 위·아래·좌·우로 halfMeters만큼 떨어진 범위. */
export function boundsAround(center: Coordinate, halfMeters: number): GeoBounds {
  const dLat = halfMeters / METERS_PER_DEGREE_LAT;
  const dLng = halfMeters / metersPerDegreeLng(center.latitude);
  return {
    minLat: center.latitude - dLat,
    maxLat: center.latitude + dLat,
    minLng: center.longitude - dLng,
    maxLng: center.longitude + dLng,
  };
}

/** 범위의 가로 길이(m). */
export function boundsWidthMeters(bounds: GeoBounds): number {
  const middle = (bounds.minLat + bounds.maxLat) / 2;
  return (bounds.maxLng - bounds.minLng) * metersPerDegreeLng(middle);
}

export function isInside(coordinate: Coordinate, bounds: GeoBounds): boolean {
  return (
    coordinate.latitude >= bounds.minLat &&
    coordinate.latitude <= bounds.maxLat &&
    coordinate.longitude >= bounds.minLng &&
    coordinate.longitude <= bounds.maxLng
  );
}

/** 0~100 비율. 북쪽이 위다. */
export function projectRatio(coordinate: Coordinate, bounds: GeoBounds): { x: number; y: number } {
  const x = ((coordinate.longitude - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
  const y = ((bounds.maxLat - coordinate.latitude) / (bounds.maxLat - bounds.minLat)) * 100;
  return { x, y };
}

export function project(coordinate: Coordinate, bounds: GeoBounds): MapPoint {
  const { x, y } = projectRatio(coordinate, bounds);
  return { left: `${x.toFixed(2)}%`, top: `${y.toFixed(2)}%` };
}

/** 범위 가로 대비 미터의 비율(0~100). */
export function metersToWidthPercent(meters: number, bounds: GeoBounds): number {
  return (meters / boundsWidthMeters(bounds)) * 100;
}

/** 범위 세로 대비 미터의 비율(0~100). */
export function metersToHeightPercent(meters: number, bounds: GeoBounds): number {
  return (meters / ((bounds.maxLat - bounds.minLat) * METERS_PER_DEGREE_LAT)) * 100;
}

/** 기준 좌표에서 북·동쪽으로 m만큼 옮긴 좌표. */
export function offsetCoordinate(center: Coordinate, north: number, east: number): Coordinate {
  return {
    latitude: center.latitude + north / METERS_PER_DEGREE_LAT,
    longitude: center.longitude + east / metersPerDegreeLng(center.latitude),
  };
}
