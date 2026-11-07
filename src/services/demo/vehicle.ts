import type { VehicleService } from '../contracts';
import { demoVehicles } from '../fixtures/vehicles';

export const demoVehicleService: VehicleService = {
  async listVehicles() {
    return demoVehicles.map((vehicle) => ({ ...vehicle }));
  },
};
