import type { AnalysisReport, CrosswalkAnswer } from '@/shared/types/parking';

/** 분석 요청 자체가 실패했을 때 저장하는 결과. 위치·주차 시각은 유지한다. */
export function createFailedReport(answer: CrosswalkAnswer | null): AnalysisReport {
  return {
    status: 'failed',
    badge: '분석 실패',
    headline: '분석을 마치지 못했어요',
    summary: '분석 중 문제가 생겼어요. 위치와 주차 시각은 그대로 두고 다시 분석할 수 있어요.',
    evidence: crosswalkEvidence(answer),
    stats: [],
    unavailable: [],
    isExampleData: true,
  };
}

const CROSSWALK_LABEL = '횡단보도 10m 이내 (직접 응답)';

function crosswalkEvidence(answer: CrosswalkAnswer | null) {
  return answer ? [{ label: CROSSWALK_LABEL, value: answer === 'yes' ? '예' : '아니요' }] : [];
}

/** 앱에서만 받은 횡단보도 응답을 서버 리포트 근거에 붙인다(이미 있으면 그대로). */
export function withCrosswalkEvidence(
  report: AnalysisReport,
  answer: CrosswalkAnswer | null,
): AnalysisReport {
  if (!answer || report.evidence.some((item) => item.label === CROSSWALK_LABEL)) return report;
  return { ...report, evidence: [...report.evidence, ...crosswalkEvidence(answer)] };
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

/** 예: "11월 2일 토요일 19:04" */
export function formatParkedAt(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}요일 ${hh}:${mm}`;
}

/** 예: "토요일 19:04" */
export function formatParkedShort(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${weekdays[date.getDay()]}요일 ${hh}:${mm}`;
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
