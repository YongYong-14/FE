import type { DimensionValue } from 'react-native';

import type { Coordinate } from './location';

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
  /** 칸의 신고 건수. 0이면 건수 문구를 숨긴다. */
  reportCount: number;
}

/** 화면에 보이는 지도 범위(WGS84). */
export interface GeoBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** 신고 데이터의 기준 기간(YYYY-MM-DD). */
export interface DataPeriod {
  start: string;
  end: string;
}

/** 요일(1=월~7=일)과 3시간 구간(0=00~03시 ~ 7=21~24시). */
export interface TimeSlot {
  weekday: number;
  timeSlot: number;
}

export interface FacilityZone {
  /** HYDRANT(소화전), BUS_STOP(버스정류소) 등 */
  zoneType: string;
  coordinate: Coordinate;
  /** 법정 거리(m). */
  radiusMeters: number;
}

export interface RiskCell {
  coordinate: Coordinate;
  sizeMeters: number;
  topPercent: number;
  reportCount: number;
}

/** 지도 탭의 1단계 구역·2단계 집중 칸. 칸이 없다는 것이 안전하다는 뜻은 아니다. */
export interface RiskZoneData {
  facilityZones: FacilityZone[];
  cells: RiskCell[];
  dataPeriod: DataPeriod | null;
  slot: TimeSlot | null;
  isExampleData: boolean;
}

export type ParkingLotType = 'public' | 'private' | 'attached';
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
  /** 요금 안내 문장. 예: "30분 600원". 정보가 없으면 null. */
  fee: string | null;
  /** 오늘 운영시간 "HH:mm-HH:mm". 정보가 없으면 null(휴무로 단정하지 않음). */
  hours: string | null;
  /** 지금 운영 중인지. 운영시간 정보가 없으면 null. */
  isOpen: boolean | null;
  capacity: number | null;
  coordinate: Coordinate;
}

export interface ParkingLotSearch {
  radiusMeters: number;
  /** 500m 안에 없어 1km까지 넓혀 찾았는지. */
  expanded: boolean;
  lots: ParkingLot[];
  isExampleData: boolean;
}
