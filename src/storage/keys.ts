import AsyncStorage from '@react-native-async-storage/async-storage';

/** 앱이 소유한 저장 키. 초기화·탈퇴는 이 목록만 지운다. */
export const storageKeys = {
  session: '@seulkkamalkka/session:v1',
  parkingProgress: '@seulkkamalkka/parking-progress:v1',
  records: '@seulkkamalkka/records:v1',
} as const;

export async function clearAppOwnedStorage(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(storageKeys));
}
