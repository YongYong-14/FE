import type { SelectedPlace } from '@/shared/types/location';
import type {
  ConfirmationMethod,
  CrosswalkAnswer,
  GpsFix,
  ParkingPhase,
  ParkingSubmission,
} from '@/shared/types/parking';

export const LOCATION_TIMER_MS = 15_000;

/** GPS 정확도 기준(명세 8절 #2): 15m 이내 자동 확정, 50m 이하 직접 확정, 50m 초과는 GPS를 쓰지 않는다. */
export const AUTO_CONFIRM_ACCURACY_M = 15;
export const MAX_GPS_ACCURACY_M = 50;
/** 기준점(GPS)에서 확정 위치까지 허용하는 보정 거리. */
export const MAX_ADJUST_DISTANCE_M = 200;
/** 서버가 받는 재측정 횟수 상한. */
export const MAX_REMEASURE_COUNT = 10;

/** 숫자·게이지·만료가 함께 쓰는 하나의 시간 상태. */
export type LocationTimer =
  { mode: 'running'; deadline: number } | { mode: 'paused'; remainingMs: number; pausedAt: number };

interface ProgressBase {
  /** 진행 건 식별자. 취소 후 늦게 온 응답을 버리는 기준이다. */
  runId: string;
  /** 등록 차량 연결 해제 시각 = 주차 시각. */
  disconnectedAt: string;
  /** 다시 측정한 횟수. 이전 버전 저장값에는 없다. */
  remeasureCount?: number;
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
      /** 처음 받은 GPS. 이전 버전 저장값에는 없어 place·accuracyMeters로 대신한다. */
      gps?: GpsFix;
      /** 15m 이내만 시간 만료로 자동 확정한다. 없으면 true(이전 버전). */
      autoConfirm?: boolean;
      /** 지도를 움직여 위치를 보정했는지(ADJUSTED). 저장 형식은 이전 버전과 호환한다. */
      pinAdjusted?: boolean;
      /** 확정을 막은 이유 등 위치 화면 안내. */
      notice?: string;
    })
  | (ProgressBase & {
      phase: 'selecting-location-manually';
      place: SelectedPlace | null;
      reason: string;
      pinAdjusted?: boolean;
      notice?: string;
    })
  | (ProgressBase & {
      phase: 'awaiting-crosswalk-answer';
      place: SelectedPlace;
      gps?: GpsFix | null;
      confirmedAt?: string;
      confirmationMethod?: ConfirmationMethod;
    })
  | (ProgressBase & {
      phase: 'analyzing';
      place: SelectedPlace;
      crosswalkAnswer: CrosswalkAnswer;
      /** 서버에 보낼 제출값. 재시도해도 같은 값(같은 clientEventId)을 보낸다. */
      submission?: ParkingSubmission;
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

/** 위치 확인 단계의 GPS. 이전 버전 저장값이면 표시 위치를 쓴다. */
export function gpsOf(progress: ProgressOf<'confirming-location'>): GpsFix {
  return (
    progress.gps ?? {
      coordinate: progress.place.coordinate,
      accuracyMeters: progress.accuracyMeters,
    }
  );
}
