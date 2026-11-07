// 실제 SDK/API 연결 시 이 공개 진입점의 구현을 교체한다.
export { demoAccountService as accountService } from './demo/account';
export { demoAnalysisService as analysisService } from './demo/analysis';
export {
  demoLocationService as locationService,
  demoPlaceService as placeService,
} from './demo/location';
export {
  demoMapService as mapService,
  demoParkingLotService as parkingLotService,
} from './demo/map';
export { demoVehicleService as vehicleService } from './demo/vehicle';

// 시연 제어(데모 설정 화면 전용). 실제 연동 경로에서는 제거한다.
export { defaultScenario, demoControl, type DemoScenario } from './demo/scenario';
export type { AnalysisInput, LocateResult } from './contracts';
