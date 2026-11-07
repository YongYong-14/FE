import type { SelectedPlace } from './location';

// 프론트 내부 연결용 자료형이다. 실제 API 계약이 아니다.

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
  /** 0~1 상대 높이. 3시간 단위 8칸. */
  bars: number[];
  peakIndex: number;
  peakLabel: string;
}

export interface AnalysisReport {
  status: AnalysisStatus;
  /** 배지 문구. 예: "1단계 · 절대금지구역" */
  badge: string;
  headline: string;
  summary?: string;
  evidence: ReportEvidence[];
  stats: ReportStat[];
  chart?: ReportChart;
  /** 제공되지 않은 항목(정보 부족 설명용). */
  unavailable: string[];
  /** 지도 위 위험 반경 표기. 예시 값이다. */
  zoneLabel?: string;
  isExampleData: boolean;
}

export interface ParkingRecord {
  id: string;
  parkedAt: string;
  place: SelectedPlace;
  crosswalkAnswer: CrosswalkAnswer;
  status: AnalysisStatus;
  report: AnalysisReport;
  updatedAt: string;
}

/** 기존 호출부 호환용 요약 자료형. */
export type ParkingRecordSummary = Pick<
  ParkingRecord,
  'id' | 'parkedAt' | 'place' | 'crosswalkAnswer' | 'status'
>;

export const analysisStatusLabel: Record<AnalysisStatus, string> = {
  'level-1': '1단계',
  'level-2': '2단계',
  'no-risk-found': '확인된 위험 없음',
  'insufficient-data': '정보 부족',
  failed: '분석 실패',
};
