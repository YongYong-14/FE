import type { MapService, ParkingLotService } from '../contracts';
import { demoCurrentLocation, demoParkingLots, demoRiskAreas } from '../fixtures/mapData';
import { demoControl, wait } from './scenario';

export const demoMapService: MapService = {
  async listRiskAreas() {
    await wait(200);
    return demoRiskAreas.map((area) => ({ ...area }));
  },
  currentLocation() {
    return demoCurrentLocation;
  },
};

export const demoParkingLotService: ParkingLotService = {
  async search(radiusMeters) {
    await wait(450);
    const mode = demoControl.get().parkingLots;
    if (mode === 'none') return [];
    return demoParkingLots
      .filter((lot) => lot.distanceMeters <= radiusMeters)
      .filter((lot) => mode !== 'far-only' || lot.distanceMeters > 500)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .map((lot) => ({ ...lot }));
  },
};
