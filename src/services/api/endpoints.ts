import { apiRequest } from './client';
import type {
  AgreementRequest,
  DeliveryRequest,
  HealthResponse,
  KakaoLoginRequest,
  LatestResponse,
  LoginResponse,
  MeResponse,
  NotificationSettingsDto,
  NotificationSettingsPatch,
  ParkingEventDetailResponse,
  ParkingEventListResponse,
  ParkingEventRequest,
  ParkingEventResponse,
  ParkingLotsResponse,
  RiskZonesResponse,
  TokenResponse,
  VehicleRequest,
  VehicleResponse,
} from './types';

// API 명세 v0.11의 엔드포인트와 1:1로 대응한다. 경로는 모두 /api/v1 아래다.
// POST /webhooks/kakao/unlink는 카카오 서버 전용이라 앱이 호출하지 않는다.
// POST /auth/refresh는 client.ts가 토큰 만료 때 자동으로 호출한다(아래 함수는 수동 호출용).

// ── 2. 인증·계정

/** POST /auth/kakao — 카카오 로그인(가입 포함) */
export const loginWithKakao = (body: KakaoLoginRequest) =>
  apiRequest<LoginResponse>('/auth/kakao', { method: 'POST', body, auth: false });

/** POST /auth/refresh — 토큰 재발급(회전) */
export const refreshAuth = (refreshToken: string) =>
  apiRequest<TokenResponse>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
  });

/** POST /auth/logout — 제출한 리프레시 토큰의 계열 폐기(204) */
export const logout = (refreshToken: string) =>
  apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken } });

/** GET /me — 내 정보·약관 상태 */
export const getMe = () => apiRequest<MeResponse>('/me');

/** POST /me/agreements — 약관 동의·철회 기록(201) */
export const recordAgreement = (body: AgreementRequest) =>
  apiRequest<unknown>('/me/agreements', { method: 'POST', body });

/** DELETE /me — 회원 탈퇴(204) */
export const deleteMe = () => apiRequest<void>('/me', { method: 'DELETE' });

// ── 3. 차량·알림 설정

/** GET /vehicle — 내 차량 조회 */
export const getVehicle = () => apiRequest<VehicleResponse>('/vehicle');

/** PUT /vehicle — 차량 등록·변경 */
export const putVehicle = (body: VehicleRequest) =>
  apiRequest<VehicleResponse>('/vehicle', { method: 'PUT', body });

/** GET /notification-settings — 알림 설정 조회 */
export const getNotificationSettings = () =>
  apiRequest<NotificationSettingsDto>('/notification-settings');

/** PATCH /notification-settings — 보낸 필드만 변경 */
export const patchNotificationSettings = (body: NotificationSettingsPatch) =>
  apiRequest<NotificationSettingsDto>('/notification-settings', { method: 'PATCH', body });

// ── 4. 주차 이벤트·판정

/** POST /parking-events — 주차 저장 + 판정(신규 201, 같은 키 재요청 200) */
export const createParkingEvent = (body: ParkingEventRequest, signal?: AbortSignal) =>
  apiRequest<ParkingEventResponse>('/parking-events', { method: 'POST', body, signal });

/** GET /parking-events/latest — 최근 주차와 판정 */
export const getLatestParkingEvent = () => apiRequest<LatestResponse>('/parking-events/latest');

/** GET /parking-events?level=ALL&limit=50 — 기록 목록(최신순) */
export const listParkingEvents = (options: { level?: 'ALL' | 1 | 2; limit?: number } = {}) =>
  apiRequest<ParkingEventListResponse>('/parking-events', {
    query: { level: options.level ?? 'ALL', limit: options.limit ?? 50 },
  });

/** GET /parking-events/{id} — 판정 상세 */
export const getParkingEvent = (id: string) =>
  apiRequest<ParkingEventDetailResponse>(`/parking-events/${encodeURIComponent(id)}`);

/** PATCH /parking-events/{id}/delivery — 알림 표시 결과 보고(204) */
export const reportParkingEventDelivery = (id: string, body: DeliveryRequest) =>
  apiRequest<void>(`/parking-events/${encodeURIComponent(id)}/delivery`, {
    method: 'PATCH',
    body,
  });

// ── 5. 주변 주차장·지도

/** GET /parking-lots/nearby — 주변 주차장(직선 거리순) */
export const getNearbyParkingLots = (query: { lat: number; lng: number; radius?: number }) =>
  apiRequest<ParkingLotsResponse>('/parking-lots/nearby', { query });

/** GET /map/risk-zones — 화면 범위의 1단계 구역·2단계 집중 칸 */
export const getRiskZones = (query: {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  at?: string;
}) => apiRequest<RiskZonesResponse>('/map/risk-zones', { query });

// ── 공통

/** GET /health — 서버 기본 응답 확인 */
export const getHealth = () => apiRequest<HealthResponse>('/health', { auth: false });
