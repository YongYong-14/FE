import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageGeneration, storageKeys } from './keys';

// 이미 띄운 위험 알림의 기록 id. 같은 주차 알림을 다시 띄우지 않는 기준이다(명세 4절).

const MAX_IDS = 200;
let queue: Promise<unknown> = Promise.resolve();

export async function loadShownAlerts(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(storageKeys.alerts);
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function markAlertShown(recordId: string): Promise<void> {
  const startedIn = storageGeneration();
  const task = queue.then(async () => {
    const current = await loadShownAlerts();
    if (current.includes(recordId) || startedIn !== storageGeneration()) return;
    const next = [...current, recordId].slice(-MAX_IDS);
    await AsyncStorage.setItem(storageKeys.alerts, JSON.stringify(next));
  });
  queue = task.catch(() => undefined);
  return task;
}
