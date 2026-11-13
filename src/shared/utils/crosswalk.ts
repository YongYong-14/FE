import type { AnalysisReport, CrosswalkAnswer, ParkingRecord } from '@/shared/types/parking';

const CROSSWALK_LABEL = '횡단보도 10m 이내 (직접 응답)';

export function crosswalkEvidence(answer: CrosswalkAnswer | null) {
  return answer ? [{ label: CROSSWALK_LABEL, value: answer === 'yes' ? '예' : '아니요' }] : [];
}

/** '예'는 사용자 제공 근거로 1단계를 적용하며 시설 거리·과태료를 새로 만들지 않는다. */
export function withCrosswalkEvidence(
  report: AnalysisReport,
  answer: CrosswalkAnswer | null,
): AnalysisReport {
  if (!answer) return report;
  const evidence = [
    ...report.evidence.filter((item) => item.label !== CROSSWALK_LABEL),
    ...crosswalkEvidence(answer),
  ];
  if (answer !== 'yes' || (report.status === 'level-1' && report.source !== 'user-crosswalk')) {
    return { ...report, evidence };
  }
  return {
    ...report,
    status: 'level-1',
    source: 'user-crosswalk',
    badge: '1단계 횡단보도 주변',
    headline: '횡단보도 주변이에요',
    summary: '횡단보도 위 또는 10m 이내에 주차했다고 알려주셨어요.',
    evidence,
    // 다른 시설·모델 판정의 과태료와 안내를 횡단보도 근거로 오인하지 않게 한다.
    stats: report.stats.filter((item) => !item.label.includes('과태료')),
    unavailable: [],
    zoneLabel: '횡단보도 주변 (직접 응답)',
    notes: undefined,
  };
}

/** 저장·복원·서버 재조회에서 기록 분류와 리포트 분류를 함께 유지한다. */
export function withCrosswalkDecision(record: ParkingRecord): ParkingRecord {
  const original = record.serverReport ?? record.report;
  const report = withCrosswalkEvidence(original, record.crosswalkAnswer);
  return {
    ...record,
    status: report.status,
    report,
    serverReport: record.crosswalkAnswer === 'yes' ? original : undefined,
  };
}
