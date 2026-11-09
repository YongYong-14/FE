import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createInitialDevice,
  createInitialSession,
  requiredAgreements,
  type AgreementType,
  type DemoDeviceState,
  type SessionSnapshot,
} from '@/shared/types/session';

import { storageKeys } from './keys';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNamedId(value: unknown): boolean {
  return isObject(value) && typeof value.id === 'string' && value.id.length > 0;
}

const locationValues = ['unset', 'denied', 'foreground', 'always'];
const bluetoothValues = ['unset', 'denied', 'granted'];

/** 이전 버전 저장값에는 device가 없으므로 기본값으로 채운다. */
function parseDevice(value: unknown): DemoDeviceState {
  const fallback = createInitialDevice();
  if (!isObject(value)) return fallback;
  return {
    locationPermission: locationValues.includes(value.locationPermission as string)
      ? (value.locationPermission as DemoDeviceState['locationPermission'])
      : fallback.locationPermission,
    bluetoothPermission: bluetoothValues.includes(value.bluetoothPermission as string)
      ? (value.bluetoothPermission as DemoDeviceState['bluetoothPermission'])
      : fallback.bluetoothPermission,
    bluetoothEnabled:
      typeof value.bluetoothEnabled === 'boolean'
        ? value.bluetoothEnabled
        : fallback.bluetoothEnabled,
    vehicleConnected:
      typeof value.vehicleConnected === 'boolean'
        ? value.vehicleConnected
        : fallback.vehicleConnected,
  };
}

export function parseSession(raw: string | null): SessionSnapshot {
  if (raw === null) return createInitialSession();
  const value: unknown = JSON.parse(raw);

  if (
    !isObject(value) ||
    value.version !== 1 ||
    typeof value.onboardingCompleted !== 'boolean' ||
    typeof value.surveyEnabled !== 'boolean' ||
    (value.user !== null &&
      (!hasNamedId(value.user) ||
        !isObject(value.user) ||
        typeof value.user.nickname !== 'string')) ||
    (value.vehicle !== null &&
      (!hasNamedId(value.vehicle) ||
        !isObject(value.vehicle) ||
        typeof value.vehicle.name !== 'string'))
  ) {
    throw new Error('저장된 정보를 읽지 못했어요. 다시 시도해 주세요.');
  }

  return {
    ...(value as unknown as Omit<SessionSnapshot, 'device'>),
    device: parseDevice(value.device),
    missingAgreements: Array.isArray(value.missingAgreements)
      ? value.missingAgreements.filter((type): type is AgreementType =>
          requiredAgreements.includes(type as AgreementType),
        )
      : [],
    ownerId: typeof value.ownerId === 'string' ? value.ownerId : null,
  };
}

export async function loadSession(): Promise<SessionSnapshot> {
  return parseSession(await AsyncStorage.getItem(storageKeys.session));
}

export async function saveSession(snapshot: SessionSnapshot): Promise<void> {
  await AsyncStorage.setItem(storageKeys.session, JSON.stringify(snapshot));
}
