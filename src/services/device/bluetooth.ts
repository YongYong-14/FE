import { requireOptionalNativeModule, type EventSubscription } from 'expo';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

import type { BluetoothDeviceService } from '../contracts';
import type { PairedDevice } from '@/shared/types/session';

export const isNativeDeviceMode = Platform.OS === 'android';

export interface VehicleConnectionEvent {
  id: string;
  address: string;
  connected: boolean;
  at: number;
  lastConnectedAt?: number;
}

export interface BluetoothSnapshot {
  supported: boolean;
  enabled: boolean;
  connected: boolean | null;
  address: string | null;
  event: VehicleConnectionEvent | null;
  lastConnectedAt?: number;
}

interface BluetoothModule {
  getParkingFix(
    at: number,
  ): Promise<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null>;
  listPairedDevices(): Promise<PairedDevice[]>;
  track(address: string | null, key: string | null): Promise<void>;
  getSnapshot(): Promise<BluetoothSnapshot>;
  refreshConnection(): Promise<BluetoothSnapshot>;
  acknowledge(id: string): Promise<void>;
  openBluetoothSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  addListener(name: 'onChange', listener: () => void): EventSubscription;
}

function native(): BluetoothModule {
  const module = requireOptionalNativeModule<BluetoothModule>('VehicleBluetooth');
  if (!module) throw new Error('블루투스 모듈이 포함된 Android 앱을 다시 빌드해 설치해 주세요.');
  return module;
}

export const nativeBluetooth = {
  async permission(): Promise<'unset' | 'denied' | 'granted'> {
    if (Number(Platform.Version) < 31) return 'granted';
    return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT))
      ? 'granted'
      : 'denied';
  },
  async requestPermission() {
    if (Number(Platform.Version) < 31) return 'granted' as const;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED
      ? ('granted' as const)
      : ('denied' as const);
  },
  track: (address: string | null, key: string | null) => native().track(address, key),
  snapshot: () => native().getSnapshot(),
  refresh: () => native().refreshConnection(),
  acknowledge: (id: string) => native().acknowledge(id),
  parkingFix: (at: number) => native().getParkingFix(at),
  subscribe: (listener: () => void) => native().addListener('onChange', listener),
  openSettings: () => native().openBluetoothSettings(),
  openBatterySettings: () => native().openBatterySettings(),
  openAppSettings: () => Linking.openSettings(),
};

export const nativeBluetoothDeviceService: BluetoothDeviceService = {
  async listPairedDevices() {
    if ((await nativeBluetooth.permission()) !== 'granted') {
      throw new Error('기기 목록을 보려면 설정에서 근처 기기 권한을 허용해 주세요.');
    }
    try {
      return await native().listPairedDevices();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('BLUETOOTH_DISABLED')) throw new Error('휴대폰의 블루투스를 켜 주세요.');
      if (message.includes('BLUETOOTH_UNAVAILABLE'))
        throw new Error('블루투스를 지원하지 않는 기기예요.');
      throw error;
    }
  },
};
