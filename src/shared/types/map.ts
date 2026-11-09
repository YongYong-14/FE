import type { DimensionValue } from 'react-native';

// 지도 일러스트 위 배치 좌표(컨테이너 대비 비율). 실제 지도 좌표가 아니다.
export interface MapPoint {
  left: DimensionValue;
  top: DimensionValue;
}

export interface MapRect extends MapPoint {
  width: DimensionValue;
  height: DimensionValue;
}

export interface RiskArea {
  id: string;
  level: 1 | 2;
  /** 직사각형 구역 또는 원형(지름 px) 구역. */
  shape: { kind: 'rect'; rect: MapRect } | { kind: 'circle'; center: MapPoint; size: number };
  /** 신고 건수 표시 위치. */
  badge: MapPoint;
  /** 예시 신고 건수. */
  reportCount: number;
}

export type ParkingLotType = 'public' | 'street-paid' | 'private';
export type ParkingFeeType = 'FREE' | 'PAID' | 'MIXED';

export interface ParkingLot {
  id: string;
  name: string;
  type: ParkingLotType;
  address: string;
  /** 기준 위치에서 주차장까지의 직선 거리(m). */
  distanceMeters: number;
  /** 요금 구분. 정보가 없으면 null이며 무료로 간주하지 않는다. */
  feeType: ParkingFeeType | null;
  /** 예: "30분 1,000원" — 예시 요금 */
  fee: string;
  isOpen: boolean;
  hours: string;
  position: MapPoint;
}
