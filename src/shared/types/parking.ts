import type { Coordinate } from './location';
import type { DataPeriod } from './map';

// 프론트 내부 연결용 자료형이다. 서버 응답은 services/api에서 이 형태로 바꾼다.

export type AnalysisStatus =
  'level-1' | 'level-2' | 'no-risk-found' | 'insufficient-data' | 'failed';

export type CrosswalkAnswer = 'yes' | 'no';

export type ParkingPhase =
  | 'suspected'
  | 'locating'
  | 'outside-region'
  | 'confirming-location'
  | 'selecting-location-manually'
  | 'awaiting-crosswalk-answer'
  | 'analyzing';

/** 위치 확정 방법. CONFIRMED(그대로), ADJUSTED(핀 이동), AUTO(시간 만료 자동 확정). */
export type ConfirmationMethod = 'CONFIRMED' | 'ADJUSTED' | 'AUTO';

/** 기기 GPS 측정값. */
export interface GpsFix {
  coordinate: Coordinate;
  accuracyMeters: number;
}

/**
 * 주차 판정 요청에 쓰는 앱 쪽 제출값. 같은 주차를 다시 보낼 때 그대로 재사용한다(멱등 키 포함).
 * 횡단보도 응답은 앱 안에서만 쓰고 여기에 넣지 않는다.
 */
export interface ParkingSubmission {
  clientEventId: string;
  vehicleId: string;
  /** 블루투스 연결 해제 시각 = 판정 기준 시각. */
  detectedAt: string;
  confirmedAt: string;
  confirmationMethod: ConfirmationMethod;
  /** 기기 GPS. 없으면 null(자동 확정 불가). */
  gps: GpsFix | null;
  confirmed: Coordinate;
  remeasureCount: number;
}

export interface ReportEvidence {
  label: string;
  value: string;
}

export interface ReportStat {
  label: string;
  value: string;
}

export interface ReportChart {
  title: string;
  caption: string;
  /** 아이콘과 함께 나누어 표시한다. 이전 저장 기록은 caption에서 복원한다. */
  weekdayLabel?: string;
  periodLabel?: string;
  /** 0~1 상대 높이. 3시간 단위 8칸. */
  bars: number[];
  peakIndex: number;
  peakLabel: string;
}

export interface AnalysisReport {
  status: AnalysisStatus;
  /** 사용자 횡단보도 응답으로 적용한 1단계는 서버 실측 판정과 구분한다. */
  source?: 'server' | 'user-crosswalk';
  /** 배지 문구. 예: "소화전 주변 금지 구역" */
  badge: string;
  headline: string;
  summary?: string;
  evidence: ReportEvidence[];
  stats: ReportStat[];
  chart?: ReportChart;
  /** 제공되지 않은 항목(판단 불가 설명용). */
  unavailable: string[];
  /** 지도 위 위험 반경 표기. */
  zoneLabel?: string;
  /** 결과 화면 하단의 추가 안내(과태료 단서 등). */
  notes?: string[];
}

/** 기록의 위치. 서버 목록에서만 받은 기록은 좌표가 없을 수 있다. */
export interface RecordPlace {
  id: string;
  name: string;
  address: string;
  coordinate: Coordinate | null;
  isSupportedRegion: boolean;
}

export interface ParkingRecord {
  id: string;
  parkedAt: string;
  place: RecordPlace;
  /** 앱에서만 받은 횡단보도 응답. 다른 기기에서 만든 기록은 null이다. */
  crosswalkAnswer: CrosswalkAnswer | null;
  status: AnalysisStatus;
  report: AnalysisReport;
  /** 직접 응답으로 리포트를 보정하기 전 서버 결과. API 전송값에는 포함하지 않는다. */
  serverReport?: AnalysisReport;
  updatedAt: string;
  /** 같은 주차를 다시 판정할 때 그대로 보내는 원래 제출값. */
  submission?: ParkingSubmission;
  /** 다시 분석할 수 있는지. 없으면 상태로 판단한다. */
  retryable?: boolean;
  /** 서버 상세(GET /parking-events/{id})로 리포트를 채웠는지. */
  detailed?: boolean;
  /** 주차 당시 차량 이름. */
  vehicleName?: string | null;
}

/** 홈의 최근 주차 요약. */
export interface LatestParking {
  record: ParkingRecord | null;
  coordinate: Coordinate | null;
  dataPeriod: DataPeriod | null;
}

/** 3단계 결과의 공통 표시 문구. 저장된 이전 리포트에도 적용한다. */
export const noRiskFoundCopy = {
  badge: '주의 구역 아님',
  headline: '주의 구역이 아니에요',
  summary: '이 위치는 주정차 금지 구역이나 신고 다발 구역에 해당하지 않아요.',
} as const;

export const analysisStatusLabel: Record<AnalysisStatus, string> = {
  'level-1': '금지 구역',
  'level-2': '신고 다발',
  'no-risk-found': noRiskFoundCopy.badge,
  'insufficient-data': '판단 불가',
  failed: '분석 실패',
};
