import type { ParkingRecord } from '@/shared/types/parking';

import { withCrosswalkDecision } from '@/shared/utils/crosswalk';

// 서버 기록과 기기에 남은 기록(캐시)의 병합. 서버가 기록의 존재·판정의 기준이고,
// 횡단보도 응답·원래 제출값 등 앱에서만 아는 정보는 기기 기록에서 이어 쓴다.

const PLACEHOLDER_ADDRESS = '주소 확인 중';

export function mergeRecord(remote: ParkingRecord, cached?: ParkingRecord): ParkingRecord {
  if (!cached) return withCrosswalkDecision(remote);
  const sameStatus =
    (cached.serverReport?.status ?? cached.status) ===
    (remote.serverReport?.status ?? remote.status);
  // 요약(목록) 응답이면 같은 판정의 더 완성된 기기 리포트를 유지한다.
  const keepCachedReport =
    !remote.detailed && sameStatus && Boolean(cached.detailed || cached.submission);
  const crosswalkAnswer = remote.crosswalkAnswer ?? cached.crosswalkAnswer;
  const report = keepCachedReport
    ? (cached.serverReport ?? cached.report)
    : (remote.serverReport ?? remote.report);
  return withCrosswalkDecision({
    ...remote,
    place: {
      ...cached.place,
      address:
        remote.place.address !== PLACEHOLDER_ADDRESS ? remote.place.address : cached.place.address,
      coordinate: remote.place.coordinate ?? cached.place.coordinate,
    },
    crosswalkAnswer,
    report,
    serverReport: undefined,
    submission: cached.submission,
    retryable: keepCachedReport ? cached.retryable : remote.retryable,
    detailed: Boolean(remote.detailed || (keepCachedReport && cached.detailed)),
    vehicleName: remote.vehicleName ?? cached.vehicleName,
    updatedAt:
      Date.parse(cached.updatedAt) > Date.parse(remote.updatedAt)
        ? cached.updatedAt
        : remote.updatedAt,
  });
}

/** 서버 단계 필터에 기기에만 보관된 횡단보도 응답을 반영한다. */
export function mergeRecordsForLevel(
  remote: ParkingRecord[],
  cached: ParkingRecord[],
  level: 1 | 2,
): ParkingRecord[] {
  const local = cached.map(withCrosswalkDecision);
  const byId = new Map(local.map((record) => [record.id, record]));
  const combined = new Map(byId);
  for (const record of remote) {
    const merged = mergeRecord(record, byId.get(record.id));
    combined.set(merged.id, merged);
  }
  return [...combined.values()]
    .filter((record) => record.status === (level === 1 ? 'level-1' : 'level-2'))
    .sort((a, b) => Date.parse(b.parkedAt) - Date.parse(a.parkedAt));
}

/**
 * 서버 목록은 최대 100건짜리 일부 목록이다. 응답에 없다는 이유로 보관 기록을
 * 삭제하지 않고, 같은 id만 최신 서버 결과와 병합한다. 계정 변경·탈퇴는 별도로 정리한다.
 */
export function mergeRemoteRecords(
  remote: ParkingRecord[],
  cached: ParkingRecord[],
): ParkingRecord[] {
  const byId = new Map(cached.map((record) => [record.id, record]));
  for (const record of remote) byId.set(record.id, mergeRecord(record, byId.get(record.id)));
  return [...byId.values()]
    .map(withCrosswalkDecision)
    .sort((a, b) => Date.parse(b.parkedAt) - Date.parse(a.parkedAt));
}

/** 상세 하나를 기기 기록에 반영한다. */
export function upsertMerged(remote: ParkingRecord, cached: ParkingRecord[]): ParkingRecord[] {
  const existing = cached.find((record) => record.id === remote.id);
  const merged = mergeRecord(remote, existing);
  return existing
    ? cached.map((record) => (record.id === remote.id ? merged : record))
    : [merged, ...cached].sort((a, b) => Date.parse(b.parkedAt) - Date.parse(a.parkedAt));
}
