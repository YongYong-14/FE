import type { RegisteredVehicle } from '@/shared/types/session';

// 시연용 블루투스 기기 목록. 실제 기기 탐색 결과가 아니다.
export const demoVehicles: readonly RegisteredVehicle[] = [
  { id: 'demo-car-1', name: '내 차 블루투스', kind: 'car-audio' },
  { id: 'demo-car-2', name: 'CAR AUDIO', kind: 'car-audio' },
  { id: 'demo-earphone', name: '무선 이어폰', kind: 'earphone' },
  { id: 'demo-speaker', name: '블루투스 스피커', kind: 'speaker' },
];
