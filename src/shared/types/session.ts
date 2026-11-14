export interface SessionUser {
  id: string;
  nickname: string;
  email?: string | null;
  profileImageUrl?: string | null;
}

/** 서버가 동의 이력을 관리하는 약관 유형. */
export type AgreementType = 'TERMS' | 'PRIVACY' | 'LOCATION_SERVICE';

export const requiredAgreements: readonly AgreementType[] = [
  'TERMS',
  'PRIVACY',
  'LOCATION_SERVICE',
];

export type DeviceKind = 'car-audio' | 'earphone' | 'speaker';

/** 휴대폰과 페어링된 블루투스 기기. 기기 목록은 앱(OS)이 읽고 서버로 보내지 않는다. */
export interface PairedDevice {
  /** 블루투스 MAC 주소. 예: AA:BB:CC:DD:EE:FF */
  address: string;
  name: string;
  kind?: DeviceKind;
}

export interface RegisteredVehicle {
  /** 서버 차량 id(UUID). */
  id: string;
  name: string;
  /** 이전 버전 저장값에는 없을 수 있다. */
  bluetoothAddress?: string;
  kind?: DeviceKind;
}

/** 기기에서 확인한 권한·연결 상태. */
export type LocationPermission = 'unset' | 'denied' | 'foreground' | 'always';
export type BluetoothPermission = 'unset' | 'denied' | 'granted';

export interface DeviceState {
  locationPermission: LocationPermission;
  bluetoothPermission: BluetoothPermission;
  bluetoothEnabled: boolean;
  /** 등록 차량과의 현재 연결 여부. 등록 여부와 별개다. */
  vehicleConnected: boolean;
  /** 실제 OS 연결 상태를 확인했는지. false면 연결됨/해제됨으로 단정하지 않는다. */
  vehicleConnectionKnown?: boolean;
}

export interface SessionSnapshot {
  version: 1;
  user: SessionUser | null;
  vehicle: RegisteredVehicle | null;
  onboardingCompleted: boolean;
  surveyEnabled: boolean;
  device: DeviceState;
  /** 아직 동의하지 않은 필수 약관. 이전 버전 저장값에는 없다. */
  missingAgreements?: AgreementType[];
  /** 기기에 남은 차량·기록의 주인. 다른 계정으로 로그인하면 비운다. */
  ownerId?: string | null;
}

export function createInitialDevice(): DeviceState {
  return {
    locationPermission: 'unset',
    bluetoothPermission: 'unset',
    bluetoothEnabled: false,
    vehicleConnected: false,
    vehicleConnectionKnown: false,
  };
}

export function createInitialSession(): SessionSnapshot {
  return {
    version: 1,
    user: null,
    vehicle: null,
    onboardingCompleted: false,
    surveyEnabled: true,
    device: createInitialDevice(),
    missingAgreements: [],
    ownerId: null,
  };
}

/** 주차 감지에 필요한 권한이 모두 갖춰졌는지. */
export function hasDetectionPermissions(device: DeviceState): boolean {
  return device.locationPermission === 'always' && device.bluetoothPermission === 'granted';
}

export function missingAgreementsOf(snapshot: SessionSnapshot): AgreementType[] {
  return snapshot.missingAgreements ?? [];
}

/** 차량 등록을 마쳐 홈으로 들어갈 수 있는지. 등록을 건너뛰는 경로는 없다. */
export function hasVehicleEntryAccess(snapshot: SessionSnapshot): boolean {
  return Boolean(snapshot.vehicle);
}
