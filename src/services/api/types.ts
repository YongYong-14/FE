// 서버 요청·응답 자료형. API 명세 v0.11(ERD v5.1)과 백엔드 응답 레코드 기준이며 data 안쪽만 적는다.
// 시간은 시간대가 붙은 ISO 8601, 날짜는 YYYY-MM-DD, 좌표는 WGS84다.

import type { AgreementType } from '@/shared/types/session';

export interface LatLng {
  lat: number;
  lng: number;
}

// ── 2. 인증·계정

export interface KakaoLoginRequest {
  kakaoAccessToken: string;
  deviceInfo?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isNewUser: boolean;
  user: { id: string; nickname: string; profileImageUrl: string | null };
  agreements: { missing: AgreementType[] };
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type AgreementAction = 'AGREE' | 'WITHDRAW';

export interface AgreementEvent {
  type: AgreementType;
  version: string;
  action: AgreementAction;
  occurredAt: string;
}

export interface MeResponse {
  id: string;
  nickname: string;
  email: string | null;
  hasVehicle: boolean;
  agreements: AgreementEvent[];
}

export interface AgreementRequest {
  type: AgreementType;
  version: string;
  action: AgreementAction;
}

// ── 3. 차량

export interface VehicleDto {
  id: string;
  name: string;
  bluetoothAddress: string;
  deviceType: string | null;
}

export interface VehicleResponse {
  vehicle: VehicleDto | null;
}

export interface VehicleRequest {
  name: string;
  bluetoothAddress: string;
  deviceType?: string | null;
}

// ── 4. 주차 이벤트·판정

export interface ParkingEventRequest {
  clientEventId: string;
  vehicleId: string;
  detectedAt: string;
  confirmedAt: string;
  confirmationMethod: 'CONFIRMED' | 'ADJUSTED' | 'AUTO';
  originalLocation: (LatLng & { accuracyM: number }) | null;
  lastKnownLocation: (LatLng & { at: string }) | null;
  confirmedLocation: LatLng;
  remeasureCount: number;
}

export type AssessmentStatus = 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
/** OK, SKIPPED, OUT_OF_AREA, NOT_TARGET, NO_ACTIVE_VERSION, MISSING_ROW 등 */
export type PredictionStatus = string;
/** 서버 응답 호환용이며 앱의 알림 표시·설정에는 사용하지 않는다. */
export type NotifyDecision = 'SEND' | 'SUPPRESSED_SETTING' | 'SUPPRESSED_NIGHT' | 'NONE';

export interface AssessmentReason {
  rank: number;
  /** FACILITY_RULE(시설 거리 규칙) 또는 MODEL(신고 예측) */
  type: string;
  zoneType: string | null;
  distanceM: number | null;
  thresholdM: number | null;
  accuracyMarginM?: number | null;
  description: string | null;
}

export interface AssessmentStats {
  reportCount: number | null;
  reportRadiusM: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  predictedCount: number | null;
  topPercent: number | null;
}

export interface StatsPeak {
  weekday: number;
  timeSlot: number;
  slotCounts: number[];
}

export interface AssessmentNotify {
  decision: NotifyDecision;
  expiresAt: string;
  title: string | null;
  body: string | null;
}

export interface AssessmentDto {
  status: AssessmentStatus;
  level: 1 | 2 | 3 | null;
  predictionStatus: PredictionStatus | null;
  primaryZoneType: string | null;
  reasons: AssessmentReason[];
  stats: AssessmentStats | null;
  referenceFineAmount: number | null;
  attemptCount: number;
  notify: AssessmentNotify | null;
  evaluatedAt: string | null;
}

export interface ParkingEventResponse {
  parkingEventId: string;
  address: string | null;
  assessment: AssessmentDto;
}

export interface DataPeriodDto {
  start: string;
  end: string;
}

export interface EventDto {
  id: string;
  detectedAt: string;
  confirmedLocation: LatLng | null;
  address: string | null;
  vehicleName: string | null;
}

export interface AssessmentSummaryDto {
  status: AssessmentStatus;
  level: 1 | 2 | 3 | null;
  predictionStatus: PredictionStatus | null;
}

export interface LatestResponse {
  event: EventDto | null;
  assessment?: AssessmentSummaryDto | null;
  dataPeriod: DataPeriodDto | null;
}

export interface DetailAssessmentDto extends AssessmentDto {
  stats: (AssessmentStats & { peak?: StatsPeak | null }) | null;
}

export interface ParkingEventDetailResponse {
  event: EventDto;
  assessment: DetailAssessmentDto;
}

export interface ParkingEventListItem {
  event: { id: string; detectedAt: string; address: string | null };
  assessment: {
    status: AssessmentStatus;
    level: 1 | 2 | 3 | null;
    predictionStatus: PredictionStatus | null;
    primaryZoneType: string | null;
    distanceM: number | null;
    referenceFineAmount: number | null;
    topPercent: number | null;
  };
}

export interface ParkingEventListResponse {
  items: ParkingEventListItem[];
}

// ── 5. 주변 주차장·지도

export interface ParkingLotDto {
  id: string;
  name: string;
  address: string | null;
  distanceM: number;
  location: LatLng;
  parkingType: 'PUBLIC' | 'PRIVATE' | 'ATTACHED' | string | null;
  feeType: 'FREE' | 'PAID' | 'MIXED' | null;
  feeInfo: string | null;
  operatingHours: string | null;
  capacity: number | null;
}

export interface ParkingLotsResponse {
  radiusM: number;
  expanded: boolean;
  items: ParkingLotDto[];
}

export interface RiskZonesResponse {
  dataPeriod: DataPeriodDto | null;
  slot: { weekday: number; timeSlot: number } | null;
  facilityZones: { zoneType: string; location: LatLng; radiusM: number }[];
  cells: { location: LatLng; sizeM: number; topPercent: number; reportCount: number }[];
}

export interface HealthResponse {
  status: string;
}
