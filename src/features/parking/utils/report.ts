export { withCrosswalkEvidence } from '@/shared/utils/crosswalk';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

/** 예: "11월 2일 토요일 19:04" */
export function formatParkedAt(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}요일 ${hh}:${mm}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type RelativeUnit = 'minute' | 'hour' | 'day';
const unitSuffix: Record<RelativeUnit, string> = { minute: '분', hour: '시간', day: '일' };

/** 런타임이 Intl.RelativeTimeFormat을 지원하면 그대로 쓰고, 없으면 같은 형식으로 만든다. */
function relativeAgo(value: number, unit: RelativeUnit): string {
  if (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function') {
    try {
      return new Intl.RelativeTimeFormat('ko', { numeric: 'always' }).format(-value, unit);
    } catch {
      // 로케일 데이터가 없는 런타임은 아래 형식으로 표시한다.
    }
  }
  return `${value}${unitSuffix[unit]} 전`;
}

/**
 * 목록용 상대 시각. 예: "방금 전", "5분 전", "3시간 전", "2일 전".
 * 7일이 지났거나 시각이 미래·비정상이면 `formatParkedAt`의 날짜 표기로 돌아간다.
 */
export function formatParkedAgo(iso: string, now: number = Date.now()): string {
  const elapsed = now - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 7 * DAY) return formatParkedAt(iso);
  if (elapsed < MINUTE) return '방금 전';
  if (elapsed < HOUR) return relativeAgo(Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relativeAgo(Math.floor(elapsed / HOUR), 'hour');
  return relativeAgo(Math.floor(elapsed / DAY), 'day');
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
