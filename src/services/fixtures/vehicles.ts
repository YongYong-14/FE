import type { PairedDevice } from '@/shared/types/session';

// 시연용 블루투스 기기 목록. 실제 기기 탐색 결과가 아니며 MAC 주소도 예시 값이다.
export const demoPairedDevices: readonly PairedDevice[] = [
  { address: '1C:52:16:A0:3B:7E', name: '내 차 블루투스', kind: 'car-audio' },
  { address: '00:1A:7D:DA:71:13', name: 'CAR AUDIO', kind: 'car-audio' },
  { address: 'F4:4E:FD:12:9C:20', name: '무선 이어폰', kind: 'earphone' },
  { address: '88:C6:26:4B:0D:5A', name: '블루투스 스피커', kind: 'speaker' },
];
