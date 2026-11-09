import type { BluetoothDeviceService, VehicleService } from '../contracts';
import { demoPairedDevices } from '../fixtures/vehicles';
import { demoControl, wait } from './scenario';

/** 페어링된 블루투스 기기(데모). 실제 앱에서는 OS 블루투스 API로 읽는다. */
export const demoBluetoothDeviceService: BluetoothDeviceService = {
  async listPairedDevices() {
    await wait(600);
    const mode = demoControl.consume('vehicleList', 'normal');
    if (mode === 'fail-once') throw new Error('기기 목록을 불러오지 못했어요.');
    if (mode === 'empty') return [];
    return demoPairedDevices.map((device) => ({ ...device }));
  },
};

export const demoVehicleService: VehicleService = {
  // 데모 차량은 기기 저장값에만 있다(서버 연결 시에만 호출한다).
  async getVehicle() {
    return null;
  },
  async register(device) {
    await wait(700);
    if (demoControl.consume('vehicleRegister', 'success') === 'fail-once') {
      throw new Error('차량을 등록하지 못했어요.');
    }
    return {
      id: `demo-${device.address.replace(/:/g, '').toLowerCase()}`,
      name: device.name,
      bluetoothAddress: device.address,
      kind: device.kind,
    };
  },
};
