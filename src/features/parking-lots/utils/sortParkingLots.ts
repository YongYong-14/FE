import type { ParkingLot } from '@/shared/types/map';

export type ParkingLotSort = 'distance' | 'free-first';

/** 같은 요금 구분 안에서는 가까운 순으로 정렬하고, 원본 목록은 유지한다. */
export function sortParkingLots(lots: readonly ParkingLot[], sort: ParkingLotSort): ParkingLot[] {
  return [...lots].sort((a, b) => {
    if (sort === 'free-first') {
      const freeOrder = Number(b.feeType === 'FREE') - Number(a.feeType === 'FREE');
      if (freeOrder !== 0) return freeOrder;
    }
    return a.distanceMeters - b.distanceMeters;
  });
}
