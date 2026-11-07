import type { SelectedPlace } from '@/shared/types/location';
import type { MapPoint, ParkingLot, RiskArea } from '@/shared/types/map';
import type { AnalysisReport, CrosswalkAnswer } from '@/shared/types/parking';
import type { DemoUser, RegisteredVehicle } from '@/shared/types/session';

// 기능 코드가 사용하는 내부 호출 규격. 실제 API 계약이 아니다.

export interface AccountService {
  signIn(): Promise<DemoUser>;
}

export interface VehicleService {
  listVehicles(): Promise<RegisteredVehicle[]>;
  register(vehicle: RegisteredVehicle): Promise<RegisteredVehicle>;
}

export type LocateResult =
  | { kind: 'located'; place: SelectedPlace; accuracyMeters: number }
  | { kind: 'unavailable'; reason: string };

export interface LocationService {
  locate(signal?: AbortSignal): Promise<LocateResult>;
}

export interface PlaceService {
  search(query: string): Promise<SelectedPlace[]>;
}

export interface AnalysisInput {
  place: SelectedPlace;
  parkedAt: string;
  crosswalkAnswer: CrosswalkAnswer;
}

export interface AnalysisService {
  analyze(input: AnalysisInput, signal?: AbortSignal): Promise<AnalysisReport>;
}

export interface MapService {
  listRiskAreas(): Promise<RiskArea[]>;
  currentLocation(): MapPoint;
}

export interface ParkingLotService {
  /** 주차 위치 기준 반경 안의 주차장을 거리순으로 돌려준다. */
  search(radiusMeters: number): Promise<ParkingLot[]>;
}
