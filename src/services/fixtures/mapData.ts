import type { MapPoint, ParkingLot, RiskArea } from '@/shared/types/map';

// 지도 일러스트용 예시 데이터. 위치·건수·요금·운영 상태는 모두 시연용 값이다.

export const demoCurrentLocation: MapPoint = { left: '51%', top: '71.8%' };

export const demoRiskAreas: readonly RiskArea[] = [
  {
    id: 'zone-hydrant',
    level: 1,
    shape: { kind: 'rect', rect: { left: '8%', top: '45%', width: '27%', height: '12%' } },
    badge: { left: '21.5%', top: '44.4%' },
    reportCount: 12,
  },
  {
    id: 'zone-market',
    level: 2,
    shape: { kind: 'rect', rect: { left: '64%', top: '46%', width: '28%', height: '10%' } },
    badge: { left: '78%', top: '45.4%' },
    reportCount: 8,
  },
  {
    id: 'zone-bus',
    level: 1,
    shape: { kind: 'circle', center: { left: '51%', top: '62%' }, size: 54 },
    badge: { left: '51%', top: '58%' },
    reportCount: 5,
  },
];

export const demoParkingLots: readonly ParkingLot[] = [
  {
    id: 'lot-public-1',
    name: '풍덕천 공영주차장',
    type: 'public',
    address: '용인시 수지구 풍덕천동 ○○로',
    distanceMeters: 180,
    feeType: 'PAID',
    fee: '30분 1,000원',
    isOpen: true,
    hours: '24시간',
    position: { left: '76%', top: '50%' },
  },
  {
    id: 'lot-street-1',
    name: '수지로 노상주차장',
    type: 'street-paid',
    address: '용인시 수지구 풍덕천동 수지로',
    distanceMeters: 320,
    feeType: 'PAID',
    fee: '30분 1,200원',
    isOpen: true,
    hours: '09:00~21:00',
    position: { left: '24%', top: '33.5%' },
  },
  {
    id: 'lot-public-2',
    name: '수지구청 공영주차장',
    type: 'public',
    address: '용인시 수지구 풍덕천동 ○○길',
    distanceMeters: 450,
    feeType: 'FREE',
    fee: '무료',
    isOpen: true,
    hours: '07:00~23:00',
    position: { left: '80%', top: '86%' },
  },
  {
    id: 'lot-private-1',
    name: '○○빌딩 부설주차장',
    type: 'private',
    address: '용인시 수지구 풍덕천동 ○○로',
    distanceMeters: 690,
    feeType: 'PAID',
    fee: '30분 2,000원',
    isOpen: false,
    hours: '08:00~20:00 (운영 종료)',
    position: { left: '22%', top: '55%' },
  },
  {
    id: 'lot-public-3',
    name: '신봉 공영주차장',
    type: 'public',
    address: '용인시 수지구 신봉동 ○○로',
    distanceMeters: 860,
    feeType: 'PAID',
    fee: '30분 600원',
    isOpen: true,
    hours: '24시간',
    position: { left: '22%', top: '88%' },
  },
];
