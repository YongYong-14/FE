import type { ParkingFeeType, ParkingLotType } from '@/shared/types/map';

// 지도·주변 주차장 시연 데이터. 기준 위치에서 떨어진 거리(북·동쪽 m)로 정의하며 모두 예시 값이다.

export interface DemoOffset {
  /** 북쪽(+)·남쪽(-) m */
  north: number;
  /** 동쪽(+)·서쪽(-) m */
  east: number;
}

export const demoFacilityZones: readonly (DemoOffset & { zoneType: string; radiusM: number })[] = [
  { zoneType: 'HYDRANT', radiusM: 5, north: 120, east: -260 },
  { zoneType: 'HYDRANT', radiusM: 5, north: -60, east: 210 },
  { zoneType: 'BUS_STOP', radiusM: 10, north: 40, east: 30 },
  { zoneType: 'BUS_STOP', radiusM: 10, north: -230, east: -120 },
];

export const demoRiskCells: readonly (DemoOffset & { topPercent: number; reportCount: number })[] =
  [
    { north: 0, east: 0, topPercent: 8, reportCount: 12 },
    { north: 110, east: 280, topPercent: 4.5, reportCount: 8 },
    { north: 160, east: 330, topPercent: 9.2, reportCount: 0 },
    { north: -180, east: -300, topPercent: 6.1, reportCount: 5 },
  ];

export const demoParkingLotSeeds: readonly (DemoOffset & {
  id: string;
  name: string;
  type: ParkingLotType;
  address: string;
  feeType: ParkingFeeType | null;
  fee: string | null;
  hours: string | null;
  capacity: number | null;
})[] = [
  {
    id: 'lot-public-1',
    name: '풍덕천 공영주차장',
    type: 'public',
    address: '용인시 수지구 풍덕천동 ○○로',
    feeType: 'PAID',
    fee: '30분 1,000원',
    hours: '00:00-23:59',
    capacity: 80,
    north: 60,
    east: 170,
  },
  {
    id: 'lot-public-2',
    name: '수지구청 공영주차장',
    type: 'public',
    address: '용인시 수지구 풍덕천동 ○○길',
    feeType: 'FREE',
    fee: '무료',
    hours: '07:00-23:00',
    capacity: 120,
    north: -380,
    east: 240,
  },
  {
    id: 'lot-attached-1',
    name: '○○빌딩 부설주차장',
    type: 'attached',
    address: '용인시 수지구 풍덕천동 ○○로',
    feeType: 'PAID',
    fee: '30분 2,000원',
    hours: '08:00-20:00',
    capacity: 40,
    north: -120,
    east: -680,
  },
  {
    id: 'lot-private-1',
    name: '수지로 민영주차장',
    type: 'private',
    address: '용인시 수지구 풍덕천동 수지로',
    feeType: 'MIXED',
    fee: '최초 1시간 무료, 이후 10분 500원',
    hours: null,
    capacity: null,
    north: 300,
    east: -160,
  },
  {
    id: 'lot-public-3',
    name: '신봉 공영주차장',
    type: 'public',
    address: '용인시 수지구 신봉동 ○○로',
    feeType: 'PAID',
    fee: '30분 600원',
    hours: '18:00-02:00',
    capacity: 60,
    north: -820,
    east: -260,
  },
];
