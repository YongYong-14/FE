import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from './keys';

// 서비스 토큰 보관. 운영 전에는 OS 보호 저장소(expo-secure-store 등)로 옮긴다(새 개발 빌드 필요).

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** 액세스 토큰 만료 시각(ms). */
  accessExpiresAt: number;
}

function isTokens(value: unknown): value is StoredTokens {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.accessToken === 'string' &&
    typeof item.refreshToken === 'string' &&
    typeof item.accessExpiresAt === 'number'
  );
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const raw = await AsyncStorage.getItem(storageKeys.authTokens);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isTokens(value) ? value : null;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await AsyncStorage.setItem(storageKeys.authTokens, JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.removeItem(storageKeys.authTokens);
}
