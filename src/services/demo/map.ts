import type { MapService, ParkingLotService } from '../contracts';
import { demoFacilityZones, demoParkingLotSeeds, demoRiskCells } from '../fixtures/mapData';
import { demoGpsPlace, demoPlaces } from '../fixtures/places';
import type { Coordinate } from '@/shared/types/location';
import { kstSlotOf } from '@/shared/utils/format';
import { distanceMeters, isInside, offsetCoordinate } from '@/shared/utils/geo';
import { isOpenAt } from '@/shared/utils/hours';
import { demoControl, wait } from './scenario';

/**
 * 예시 구역을 둘 기준 위치: 데모 현재 위치와 지원 지역 안의 예시 장소.
 * 서로 500m 안의 장소는 같은 구역이 겹쳐 보이므로 하나만 쓴다.
 */
const demoAnchors = [
  demoGpsPlace.coordinate,
  ...demoPlaces.filter((place) => place.isSupportedRegion).map((place) => place.coordinate),
].reduce<Coordinate[]>(
  (anchors, coordinate) =>
    anchors.some((anchor) => distanceMeters(anchor, coordinate) < 500)
      ? anchors
      : [...anchors, coordinate],
  [],
);

export const demoMapService: MapService = {
  currentLocation() {
    return demoGpsPlace.coordinate;
  },
  // 예시 장소마다 같은 모양의 예시 구역을 두고, 요청 범위 안의 것만 돌려준다.
  async riskZones(bounds, at) {
    await wait(200);
    return {
      facilityZones: demoAnchors
        .flatMap((anchor) =>
          demoFacilityZones.map((zone) => ({
            zoneType: zone.zoneType,
            radiusMeters: zone.radiusM,
            coordinate: offsetCoordinate(anchor, zone.north, zone.east),
          })),
        )
        .filter((zone) => isInside(zone.coordinate, bounds)),
      cells: demoAnchors
        .flatMap((anchor) =>
          demoRiskCells.map((cell) => ({
            coordinate: offsetCoordinate(anchor, cell.north, cell.east),
            sizeMeters: 50,
            topPercent: cell.topPercent,
            reportCount: cell.reportCount,
          })),
        )
        .filter((cell) => isInside(cell.coordinate, bounds)),
      dataPeriod: null,
      slot: kstSlotOf(at ?? new Date().toISOString()),
      isExampleData: true,
    };
  },
};

export const demoParkingLotService: ParkingLotService = {
  // 서버와 같이 500m 안에 없으면 1km까지 넓혀 찾는다.
  async search(origin, radiusMeters) {
    await wait(450);
    const mode = demoControl.get().parkingLots;
    const now = new Date();
    const all =
      mode === 'none'
        ? []
        : demoParkingLotSeeds
            .map(({ north, east, ...seed }) => {
              const coordinate = offsetCoordinate(origin, north, east);
              return {
                ...seed,
                coordinate,
                distanceMeters: Math.round(distanceMeters(origin, coordinate) * 10) / 10,
                isOpen: isOpenAt(seed.hours, now),
              };
            })
            .filter((lot) => mode !== 'far-only' || lot.distanceMeters > 500)
            .sort((a, b) => a.distanceMeters - b.distanceMeters);
    const within = (radius: number) => all.filter((lot) => lot.distanceMeters <= radius);
    const first = within(radiusMeters);
    const expanded = radiusMeters === 500 && first.length === 0;
    return {
      radiusMeters,
      expanded,
      lots: expanded ? within(1000) : first,
      isExampleData: true,
    };
  },
};
