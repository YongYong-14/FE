import type { ParkingLot } from '@/shared/types/map';
import { isOpenAt } from '@/shared/utils/hours';

/** 영업 여부는 현재 시각으로 다시 계산하며 미상 정보를 운영 중으로 단정하지 않는다. */
export function filterParkingLots(
  lots: ParkingLot[],
  filters: { openOnly: boolean; publicOnly: boolean; paidOnly: boolean },
  now: Date,
): ParkingLot[] {
  return lots
    .map((lot) => ({ ...lot, isOpen: isOpenAt(lot.hours, now) }))
    .filter(
      (lot) =>
        (!filters.openOnly || lot.isOpen === true) &&
        (!filters.publicOnly || lot.type === 'public') &&
        (!filters.paidOnly || lot.feeType === 'PAID' || lot.feeType === 'MIXED'),
    );
}
