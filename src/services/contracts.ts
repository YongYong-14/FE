import type { DemoUser, RegisteredVehicle } from '@/shared/types/session';

export interface AccountService {
  signIn(): Promise<DemoUser>;
}

export interface VehicleService {
  listVehicles(): Promise<RegisteredVehicle[]>;
}
