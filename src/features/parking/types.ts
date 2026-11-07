import type { SelectedPlace } from '@/shared/types/location';
import type { CrosswalkAnswer, ParkingPhase } from '@/shared/types/parking';

export const LOCATION_TIMER_MS = 15_000;

/** 숫자·게이지·만료가 함께 쓰는 하나의 시간 상태. */
export type LocationTimer =
  { mode: 'running'; deadline: number } | { mode: 'paused'; remainingMs: number; pausedAt: number };

interface ProgressBase {
  /** 진행 건 식별자. 취소 후 늦게 온 응답을 버리는 기준이다. */
  runId: string;
  /** 등록 차량 연결 해제 시각 = 주차 시각. */
  disconnectedAt: string;
}

export type ParkingProgress =
  | (ProgressBase & { phase: 'suspected' })
  | (ProgressBase & { phase: 'locating' })
  | (ProgressBase & { phase: 'outside-region'; place: SelectedPlace })
  | (ProgressBase & {
      phase: 'confirming-location';
      place: SelectedPlace;
      accuracyMeters: number;
      timer: LocationTimer;
    })
  | (ProgressBase & {
      phase: 'selecting-location-manually';
      place: SelectedPlace | null;
      reason: string;
    })
  | (ProgressBase & { phase: 'awaiting-crosswalk-answer'; place: SelectedPlace })
  | (ProgressBase & {
      phase: 'analyzing';
      place: SelectedPlace;
      crosswalkAnswer: CrosswalkAnswer;
    });

export type ProgressOf<P extends ParkingPhase> = Extract<ParkingProgress, { phase: P }>;

const phases: readonly ParkingPhase[] = [
  'suspected',
  'locating',
  'outside-region',
  'confirming-location',
  'selecting-location-manually',
  'awaiting-crosswalk-answer',
  'analyzing',
];

/** 저장값 최소 검증. 형식이 맞지 않으면 복원하지 않는다. */
export function parseProgress(value: unknown): ParkingProgress | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.runId !== 'string' ||
    typeof item.disconnectedAt !== 'string' ||
    !phases.includes(item.phase as ParkingPhase)
  ) {
    return null;
  }
  const needsPlace = [
    'outside-region',
    'confirming-location',
    'awaiting-crosswalk-answer',
    'analyzing',
  ];
  if (needsPlace.includes(item.phase as string) && typeof item.place !== 'object') return null;
  if (item.phase === 'confirming-location' && typeof item.timer !== 'object') return null;
  return value as ParkingProgress;
}
