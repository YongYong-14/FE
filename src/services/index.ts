// 기능 코드가 쓰는 공개 진입점.
// EXPO_PUBLIC_API_BASE_URL이 있으면 서버 API(services/api), 없으면 데모 응답(services/demo)을 쓴다.
// 블루투스 기기 목록·GPS·장소 검색은 앱(기기·외부 SDK) 기능이라 서버 연결과 무관하게 데모로 남는다.

import { apiConfig } from './api/config';
import {
  apiAccountService,
  apiAnalysisService,
  apiMapService,
  apiNotificationSettingsService,
  apiParkingLotService,
  apiRecordService,
  apiSystemService,
  apiVehicleService,
} from './api/services';
import type {
  AccountService,
  AnalysisService,
  MapService,
  NotificationSettingsService,
  ParkingLotService,
  RecordService,
  SystemService,
  VehicleService,
} from './contracts';
import { demoAccountService } from './demo/account';
import { demoAnalysisService } from './demo/analysis';
import { demoMapService, demoParkingLotService } from './demo/map';
import { demoRecordService } from './demo/records';
import { demoNotificationSettingsService, demoSystemService } from './demo/settings';
import { demoVehicleService } from './demo/vehicle';

export const isApiMode = apiConfig.enabled;

export const accountService: AccountService = isApiMode ? apiAccountService : demoAccountService;
export const vehicleService: VehicleService = isApiMode ? apiVehicleService : demoVehicleService;
export const notificationSettingsService: NotificationSettingsService = isApiMode
  ? apiNotificationSettingsService
  : demoNotificationSettingsService;
export const analysisService: AnalysisService = isApiMode
  ? apiAnalysisService
  : demoAnalysisService;
export const recordService: RecordService = isApiMode ? apiRecordService : demoRecordService;
export const mapService: MapService = isApiMode ? apiMapService : demoMapService;
export const parkingLotService: ParkingLotService = isApiMode
  ? apiParkingLotService
  : demoParkingLotService;
export const systemService: SystemService = isApiMode ? apiSystemService : demoSystemService;

// 기기·외부 SDK 기능(실제 블루투스·GPS·카카오 검색 연동 전까지 데모).
export { demoBluetoothDeviceService as bluetoothDeviceService } from './demo/vehicle';
export {
  demoLocationService as locationService,
  demoPlaceService as placeService,
} from './demo/location';

// 시연 제어(데모 설정 화면 전용). 실제 연동 경로에서는 제거한다.
export { defaultScenario, demoControl, type DemoScenario } from './demo/scenario';

export { ApiError, describeError, isAbortError, isApiError } from './api/errors';
export type {
  AnalysisInput,
  AnalysisOutcome,
  DeliveryResult,
  LocateResult,
  NotificationSettings,
} from './contracts';
