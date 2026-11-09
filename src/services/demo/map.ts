import type { MapService, ParkingLotService } from '../contracts';
import { demoFacilityZones, demoParkingLotSeeds, demoRiskCells } from '../fixtures/mapData';
import { demoGpsPlace } from '../fixtures/places';
import { kstSlotOf } from '@/shared/utils/format';
import { distanceMeters, isInside, offsetCoordinate } from '@/shared/utils/geo';
import { isOpenAt } from '@/shared/utils/hours';
import { demoControl, wait } from './scenario';

export const demoMapService: MapService = {
  currentLocation() {
    return demoGpsPlace.coordinate;
  },
  // 화면 범위 중심을 기준으로 예시 구역을 배치한다.
  async riskZones(bounds, at) {
    await wait(200);
    const center = {
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      longitude: (bounds.minLng + bounds.maxLng) / 2,
    };
    return {
      facilityZones: demoFacilityZones
        .map((zone) => ({
          zoneType: zone.zoneType,
          radiusMeters: zone.radiusM,
          coordinate: offsetCoordinate(center, zone.north, zone.east),
        }))
        .filter((zone) => isInside(zone.coordinate, bounds)),
      cells: demoRiskCells
        .map((cell) => ({
          coordinate: offsetCoordinate(center, cell.north, cell.east),
          sizeMeters: 50,
          topPercent: cell.topPercent,
          reportCount: cell.reportCount,
        }))
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
