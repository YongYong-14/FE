import AsyncStorage from '@react-native-async-storage/async-storage';

/** 앱이 소유한 저장 키. 초기화·탈퇴는 이 목록만 지운다. */
export const storageKeys = {
  session: '@seulkkamalkka/session:v1',
  parkingProgress: '@seulkkamalkka/parking-progress:v1',
  records: '@seulkkamalkka/records:v1',
  surveys: '@seulkkamalkka/surveys:v1',
  authTokens: '@seulkkamalkka/auth-tokens:v1',
  // 이전 버전의 알림 표시 기록도 탈퇴·계정 변경 시 정리한다.
  legacyAlerts: '@seulkkamalkka/shown-alerts:v1',
} as const;

let generation = 0;

/** 초기화·탈퇴마다 증가. 그 전에 시작된 늦은 쓰기를 버리는 기준이다. */
export function storageGeneration(): number {
  return generation;
}

export async function clearAppOwnedStorage(): Promise<void> {
  generation += 1;
  await AsyncStorage.multiRemove(Object.values(storageKeys));
}
