import AsyncStorage from '@react-native-async-storage/async-storage';

import { noRiskFoundCopy, type ParkingRecord } from '@/shared/types/parking';

import { storageGeneration, storageKeys } from './keys';
import { withCrosswalkDecision } from '@/shared/utils/crosswalk';

/** 예전 기록의 "1단계 소화전 주변"·"2단계 신고 다발 구역" 배지를 지금 문구로 바꾼다. */
function currentBadge(badge: string): string {
  // 저장 형식이 다른 오래된 기록은 그대로 둔다.
  if (typeof badge !== 'string') return badge;
  const legacy = /^1단계 (.+) 주변$/.exec(badge);
  if (legacy) return legacy[1] === '금지 시설' ? '주정차 금지 구역' : `${legacy[1]} 주변 금지 구역`;
  return badge.replace(/^2단계 /, '');
}

// 주차 기록 저장 모듈(최소 구현).
// 기록 화면 담당(팀원2)이 필터·조회를 확장할 수 있도록 공개 함수만 제공한다.

function isRecord(value: unknown): value is ParkingRecord {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.parkedAt === 'string' &&
    typeof item.status === 'string' &&
    typeof item.place === 'object' &&
    typeof item.report === 'object' &&
    item.report !== null
  );
}

export async function listRecords(): Promise<ParkingRecord[]> {
  const raw = await AsyncStorage.getItem(storageKeys.records);
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('기록을 읽지 못했어요.');
  return (
    value
      .filter(isRecord)
      .filter((item) => !('isExampleData' in item.report && item.report.isExampleData === true))
      .map(withCrosswalkDecision)
      // 이전에 저장한 기록도 화면에서 같은 최신 문구를 쓴다.
      .map((record) =>
        record.report.status === 'no-risk-found'
          ? { ...record, report: { ...record.report, ...noRiskFoundCopy } }
          : { ...record, report: { ...record.report, badge: currentBadge(record.report.badge) } },
      )
      .sort((a, b) => Date.parse(b.parkedAt) - Date.parse(a.parkedAt))
  );
}

let queue: Promise<unknown> = Promise.resolve();

/** 읽기-수정-쓰기를 순서대로 처리하고, 초기화 이후이거나 shouldWrite가 거짓이면 쓰지 않는다. */
function update(
  change: (current: ParkingRecord[]) => ParkingRecord[],
  shouldWrite: () => boolean = () => true,
): Promise<ParkingRecord[] | null> {
  const startedIn = storageGeneration();
  const task = queue.then(async () => {
    const next = change(await listRecords());
    if (startedIn !== storageGeneration() || !shouldWrite()) return null;
    await AsyncStorage.setItem(storageKeys.records, JSON.stringify(next));
    return next;
  });
  queue = task.catch(() => undefined);
  return task;
}

/**
 * 같은 id면 갱신(원래 위치·주차 시각 유지), 없으면 추가한다.
 * 쓰지 않고 건너뛰면 null을 돌려준다.
 */
export function upsertRecord(
  record: ParkingRecord,
  shouldWrite?: () => boolean,
): Promise<ParkingRecord[] | null> {
  return update((current) => {
    record = withCrosswalkDecision(record);
    const existing = current.find((item) => item.id === record.id);
    return existing
      ? current.map((item) =>
          item.id === record.id
            ? { ...record, place: existing.place, parkedAt: existing.parkedAt }
            : item,
        )
      : [record, ...current];
  }, shouldWrite);
}

/**
 * 저장된 기록 전체를 바꾼다. 변경 함수는 쓰기 직전의 최신 기록을 받으므로
 * 서버 목록 병합 중에 새로 저장된 기록이 사라지지 않는다.
 */
export function replaceRecords(
  change: (current: ParkingRecord[]) => ParkingRecord[],
  shouldWrite?: () => boolean,
): Promise<ParkingRecord[] | null> {
  return update(change, shouldWrite);
}

export function removeRecord(id: string): Promise<ParkingRecord[] | null> {
  return update((current) => current.filter((item) => item.id !== id));
}
