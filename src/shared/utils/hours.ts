// 주차장 운영시간 "HH:mm-HH:mm"을 현재 한국 시간과 비교한다.
// 종료가 시작보다 빠르면 다음 날까지, 00:00-23:59는 24시간 운영으로 읽는다(명세 8절).

const pattern = /^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/;

/** 운영 중이면 true, 아니면 false, 읽을 수 없거나 정보가 없으면 null. */
export function isOpenAt(hours: string | null, now: Date = new Date()): boolean | null {
  if (!hours) return null;
  const match = pattern.exec(hours.trim());
  if (!match) return null;
  const [, h1, m1, h2, m2] = match;
  const start = Number(h1) * 60 + Number(m1);
  const end = Number(h2) * 60 + Number(m2);
  if (start === end) return null;
  if (start === 0 && end === 23 * 60 + 59) return true;
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

/** 화면 표시용. 00:00-23:59는 "24시간". */
export function hoursLabel(hours: string | null): string {
  if (!hours) return '운영시간 정보 없음';
  return hours.trim() === '00:00-23:59' ? '24시간' : hours.replace('-', '~');
}
