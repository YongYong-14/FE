import type { AnalysisReport, AnalysisStatus, CrosswalkAnswer } from '@/shared/types/parking';

// 시연용 리포트. 수치·근거는 모두 예시이며 실제 위험 계산·법적 판정이 아니다.

const crosswalkEvidence = (answer: CrosswalkAnswer) => ({
  label: '횡단보도 10m 이내 (직접 응답)',
  value: answer === 'yes' ? '예' : '아니요',
});

export function buildDemoReport(status: AnalysisStatus, answer: CrosswalkAnswer): AnalysisReport {
  switch (status) {
    case 'level-1':
      return {
        status,
        badge: '1단계 · 절대금지구역',
        headline: '소화전 주변이에요',
        evidence: [
          { label: '소화전까지 거리 (예시)', value: '7m' },
          { label: '주정차 금지 거리 (예시)', value: '5m 이내' },
          crosswalkEvidence(answer),
        ],
        stats: [],
        unavailable: [],
        zoneLabel: '금지 구역',
        isExampleData: true,
      };
    case 'level-2':
      return {
        status,
        badge: '2단계 · 신고 다발 구역',
        headline: '신고가 잦은 곳이에요',
        evidence: [
          { label: '신고 분위수 (예시)', value: '상위 8%' },
          { label: '분류 기준 (예시)', value: '상위 10% 이내' },
          crosswalkEvidence(answer),
        ],
        stats: [
          { label: '연간 시민 신고 (예시)', value: '128건' },
          { label: '최근 단속 이력 (예시)', value: '23건' },
        ],
        chart: {
          title: '신고가 몰리는 시간',
          caption: '토요일 · 예시 데이터',
          bars: [0.1, 0.06, 0.09, 0.24, 0.38, 0.52, 1, 0.64],
          peakIndex: 6,
          peakLabel: '18~21시',
        },
        unavailable: [],
        zoneLabel: '위험 반경 50m',
        isExampleData: true,
      };
    case 'no-risk-found':
      return {
        status,
        badge: '확인된 위험 없음',
        headline: '확인된 위험 요소가 없어요',
        summary:
          '분석은 마쳤지만 위험 근거를 찾지 못했어요. 안전하거나 합법적인 주차라는 뜻은 아니에요.',
        evidence: [
          { label: '금지 구역 (예시)', value: '해당 없음' },
          { label: '신고 분위수 (예시)', value: '하위 60%' },
          crosswalkEvidence(answer),
        ],
        stats: [],
        unavailable: [],
        isExampleData: true,
      };
    case 'insufficient-data':
      return {
        status,
        badge: '정보 부족',
        headline: '판단할 정보가 부족해요',
        summary: '이 위치의 데이터가 충분하지 않아 위험 여부를 판단하지 못했어요.',
        evidence: [crosswalkEvidence(answer)],
        stats: [],
        unavailable: ['신고·단속 이력', '시간대별 통계'],
        isExampleData: true,
      };
    case 'failed':
      return {
        status,
        badge: '분석 실패',
        headline: '분석을 마치지 못했어요',
        summary: '분석 중 문제가 생겼어요. 위치와 주차 시각은 그대로 두고 다시 분석할 수 있어요.',
        evidence: [crosswalkEvidence(answer)],
        stats: [],
        unavailable: [],
        isExampleData: true,
      };
  }
}
