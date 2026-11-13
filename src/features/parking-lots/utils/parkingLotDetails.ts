import type { ParkingFeeType, ParkingLot } from '@/shared/types/map';

export interface ParkingDetailRow {
  label: string;
  value: string;
}

const feeLabels: Record<ParkingFeeType, string> = {
  FREE: '무료',
  PAID: '유료',
  MIXED: '유료/무료 혼합',
};
const feeKeys = new Set(['요금정보', '요금구분']);
const compact = (value: string) => value.replace(/\s+/g, '');

/** 서버의 항목형 문자열만 분리한다. 자유 문장·모르는 항목·중복 항목도 보존한다. */
function feeEntries(fee: string | null): ParkingDetailRow[] {
  const rows: ParkingDetailRow[] = [];
  for (const segment of (fee ?? '').split(/[;；\n]+/)) {
    const text = segment.trim();
    if (!text) continue;
    const match = /^([^:：]+)[:：]\s*(.+)$/.exec(text);
    const [, label = '', value = ''] = match ?? [];
    const last = rows.at(-1);
    if (match && /[가-힣A-Za-z)]$/.test(label.trim())) {
      rows.push({ label: label.trim(), value: value.trim() });
    } else if (last) {
      last.value += `; ${text}`;
    } else {
      rows.push({ label: '요금 안내', value: text });
    }
  }
  return rows;
}

/** 목록에서는 요금 구분만 표시하고 긴 요금 설명은 펼친 영역에 둔다. */
export function parkingFeeSummary(lot: Pick<ParkingLot, 'feeType' | 'fee'>): string {
  if (lot.feeType) return feeLabels[lot.feeType];
  const value =
    feeEntries(lot.fee).find((row) => feeKeys.has(compact(row.label)))?.value ?? lot.fee?.trim();
  if (!value) return '정보 없음';
  return ['무료', '유료', '혼합', '유무료', '유·무료', '유/무료'].includes(compact(value))
    ? value.trim().replace(/·/g, '/')
    : '정보 없음';
}

function amount(value: string): string {
  const numeric = value.replace(/,/g, '');
  return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(numeric))
    ? `${Number(numeric).toLocaleString('ko-KR')}원`
    : value;
}

function minutes(value: string): string {
  return /^\d+(?:\.\d+)?$/.test(value) ? `${value}분` : value;
}

/** 인식한 기본·추가 요금은 시간과 묶고, 나머지 정보는 원래 값을 항목별로 표시한다. */
export function parkingFeeDetails(lot: Pick<ParkingLot, 'feeType' | 'fee'>): ParkingDetailRow[] {
  const rows = feeEntries(lot.fee);
  const result: ParkingDetailRow[] = [];
  const consumed = new Set<ParkingDetailRow>();
  const find = (key: string) => rows.find((row) => compact(row.label) === key);

  for (const [timeKey, amountKey, label] of [
    ['주차기본시간', '주차기본요금', '기본요금'],
    ['추가단위시간', '추가단위요금', '추가요금'],
  ] as const) {
    const time = find(timeKey);
    const charge = find(amountKey);
    if (!time || !charge) continue;
    result.push({ label, value: `${minutes(time.value)} / ${amount(charge.value)}` });
    consumed.add(time);
    consumed.add(charge);
  }

  const labels: Record<string, string> = {
    주차기본시간: '기본시간',
    주차기본요금: '기본요금',
    추가단위시간: '추가 단위시간',
    추가단위요금: '추가요금',
    '1일주차권요금적용시간': '1일권 적용시간',
    '1일주차권요금': '1일 주차권',
    월정기권요금: '월 정기권',
    결제방법: '결제방법',
    특기사항: '기타 안내',
  };
  rows.forEach((row) => {
    if (consumed.has(row)) return;
    const key = compact(row.label);
    if (feeKeys.has(key) && compact(row.value) === compact(parkingFeeSummary(lot))) return;
    const value = ['주차기본요금', '추가단위요금', '1일주차권요금', '월정기권요금'].includes(key)
      ? amount(row.value)
      : ['주차기본시간', '추가단위시간'].includes(key)
        ? minutes(row.value)
        : row.value;
    // 1일권 적용시간 등 단위가 명확하지 않은 값은 임의로 단위를 붙이지 않는다.
    result.push({ label: labels[key] ?? row.label, value });
  });
  return result;
}
