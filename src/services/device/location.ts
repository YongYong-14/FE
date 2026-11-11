import * as Location from 'expo-location';

import type { LocateResult, LocationService } from '../contracts';
import type { Coordinate } from '@/shared/types/location';
import type { LocationPermission } from '@/shared/types/session';
import { nativeBluetooth } from './bluetooth';

let cachedCoordinate: Coordinate | null = null;

export function currentDeviceCoordinate(): Coordinate | null {
  return cachedCoordinate;
}

export async function locationPermission(): Promise<LocationPermission> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted')
    return foreground.status === 'undetermined' ? 'unset' : 'denied';
  const background = await Location.getBackgroundPermissionsAsync();
  return background.granted ? 'always' : 'foreground';
}

export const requestLocationPermission = () => Location.requestForegroundPermissionsAsync();
export const requestBackgroundLocationPermission = () =>
  Location.requestBackgroundPermissionsAsync();

/** 권한 요청은 안내 화면에서만 한다. GPS 실패를 예시 위치로 바꾸지 않는다. */
export const nativeLocationService: LocationService = {
  async locate(signal, options) {
    if (signal?.aborted) {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    }
    if (!(await Location.getForegroundPermissionsAsync()).granted) {
      return { kind: 'unavailable', reason: '위치 권한을 허용한 뒤 다시 시도해 주세요.' };
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      return { kind: 'unavailable', reason: '휴대폰의 위치 서비스를 켜 주세요.' };
    }
    return new Promise<LocateResult>((resolve, reject) => {
      let settled = false;
      const finish = (result: LocateResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(result);
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      };
      const timer = setTimeout(
        () =>
          finish({
            kind: 'unavailable',
            reason: '위치 조회 시간이 초과됐어요. 다시 측정해 주세요.',
          }),
        20_000,
      );
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      const readFix = async () => {
        const saved = options
          ? await nativeBluetooth.parkingFix(Date.parse(options.detectedAt)).catch(() => null)
          : null;
        return saved
          ? {
              timestamp: saved.timestamp,
              coords: {
                latitude: saved.latitude,
                longitude: saved.longitude,
                accuracy: saved.accuracy,
              },
            }
          : Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      };
      void readFix()
        .then(async (fix) => {
          if (settled) return;
          const { latitude, longitude, accuracy } = fix.coords;
          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180 ||
            accuracy === null ||
            !Number.isFinite(accuracy) ||
            accuracy < 0
          ) {
            finish({
              kind: 'unavailable',
              reason: '정확한 위치 정보를 받지 못했어요. 다시 측정해 주세요.',
            });
            return;
          }
          const coordinate = { latitude, longitude };
          if (!options) cachedCoordinate = coordinate;
          const addresses = await Location.reverseGeocodeAsync(coordinate);
          if (settled) return;
          const address = addresses[0];
          // 경계 상자나 데모 지역 값으로 용인시라고 단정하지 않는다.
          const areas = [address?.city, address?.subregion, address?.district]
            .filter(Boolean)
            .join(' ');
          if (!address || !areas.trim()) {
            finish({
              kind: 'unavailable',
              reason: '현재 위치의 행정구역을 확인하지 못했어요. 다시 측정해 주세요.',
            });
            return;
          }
          const isSupportedRegion = /용인|\byongin(?:-si)?\b/i.test(areas);
          const label =
            address.formattedAddress ||
            [address.region, address.city, address.district, address.street, address.streetNumber]
              .filter(Boolean)
              .join(' ');
          finish({
            kind: 'located',
            place: {
              id: `gps-${fix.timestamp}`,
              name: '현재 위치',
              address: label || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
              coordinate,
              isSupportedRegion,
            },
            accuracyMeters: Math.ceil(accuracy),
          });
        })
        .catch(() =>
          finish({
            kind: 'unavailable',
            reason: 'GPS 위치 또는 주소를 받지 못했어요. 다시 측정해 주세요.',
          }),
        );
    });
  },
};
