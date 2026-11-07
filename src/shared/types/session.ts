export interface DemoUser {
  id: string;
  nickname: string;
}

export interface RegisteredVehicle {
  id: string;
  name: string;
}

export interface SessionSnapshot {
  version: 1;
  user: DemoUser | null;
  vehicle: RegisteredVehicle | null;
  onboardingCompleted: boolean;
  surveyEnabled: boolean;
}

export function createInitialSession(): SessionSnapshot {
  return {
    version: 1,
    user: null,
    vehicle: null,
    onboardingCompleted: false,
    surveyEnabled: true,
  };
}
