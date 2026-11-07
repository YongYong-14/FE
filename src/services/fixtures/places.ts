import type { SelectedPlace } from '@/shared/types/location';

// 공통 용인시 예시 장소. 주소·좌표는 시연용 값이며 실제 위치 판별 결과가 아니다.

export const demoGpsPlace: SelectedPlace = {
  id: 'gps-pungdeokcheon',
  name: '현재 위치',
  address: '용인시 수지구 풍덕천동 ○○로 앞',
  coordinate: { latitude: 37.3221, longitude: 127.0982 },
  isSupportedRegion: true,
};

export const demoOutsidePlace: SelectedPlace = {
  id: 'gps-outside',
  name: '현재 위치',
  address: '수원시 영통구 이의동 ○○로 앞',
  coordinate: { latitude: 37.2985, longitude: 127.0461 },
  isSupportedRegion: false,
};

export const demoPlaces: readonly SelectedPlace[] = [
  {
    id: 'place-suji-office',
    name: '수지구청 앞',
    address: '용인시 수지구 풍덕천동 ○○로',
    coordinate: { latitude: 37.3222, longitude: 127.0977 },
    isSupportedRegion: true,
  },
  {
    id: 'place-jukjeon-station',
    name: '죽전역 2번 출구',
    address: '용인시 수지구 죽전동 ○○로',
    coordinate: { latitude: 37.3245, longitude: 127.1074 },
    isSupportedRegion: true,
  },
  {
    id: 'place-giheung-station',
    name: '기흥역 상가 골목',
    address: '용인시 기흥구 구갈동 ○○로',
    coordinate: { latitude: 37.2752, longitude: 127.1159 },
    isSupportedRegion: true,
  },
  {
    id: 'place-yongin-terminal',
    name: '용인공용버스터미널',
    address: '용인시 처인구 김량장동 ○○로',
    coordinate: { latitude: 37.2378, longitude: 127.2096 },
    isSupportedRegion: true,
  },
  {
    id: 'place-dongbaek-park',
    name: '동백호수공원 입구',
    address: '용인시 기흥구 중동 ○○로',
    coordinate: { latitude: 37.2697, longitude: 127.1527 },
    isSupportedRegion: true,
  },
  {
    id: 'place-suwon-outside',
    name: '광교호수공원 (지원 지역 밖 예시)',
    address: '수원시 영통구 하동 ○○로',
    coordinate: { latitude: 37.2833, longitude: 127.0659 },
    isSupportedRegion: false,
  },
];
