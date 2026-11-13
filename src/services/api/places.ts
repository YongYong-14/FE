import type { PlaceService } from '../contracts';
import { devicePlaceService } from '../device/location';
import type { SelectedPlace } from '@/shared/types/location';

import { apiConfig } from './config';

// 카카오 로컬 검색. 상호·건물명은 키워드 검색, 도로명·지번은 주소 검색을 함께 쓴다.
// 백엔드가 아니라 카카오 주소로 직접 요청하므로 서비스 인증을 붙이지 않는다.

const KAKAO_LOCAL_URL = 'https://dapi.kakao.com/v2/local/search';
const TIMEOUT_MS = 8_000;
const MAX_RESULTS = 10;
/** 용인시를 감싸는 사각형(왼쪽 경도, 아래 위도, 오른쪽 경도, 위 위도). 검색 우선순위에만 쓴다. */
const YONGIN_RECT = '127.0162,37.0836,127.4278,37.3723';

interface KeywordDocument {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  /** 경도 */
  x: string;
  /** 위도 */
  y: string;
}

interface AddressDocument {
  address_name: string;
  x: string;
  y: string;
  address: { region_2depth_name: string } | null;
  road_address: { address_name: string; region_2depth_name: string; building_name: string } | null;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error('Aborted');
  error.name = 'AbortError';
  throw error;
}

async function request<T>(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T[]> {
  throwIfAborted(signal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${KAKAO_LOCAL_URL}/${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `KakaoAK ${apiConfig.kakaoRestApiKey}` },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new Error('카카오 검색 설정을 확인해 주세요.');
    if (response.status === 429) throw new Error('검색 요청이 많아요. 잠시 후 다시 시도해 주세요.');
    if (!response.ok) throw new Error('장소를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.');
    const body = (await response.json()) as { documents?: unknown } | null;
    if (!body || !Array.isArray(body.documents))
      throw new Error('장소 검색 응답을 확인하지 못했어요. 다시 시도해 주세요.');
    return body.documents as T[];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** 지번 주소는 "경기 용인시 기흥구 …"처럼 두 번째 단위가 시·군이다. 검색어가 아닌 실제 주소로 판정한다. */
const inYongin = (region: string | null | undefined) => /^용인시(\s|$)/.test(region?.trim() ?? '');
const cityOf = (jibunAddress: string) => jibunAddress.trim().split(/\s+/).slice(1).join(' ');

function coordinateOf(document: { x: string; y: string }) {
  if (
    !document ||
    typeof document.x !== 'string' ||
    typeof document.y !== 'string' ||
    !document.x.trim() ||
    !document.y.trim()
  )
    return null;
  const latitude = Number(document.y);
  const longitude = Number(document.x);
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    (latitude || longitude)
    ? { latitude, longitude }
    : null;
}

export function fromKeyword(document: KeywordDocument): SelectedPlace | null {
  const coordinate = coordinateOf(document);
  if (
    !coordinate ||
    typeof document.id !== 'string' ||
    !document.id.trim() ||
    typeof document.place_name !== 'string' ||
    !document.place_name.trim() ||
    typeof document.address_name !== 'string'
  )
    return null;
  return {
    id: `kakao-${document.id}`,
    name: document.place_name,
    address: document.road_address_name?.trim() || document.address_name,
    coordinate,
    isSupportedRegion: inYongin(cityOf(document.address_name)),
  };
}

export function fromAddress(document: AddressDocument): SelectedPlace | null {
  const coordinate = coordinateOf(document);
  if (!coordinate || typeof document.address_name !== 'string' || !document.address_name.trim())
    return null;
  const address = document.road_address?.address_name || document.address_name;
  return {
    id: `kakao-address-${document.x},${document.y}`,
    name: document.road_address?.building_name || document.address_name,
    address,
    coordinate,
    isSupportedRegion: inYongin(
      document.address?.region_2depth_name ?? document.road_address?.region_2depth_name,
    ),
  };
}

export const kakaoPlaceService: PlaceService = {
  async search(query, signal) {
    throwIfAborted(signal);
    const keyword = query.trim();
    if (!keyword) return [];
    // 키가 없는 빌드는 기존 Android 주소 검색을 그대로 쓴다.
    if (!apiConfig.kakaoRestApiKey) return devicePlaceService.search(keyword);
    const settled = await Promise.allSettled([
      // 주소 검색 결과는 입력한 주소 그 자체라 가장 먼저 둔다.
      request<AddressDocument>('address.json', { query: keyword, size: '5' }, signal).then(
        (items) => items.map(fromAddress),
      ),
      // 같은 이름이 전국에 있어도 용인시 안의 장소가 먼저 나오게 한다.
      request<KeywordDocument>(
        'keyword.json',
        { query: keyword, rect: YONGIN_RECT, size: '10' },
        signal,
      ).then((items) => items.map(fromKeyword)),
      request<KeywordDocument>('keyword.json', { query: keyword, size: '5' }, signal).then(
        (items) => items.map(fromKeyword),
      ),
    ]);
    throwIfAborted(signal);
    const failure = settled.find((item) => item.status === 'rejected');
    if (failure && settled.every((item) => item.status === 'rejected')) throw failure.reason;
    const unique = new Map<string, SelectedPlace>();
    for (const item of settled) {
      if (item.status !== 'fulfilled') continue;
      for (const place of item.value)
        if (place && !unique.has(place.id)) unique.set(place.id, place);
    }
    const places = [...unique.values()];
    // 일부 요청만 실패했어도 유효한 결과가 없다면 '결과 없음'으로 숨기지 않는다.
    if (places.length === 0 && failure) throw failure.reason;
    return [
      ...places.filter((place) => place.isSupportedRegion),
      ...places.filter((place) => !place.isSupportedRegion),
    ].slice(0, MAX_RESULTS);
  },
};
