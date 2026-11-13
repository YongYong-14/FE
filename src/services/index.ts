// 앱은 서버 API와 실제 기기 기능만 사용한다.
export {
  apiAccountService as accountService,
  apiAnalysisService as analysisService,
  apiMapService as mapService,
  apiParkingLotService as parkingLotService,
  apiRecordService as recordService,
  apiSystemService as systemService,
  apiVehicleService as vehicleService,
} from './api/services';
export {
  isNativeDeviceMode,
  nativeBluetoothDeviceService as bluetoothDeviceService,
} from './device/bluetooth';
export { nativeLocationService as locationService } from './device/location';
export { kakaoPlaceService as placeService } from './api/places';
export { ApiError, describeError, isAbortError, isApiError } from './api/errors';
export type { AnalysisInput, AnalysisOutcome, LocateResult } from './contracts';
