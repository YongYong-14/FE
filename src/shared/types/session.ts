export interface DemoUser {
  id: string;
  nickname: string;
}

export type DeviceKind = 'car-audio' | 'earphone' | 'speaker';

export interface RegisteredVehicle {
  id: string;
  name: string;
  kind?: DeviceKind;
}

/** 데모 권한 상태. 실제 OS 권한과 구분한다. */
export type LocationPermission = 'unset' | 'denied' | 'foreground' | 'always';
export type BluetoothPermission = 'unset' | 'denied' | 'granted';

export interface DemoDeviceState {
  locationPermission: LocationPermission;
  bluetoothPermission: BluetoothPermission;
  bluetoothEnabled: boolean;
  /** 등록 차량과의 현재 연결 여부. 등록 여부와 별개다. */
  vehicleConnected: boolean;
}

export interface SessionSnapshot {
  version: 1;
  user: DemoUser | null;
  vehicle: RegisteredVehicle | null;
  onboardingCompleted: boolean;
  surveyEnabled: boolean;
  device: DemoDeviceState;
}

export function createInitialDevice(): DemoDeviceState {
  return {
    locationPermission: 'unset',
    bluetoothPermission: 'unset',
    bluetoothEnabled: true,
    vehicleConnected: true,
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
  };
}

/** 주차 감지에 필요한 데모 권한이 모두 갖춰졌는지. */
export function hasDetectionPermissions(device: DemoDeviceState): boolean {
  return device.locationPermission === 'always' && device.bluetoothPermission === 'granted';
}
