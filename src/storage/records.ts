import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ParkingRecord } from '@/shared/types/parking';

import { storageKeys } from './keys';

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
    typeof item.report === 'object'
  );
}

export async function listRecords(): Promise<ParkingRecord[]> {
  const raw = await AsyncStorage.getItem(storageKeys.records);
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('기록을 읽지 못했어요.');
  return value.filter(isRecord).sort((a, b) => Date.parse(b.parkedAt) - Date.parse(a.parkedAt));
}

/** 같은 id면 갱신(원래 위치·주차 시각 유지), 없으면 추가한다. */
export async function upsertRecord(record: ParkingRecord): Promise<ParkingRecord[]> {
  const current = await listRecords();
  const existing = current.find((item) => item.id === record.id);
  const next = existing
    ? current.map((item) =>
        item.id === record.id
          ? { ...record, place: existing.place, parkedAt: existing.parkedAt }
          : item,
      )
    : [record, ...current];
  await AsyncStorage.setItem(storageKeys.records, JSON.stringify(next));
  return next;
}
