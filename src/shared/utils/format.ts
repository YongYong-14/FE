import type { DataPeriod } from '@/shared/types/map';

// 화면 문구용 날짜·금액·시간대 변환.

const weekdayNames = ['월', '화', '수', '목', '금', '토', '일'];

/** 1=월 ~ 7=일 */
export function weekdayLabel(weekday: number): string {
  return weekdayNames[weekday - 1] ?? '';
}

/** 0=00~03시 ~ 7=21~24시 */
export function timeSlotLabel(timeSlot: number): string {
  return `${timeSlot * 3}~${timeSlot * 3 + 3}시`;
}

/** 한국 시간 기준 요일(1~7)과 3시간 구간(0~7). */
export function kstSlotOf(iso: string): { weekday: number; timeSlot: number } {
  const kst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return { weekday: ((kst.getUTCDay() + 6) % 7) + 1, timeSlot: Math.floor(kst.getUTCHours() / 3) };
}

/** 예: "2025년 1~9월" */
export function periodRangeLabel(period: DataPeriod | null | undefined): string | null {
  if (!period) return null;
  const [startYear, startMonth] = period.start.split('-').map(Number);
  const [endYear, endMonth] = period.end.split('-').map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) return null;
  return startYear === endYear
    ? `${startYear}년 ${startMonth}~${endMonth}월`
    : `${startYear}년 ${startMonth}월~${endYear}년 ${endMonth}월`;
}

/** 예: "신고 데이터 2025년 1~9월" */
export function dataPeriodLabel(period: DataPeriod | null | undefined): string | null {
  const range = periodRangeLabel(period);
  return range ? `신고 데이터 ${range}` : null;
}

/** 예: 80000 → "8만 원", 45000 → "45,000원" */
export function formatWon(amount: number): string {
  if (amount >= 10_000 && amount % 10_000 === 0) return `${amount / 10_000}만 원`;
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** 소수 첫째 자리까지. 정수면 소수점을 붙이지 않는다. */
export function formatMeters(meters: number): string {
  const rounded = Math.round(meters * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}m` : `${rounded.toFixed(1)}m`;
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}
