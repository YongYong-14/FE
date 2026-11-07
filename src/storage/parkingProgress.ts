import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageGeneration, storageKeys } from './keys';

// 진행 중 주차 상태의 읽기·쓰기 도구. 형식 검증은 주차 기능이 담당한다.

export async function loadParkingProgressRaw(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(storageKeys.parkingProgress);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}

export async function saveParkingProgressRaw(
  value: unknown,
  generation = storageGeneration(),
): Promise<void> {
  if (generation !== storageGeneration()) return;
  if (value === null) {
    await AsyncStorage.removeItem(storageKeys.parkingProgress);
    return;
  }
  await AsyncStorage.setItem(storageKeys.parkingProgress, JSON.stringify(value));
}
