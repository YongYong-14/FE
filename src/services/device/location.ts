import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { LocateResult, LocationService, PlaceService } from '../contracts';
import type { Coordinate, SelectedPlace } from '@/shared/types/location';
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
  if (Platform.OS === 'web') return 'foreground';
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
          const place = await resolvePlace(coordinate, `gps-${fix.timestamp}`);
          if (settled) return;
          finish({
            kind: 'located',
            place: { ...place, name: '현재 위치' },
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

/** 좌표의 주소와 실제 행정구역을 확인한다. 확인 실패를 지원 지역으로 간주하지 않는다. */
export async function resolvePlace(coordinate: Coordinate, id?: string): Promise<SelectedPlace> {
  if (Platform.OS !== 'android') throw new Error('주소 확인은 Android 앱에서 이용해 주세요.');
  const [address] = await Location.reverseGeocodeAsync(coordinate);
  const areas = [address?.city, address?.subregion, address?.district].filter(Boolean).join(' ');
  if (!address || !areas.trim())
    throw new Error('위치의 주소를 확인하지 못했어요. 다시 시도해 주세요.');
  const label =
    address.formattedAddress ||
    [address.region, address.city, address.district, address.street, address.streetNumber]
      .filter(Boolean)
      .join(' ');
  return {
    id: id ?? `place-${coordinate.latitude},${coordinate.longitude}`,
    name: address.name || label,
    address: label || `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`,
    coordinate,
    isSupportedRegion: /용인|\byongin(?:-si)?\b/i.test(areas),
  };
}

const MAX_SEARCH_RESULTS = 6;

/** Android 지오코더에서 실제 주소를 검색한다. 미입력·실패 시 예시 결과를 만들지 않는다. */
export const devicePlaceService: PlaceService = {
  async search(query) {
    const keyword = query.trim();
    if (!keyword) return [];
    if (Platform.OS !== 'android') throw new Error('주소 검색은 Android 앱에서 이용해 주세요.');
    if (!(await Location.getForegroundPermissionsAsync()).granted)
      throw new Error('주소를 검색하려면 위치 권한을 허용해 주세요.');
    // 지오코더는 지역을 가리지 않아 같은 이름의 다른 지역이 먼저 나올 수 있다.
    // 검색어에 용인이 없으면 용인시를 붙인 검색도 함께 시도한다.
    const queries = keyword.includes('용인') ? [keyword] : [`용인시 ${keyword}`, keyword];
    const geocoded = await Promise.allSettled(queries.map((item) => Location.geocodeAsync(item)));
    const failure = geocoded.find((item) => item.status === 'rejected');
    if (failure && geocoded.every((item) => item.status === 'rejected')) throw failure.reason;
    const unique = new Map<string, Coordinate>();
    for (const item of geocoded) {
      if (item.status !== 'fulfilled') continue;
      for (const { latitude, longitude } of item.value) {
        const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
        if (!unique.has(key)) unique.set(key, { latitude, longitude });
      }
    }
    // 주소 확인에 실패한 좌표 하나 때문에 나머지 결과까지 버리지 않는다.
    const resolved = await Promise.allSettled(
      [...unique.values()].slice(0, MAX_SEARCH_RESULTS).map((item) => resolvePlace(item)),
    );
    const places = resolved.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : []));
    const unresolved = resolved.find((item) => item.status === 'rejected');
    if (places.length === 0 && unresolved) throw unresolved.reason;
    // 용인시 안의 결과를 먼저 보여준다.
    return [
      ...places.filter((place) => place.isSupportedRegion),
      ...places.filter((place) => !place.isSupportedRegion),
    ];
  },
};
