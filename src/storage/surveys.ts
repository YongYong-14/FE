import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from './keys';

// 사후 설문 보관: 리포트를 확인한 주차와 주차별 응답·건너뛰기. 재실행·재로그인 후에도 유지한다.

export type SurveyAnswer = 'enforced' | 'not-enforced' | 'not-sure';

export interface SurveyEntry {
  answer?: SurveyAnswer;
  skipped?: boolean;
  at: string;
}

export interface SurveyStore {
  viewedReports: string[];
  entries: Record<string, SurveyEntry>;
}

const empty = (): SurveyStore => ({ viewedReports: [], entries: {} });
let queue: Promise<unknown> = Promise.resolve();

export async function loadSurveyStore(): Promise<SurveyStore> {
  const raw = await AsyncStorage.getItem(storageKeys.surveys);
  if (raw === null) return empty();
  const value = JSON.parse(raw) as Partial<SurveyStore>;
  return {
    viewedReports: Array.isArray(value.viewedReports) ? value.viewedReports : [],
    entries: typeof value.entries === 'object' && value.entries !== null ? value.entries : {},
  };
}

/** 읽기-수정-쓰기를 순서대로 처리해 동시 저장으로 값이 사라지지 않게 한다. */
function update(change: (store: SurveyStore) => SurveyStore): Promise<SurveyStore> {
  const task = queue.then(async () => {
    const next = change(await loadSurveyStore());
    await AsyncStorage.setItem(storageKeys.surveys, JSON.stringify(next));
    return next;
  });
  queue = task.catch(() => undefined);
  return task;
}

export function markReportViewed(recordId: string) {
  return update((store) =>
    store.viewedReports.includes(recordId)
      ? store
      : { ...store, viewedReports: [...store.viewedReports, recordId] },
  );
}

export function saveSurveyEntry(recordId: string, entry: Omit<SurveyEntry, 'at'>) {
  return update((store) => ({
    ...store,
    entries: { ...store.entries, [recordId]: { ...entry, at: new Date().toISOString() } },
  }));
}
