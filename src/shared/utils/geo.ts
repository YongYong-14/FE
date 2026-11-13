import type { Coordinate } from '@/shared/types/location';

const EARTH_RADIUS_M = 6_371_000;

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
