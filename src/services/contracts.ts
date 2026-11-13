import type { Coordinate, SelectedPlace } from '@/shared/types/location';
import type { GeoBounds, ParkingLotSearch, RiskZoneData } from '@/shared/types/map';
import type {
  AnalysisReport,
  AnalysisStatus,
  CrosswalkAnswer,
  LatestParking,
  ParkingRecord,
  ParkingSubmission,
  RecordPlace,
} from '@/shared/types/parking';
import type {
  AgreementType,
  PairedDevice,
  RegisteredVehicle,
  SessionUser,
} from '@/shared/types/session';

// 기능 코드가 사용하는 서버 API·기기 서비스 호출 규격.

export interface SignInResult {
  user: SessionUser;
  isNewUser: boolean;
  missingAgreements: AgreementType[];
}

export interface AccountProfile {
  user: SessionUser;
  hasVehicle: boolean;
  missingAgreements: AgreementType[];
}

export interface AccountService {
  signIn(): Promise<SignInResult>;
  /** 저장된 로그인으로 내 정보·약관 상태를 다시 읽는다. 로그인이 없거나 만료됐으면 null. */
  restore(): Promise<AccountProfile | null>;
  agree(types: AgreementType[]): Promise<void>;
  signOut(): Promise<void>;
  /** 서버 계정 삭제. 성공한 뒤에만 기기 데이터를 지운다. */
  withdraw(): Promise<void>;
  /** 토큰 재발급이 실패해 다시 로그인해야 할 때 알린다. */
  onSessionExpired(listener: () => void): () => void;
}

/** 휴대폰에 페어링된 블루투스 기기 조회(앱·OS 기능). */
export interface BluetoothDeviceService {
  listPairedDevices(): Promise<PairedDevice[]>;
}

export interface VehicleService {
  /** 서버에 등록된 활성 차량. 없으면 null. */
  getVehicle(): Promise<RegisteredVehicle | null>;
  register(device: PairedDevice): Promise<RegisteredVehicle>;
}

export type LocateResult =
  | { kind: 'located'; place: SelectedPlace; accuracyMeters: number }
  | { kind: 'unavailable'; reason: string };

export interface LocationService {
  locate(signal?: AbortSignal, options?: { detectedAt: string }): Promise<LocateResult>;
}

export interface PlaceService {
  search(query: string, signal?: AbortSignal): Promise<SelectedPlace[]>;
}

export interface AnalysisInput {
  place: RecordPlace;
  parkedAt: string;
  crosswalkAnswer: CrosswalkAnswer | null;
  submission: ParkingSubmission;
}

export interface AnalysisOutcome {
  /** 기록 id. 서버 연결 시 parkingEventId. */
  recordId: string;
  status: AnalysisStatus;
  report: AnalysisReport;
  /** 서버가 채운 주소. 역지오코딩 전이면 null. */
  address: string | null;
  /** 같은 요청으로 다시 판정할 수 있는지. */
  retryable: boolean;
}

export interface AnalysisService {
  analyze(input: AnalysisInput, signal?: AbortSignal): Promise<AnalysisOutcome>;
}

export interface RecordService {
  /** 최신순 기록. level을 주면 그 단계만. */
  list(options?: { level?: 1 | 2 }): Promise<ParkingRecord[]>;
  /** 판정 상세. 없으면 null. */
  get(recordId: string): Promise<ParkingRecord | null>;
  latest(): Promise<LatestParking>;
}

export interface MapService {
  /** 지도를 처음 띄울 기준 위치(현재 위치). */
  currentLocation(): Coordinate;
  riskZones(bounds: GeoBounds, at?: string): Promise<RiskZoneData>;
}

export interface ParkingLotService {
  /** 기준 위치 반경 안의 주차장을 직선 거리순으로 돌려준다. */
  search(origin: Coordinate, radiusMeters: number): Promise<ParkingLotSearch>;
}

export interface SystemService {
  mode: 'api';
  /** 서버 연결 시 API 기본 주소. */
  baseUrl: string | null;
  health(): Promise<{ ok: boolean; status: string }>;
}
