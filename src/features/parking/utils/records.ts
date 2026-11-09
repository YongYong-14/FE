import type { ParkingRecord } from '@/shared/types/parking';

import { withCrosswalkEvidence } from './report';

// 서버 기록과 기기에 남은 기록(캐시)의 병합. 서버가 기록의 존재·판정의 기준이고,
// 횡단보도 응답·원래 제출값 등 앱에서만 아는 정보는 기기 기록에서 이어 쓴다.

const PLACEHOLDER_ADDRESS = '주소 확인 중';

export function mergeRecord(remote: ParkingRecord, cached?: ParkingRecord): ParkingRecord {
  if (!cached) return remote;
  const sameStatus = cached.status === remote.status;
  // 요약(목록) 응답이면 같은 판정의 더 완성된 기기 리포트를 유지한다.
  const keepCachedReport =
    !remote.detailed && sameStatus && Boolean(cached.detailed || cached.submission);
  const crosswalkAnswer = remote.crosswalkAnswer ?? cached.crosswalkAnswer;
  const report = keepCachedReport ? cached.report : remote.report;
  return {
    ...remote,
    place: {
      ...cached.place,
      address:
        remote.place.address !== PLACEHOLDER_ADDRESS ? remote.place.address : cached.place.address,
      coordinate: remote.place.coordinate ?? cached.place.coordinate,
    },
    crosswalkAnswer,
    report: withCrosswalkEvidence(report, crosswalkAnswer),
    submission: cached.submission,
    retryable: keepCachedReport ? cached.retryable : remote.retryable,
    detailed: Boolean(remote.detailed || (keepCachedReport && cached.detailed)),
    vehicleName: remote.vehicleName ?? cached.vehicleName,
    updatedAt:
      Date.parse(cached.updatedAt) > Date.parse(remote.updatedAt)
        ? cached.updatedAt
        : remote.updatedAt,
  };
}

/**
 * 서버 목록으로 기기 기록을 바꾼다. 새로 고침을 시작한 뒤 기기에 저장된 기록은
 * 서버 목록에 아직 없을 수 있으므로 남긴다.
 */
export function mergeRemoteRecords(
  remote: ParkingRecord[],
  cached: ParkingRecord[],
  refreshStartedAt: number,
): ParkingRecord[] {
  const byId = new Map(cached.map((record) => [record.id, record]));
  const remoteIds = new Set(remote.map((record) => record.id));
  const fresh = cached.filter(
    (record) => !remoteIds.has(record.id) && Date.parse(record.updatedAt) >= refreshStartedAt,
  );
  return [...fresh, ...remote.map((record) => mergeRecord(record, byId.get(record.id)))].sort(
    (a, b) => Date.parse(b.parkedAt) - Date.parse(a.parkedAt),
  );
}

/** 상세 하나를 기기 기록에 반영한다. */
export function upsertMerged(remote: ParkingRecord, cached: ParkingRecord[]): ParkingRecord[] {
  const existing = cached.find((record) => record.id === remote.id);
  const merged = mergeRecord(remote, existing);
  return existing
    ? cached.map((record) => (record.id === remote.id ? merged : record))
    : [merged, ...cached].sort((a, b) => Date.parse(b.parkedAt) - Date.parse(a.parkedAt));
}
