import type { LocationService, PlaceService } from '../contracts';
import { demoGpsPlace, demoOutsidePlace, demoPlaces } from '../fixtures/places';
import { demoControl, wait } from './scenario';

export const demoLocationService: LocationService = {
  async locate(signal) {
    await wait(1100, signal);
    const mode = demoControl.get().locate;
    if (mode === 'unavailable') {
      return { kind: 'unavailable', reason: '지하주차장이라 위치를 받지 못했어요' };
    }
    if (mode === 'outside') {
      return { kind: 'located', place: { ...demoOutsidePlace }, accuracyMeters: 12 };
    }
    return { kind: 'located', place: { ...demoGpsPlace }, accuracyMeters: 8 };
  },
};

// 공통 용인시 예시 장소 검색(최소 구현). 지도·검색 담당(팀원2)이 같은 진입점을 확장한다.
export const demoPlaceService: PlaceService = {
  async search(query) {
    await wait(250);
    if (demoControl.consume('placeSearch', 'normal') === 'fail-once') {
      throw new Error('장소를 불러오지 못했어요.');
    }
    const keyword = query.trim();
    if (!keyword) return demoPlaces.map((place) => ({ ...place }));
    return demoPlaces
      .filter((place) => place.name.includes(keyword) || place.address.includes(keyword))
      .map((place) => ({ ...place }));
  },
};
