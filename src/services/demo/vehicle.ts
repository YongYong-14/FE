import type { VehicleService } from '../contracts';
import { demoVehicles } from '../fixtures/vehicles';
import { demoControl, wait } from './scenario';

export const demoVehicleService: VehicleService = {
  async listVehicles() {
    await wait(600);
    const mode = demoControl.consume('vehicleList', 'normal');
    if (mode === 'fail-once') throw new Error('기기 목록을 불러오지 못했어요.');
    if (mode === 'empty') return [];
    return demoVehicles.map((vehicle) => ({ ...vehicle }));
  },
  async register(vehicle) {
    await wait(700);
    if (demoControl.consume('vehicleRegister', 'success') === 'fail-once') {
      throw new Error('차량을 등록하지 못했어요.');
    }
    return { ...vehicle };
  },
};
