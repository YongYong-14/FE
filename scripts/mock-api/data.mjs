// 목 서버 고정 데이터와 결정론적 위험 모델. 실제 공공데이터가 아니라 시연용 값이다.
import { createHash } from 'node:crypto';

export const DATA_PERIOD = Object.freeze({ start: '2025-01-01', end: '2025-09-25' });
export const CAUTION_TOP_PERCENT = 10;
export const IMMEDIATE_TOP_PERCENT = 2;
export const REPORT_RADIUS_M = 50;
export const CELL_SIZE_M = 50;
export const OTHER_FINE_AMOUNT = 40000;
// 백엔드 app.parking.facility-priority 에 해당하는 설정값
export const FACILITY_PRIORITY = ['HYDRANT', 'BUS_STOP'];
export const YONGIN_BOUNDS = Object.freeze({
  minLat: 37.09,
  maxLat: 37.37,
  minLng: 127.075,
  maxLng: 127.43,
});

// rules_v1.sql(yongin-2026-11-v1)과 zone_types 라벨
export const ZONE_RULES = Object.freeze({
  HYDRANT: { label: '소화전', thresholdM: 5, fineAmount: 80000, title: '소화전 근처 주차' },
  BUS_STOP: {
    label: '버스정류소',
    thresholdM: 10,
    fineAmount: 40000,
    title: '버스정류소 근처 주차',
  },
});

// 2026 공휴일(대체공휴일·지방선거일 포함). 판정·지도는 일요일(7)로 치환한다.
export const HOLIDAYS = new Set([
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-03-01',
  '2026-03-02',
  '2026-05-05',
  '2026-05-24',
  '2026-05-25',
  '2026-06-03',
  '2026-06-06',
  '2026-08-15',
  '2026-08-17',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-10-03',
  '2026-10-05',
  '2026-10-09',
  '2026-12-25',
  '2027-01-01',
]);

// ---------- 해시 ----------

export function hash01(key) {
  // FNV-1a + murmur3 fmix32 → [0, 1)
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function fixtureUuid(seed) {
  const hex = createHash('sha256').update(seed).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ---------- 거리·좌표계 ----------

const RAD = Math.PI / 180;
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/** WGS84 타원체 국지 근사 거리(m). 수 km 이내에서는 ST_Distance(geography)와 mm 단위로 같다. */
export function distanceM(lat1, lng1, lat2, lng2) {
  const phi = ((lat1 + lat2) / 2) * RAD;
  const s = Math.sin(phi);
  const w = Math.sqrt(1 - WGS84_E2 * s * s);
  const meridian = (WGS84_A * (1 - WGS84_E2)) / (w * w * w);
  const vertical = WGS84_A / w;
  const dy = meridian * (lat2 - lat1) * RAD;
  const dx = vertical * Math.cos(phi) * (lng2 - lng1) * RAD;
  return Math.hypot(dx, dy);
}

// EPSG:5186 (Korea 2000 / Central Belt 2010, GRS80 TM) — 백엔드 격자 계산과 같은 좌표계
const TM_A = 6378137;
const TM_F = 1 / 298.257222101;
const TM_E2 = TM_F * (2 - TM_F);
const TM_EP2 = TM_E2 / (1 - TM_E2);
const TM_LAT0 = 38 * RAD;
const TM_LON0 = 127 * RAD;
const TM_FE = 200000;
const TM_FN = 600000;
const TM_E4 = TM_E2 * TM_E2;
const TM_E6 = TM_E4 * TM_E2;
const TM_ARC0 = 1 - TM_E2 / 4 - (3 * TM_E4) / 64 - (5 * TM_E6) / 256;

function meridianArc(phi) {
  return (
    TM_A *
    (TM_ARC0 * phi -
      ((3 * TM_E2) / 8 + (3 * TM_E4) / 32 + (45 * TM_E6) / 1024) * Math.sin(2 * phi) +
      ((15 * TM_E4) / 256 + (45 * TM_E6) / 1024) * Math.sin(4 * phi) -
      ((35 * TM_E6) / 3072) * Math.sin(6 * phi))
  );
}
const TM_M0 = meridianArc(TM_LAT0);

export function toTm(lat, lng) {
  const phi = lat * RAD;
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const t = Math.tan(phi);
  const n = TM_A / Math.sqrt(1 - TM_E2 * s * s);
  const tt = t * t;
  const cc = TM_EP2 * c * c;
  const a = (lng * RAD - TM_LON0) * c;
  const x =
    n *
    (a +
      ((1 - tt + cc) * a ** 3) / 6 +
      ((5 - 18 * tt + tt * tt + 72 * cc - 58 * TM_EP2) * a ** 5) / 120);
  const y =
    meridianArc(phi) -
    TM_M0 +
    n *
      t *
      ((a * a) / 2 +
        ((5 - tt + 9 * cc + 4 * cc * cc) * a ** 4) / 24 +
        ((61 - 58 * tt + tt * tt + 600 * cc - 330 * TM_EP2) * a ** 6) / 720);
  return { x: x + TM_FE, y: y + TM_FN };
}

export function fromTm(xm, ym) {
  const x = xm - TM_FE;
  const mu = (TM_M0 + (ym - TM_FN)) / (TM_A * TM_ARC0);
  const e1 = (1 - Math.sqrt(1 - TM_E2)) / (1 + Math.sqrt(1 - TM_E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1);
  const c = Math.cos(phi1);
  const t = Math.tan(phi1);
  const c1 = TM_EP2 * c * c;
  const t1 = t * t;
  const n1 = TM_A / Math.sqrt(1 - TM_E2 * s * s);
  const r1 = (TM_A * (1 - TM_E2)) / (1 - TM_E2 * s * s) ** 1.5;
  const d = x / n1;
  const phi =
    phi1 -
    ((n1 * t) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * TM_EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * TM_EP2 - 3 * c1 * c1) * d ** 6) / 720);
  const lam =
    TM_LON0 +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * TM_EP2 + 24 * t1 * t1) * d ** 5) / 120) /
      c;
  return { lat: phi / RAD, lng: lam / RAD };
}

// ---------- 50m 격자 ----------

function makeCell(gx, gy) {
  return { gx, gy, key: `${gx}:${gy}`, id: gy * 10000 + gx };
}

export function cellOf(lat, lng) {
  const { x, y } = toTm(lat, lng);
  return makeCell(Math.floor(x / CELL_SIZE_M), Math.floor(y / CELL_SIZE_M));
}

export function cellCenter(cell) {
  return fromTm((cell.gx + 0.5) * CELL_SIZE_M, (cell.gy + 0.5) * CELL_SIZE_M);
}

export function cellBounds(cell) {
  const corners = [
    fromTm(cell.gx * CELL_SIZE_M, cell.gy * CELL_SIZE_M),
    fromTm((cell.gx + 1) * CELL_SIZE_M, cell.gy * CELL_SIZE_M),
    fromTm(cell.gx * CELL_SIZE_M, (cell.gy + 1) * CELL_SIZE_M),
    fromTm((cell.gx + 1) * CELL_SIZE_M, (cell.gy + 1) * CELL_SIZE_M),
  ];
  return {
    minLat: Math.min(...corners.map((p) => p.lat)),
    maxLat: Math.max(...corners.map((p) => p.lat)),
    minLng: Math.min(...corners.map((p) => p.lng)),
    maxLng: Math.max(...corners.map((p) => p.lng)),
  };
}

export function insideYongin(lat, lng) {
  const b = YONGIN_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

// ---------- 시연 장소 (앱 데모 좌표) ----------

export const DEMO_PLACES = Object.freeze([
  {
    name: '수지구청 앞',
    lat: 37.3222,
    lng: 127.0977,
    address: '경기 용인시 수지구 풍덕천동 1167-1',
    outcome: 'SUCCEEDED / level 1 / SKIPPED (소화전 약 3m)',
  },
  {
    name: '죽전역 2번 출구',
    lat: 37.3245,
    lng: 127.1074,
    address: '경기 용인시 수지구 죽전동 1001',
    outcome: 'SUCCEEDED / level 1 / SKIPPED (버스정류소 약 7m)',
  },
  {
    name: '현재 위치',
    lat: 37.3221,
    lng: 127.0982,
    address: '경기 용인시 수지구 풍덕천동 786',
    outcome: 'SUCCEEDED / level 2 / OK (모든 요일·시간대 상위 8%)',
  },
  {
    name: '기흥역 상가 골목',
    lat: 37.2752,
    lng: 127.1159,
    address: '경기 용인시 기흥구 구갈동 659',
    outcome: 'SUCCEEDED / level 2 / OK (상위 1.5%, 설정 무관 SEND)',
  },
  {
    name: '동백호수공원 입구',
    lat: 37.2697,
    lng: 127.1527,
    address: '경기 용인시 기흥구 중동 870',
    outcome: 'PARTIAL / NOT_TARGET',
  },
  {
    name: '용인공용버스터미널',
    lat: 37.2378,
    lng: 127.2096,
    address: '경기 용인시 처인구 김량장동 351',
    outcome: '1회차 FAILED / MISSING_ROW, 같은 clientEventId 재시도(2회차)는 level 3',
  },
]);

// 역지오코딩 흉내용 기준점(가장 가까운 기준점의 동 이름 + 가짜 지번)
const ADDRESS_ANCHORS = [
  ...DEMO_PLACES,
  { lat: 37.3384, lng: 127.0846, address: '경기 용인시 수지구 동천동 893' },
  { lat: 37.3125, lng: 127.1092, address: '경기 용인시 기흥구 보정동 1189' },
  { lat: 37.2805, lng: 127.1146, address: '경기 용인시 기흥구 구갈동 541-1' },
  { lat: 37.2411, lng: 127.1776, address: '경기 용인시 처인구 삼가동 556' },
  { lat: 37.2938, lng: 127.2025, address: '경기 용인시 처인구 포곡읍 전대리 310' },
  { lat: 37.1597, lng: 127.2049, address: '경기 용인시 처인구 이동읍 천리 155' },
  { lat: 37.1617, lng: 127.3747, address: '경기 용인시 처인구 백암면 백암리 283' },
  { lat: 37.3948, lng: 127.1112, address: '경기 성남시 분당구 백현동 532' },
  { lat: 37.2656, lng: 126.9999, address: '경기 수원시 팔달구 매산로1가 18' },
  { lat: 37.5665, lng: 126.978, address: '서울 중구 태평로1가 31' },
];

/** 카카오 coord2address의 지번 주소 형식을 흉내 낸다. 20km 안에 기준점이 없으면 null. */
export function fakeAddress(lat, lng) {
  let best = null;
  for (const anchor of ADDRESS_ANCHORS) {
    const d = distanceM(lat, lng, anchor.lat, anchor.lng);
    if (!best || d < best.d) best = { anchor, d };
  }
  if (!best || best.d > 20000) return null;
  if (best.d <= 25) return best.anchor.address;
  const prefix = best.anchor.address.replace(/\s+\S+$/, '');
  const h = hash01(`addr:${lat.toFixed(5)}:${lng.toFixed(5)}`);
  const main = 1 + Math.floor(h * 1200);
  const sub = Math.floor(hash01(`addr-sub:${main}`) * 5);
  return `${prefix} ${main}${sub ? `-${sub}` : ''}`;
}

// ---------- 1단계 시설 ----------

function facility(seed, zoneType, lat, lng, note) {
  return { id: fixtureUuid(`facility:${seed}`), zoneType, lat, lng, note };
}

export const FACILITIES = Object.freeze([
  facility('h1', 'HYDRANT', 37.322222, 127.097717, '수지구청 앞에서 약 3m'),
  facility('h2', 'HYDRANT', 37.3236, 127.099, '현재 위치 북쪽 약 180m'),
  facility('h3', 'HYDRANT', 37.3207, 127.0961, '현재 위치 남서쪽 약 240m'),
  facility('h4', 'HYDRANT', 37.3229, 127.1015, '현재 위치 동쪽 약 300m'),
  facility('h5', 'HYDRANT', 37.324, 127.108, '죽전역 2번 출구 남동쪽 약 75m'),
  facility('h6', 'HYDRANT', 37.2745, 127.115, '기흥역 상가 골목 남서쪽 약 110m'),
  facility('b1', 'BUS_STOP', 37.32455, 127.107445, '죽전역 2번 출구에서 약 7m'),
  facility('b2', 'BUS_STOP', 37.3216, 127.0969, '수지구청 정류장'),
  facility('b3', 'BUS_STOP', 37.3249, 127.0975, '현재 위치 북쪽 약 310m'),
  facility('b4', 'BUS_STOP', 37.3195, 127.1003, '현재 위치 남동쪽 약 340m'),
  facility('b5', 'BUS_STOP', 37.2757, 127.1166, '기흥역 상가 골목 북동쪽 약 85m'),
]);

// ---------- 2단계 예측(격자) ----------

const HERE_CELL = cellOf(37.3221, 127.0982);
const GIHEUNG_CELL = cellOf(37.2752, 127.1159);

function hot(anchor, dx, dy, spec) {
  return { ...makeCell(anchor.gx + dx, anchor.gy + dy), ...spec };
}

// topPercent 10 이하인 '노란 칸'. slots/weekdays가 있으면 그 시간대에만 노란 칸이다.
export const HOT_CELLS = Object.freeze([
  hot(HERE_CELL, 0, 0, { topPercent: 8, predictedCount: 3.2, reportCount: 587, note: '현재 위치' }),
  hot(HERE_CELL, -1, 0, {
    topPercent: 9.5,
    predictedCount: 2.6,
    reportCount: 412,
    note: '수지구청 앞',
  }),
  hot(HERE_CELL, 1, 0, { topPercent: 6.2, predictedCount: 3.6, reportCount: 233 }),
  hot(HERE_CELL, 0, 1, { topPercent: 4.8, predictedCount: 4.1, reportCount: 95 }),
  hot(HERE_CELL, 2, -1, { topPercent: 7.1, predictedCount: 2.9, reportCount: 0, note: '신고 0건' }),
  hot(HERE_CELL, -3, 2, { topPercent: 9.8, predictedCount: 2.4, reportCount: 148 }),
  hot(HERE_CELL, 3, 3, { topPercent: 3.4, predictedCount: 4.6, reportCount: 61 }),
  hot(HERE_CELL, 4, -3, {
    topPercent: 5.5,
    predictedCount: 3,
    reportCount: 320,
    slots: [6, 7],
    offTopPercent: 24,
    offPredictedCount: 1.1,
    note: '저녁·밤(18~24시)만',
  }),
  hot(HERE_CELL, -5, 4, {
    topPercent: 9.1,
    predictedCount: 2.5,
    reportCount: 77,
    weekdays: [6, 7],
    offTopPercent: 31.5,
    offPredictedCount: 0.8,
    note: '토·일(공휴일)만',
  }),
  hot(HERE_CELL, 6, -6, { topPercent: 6.8, predictedCount: 3.1, reportCount: 12 }),
  hot(GIHEUNG_CELL, 0, 0, {
    topPercent: 1.5,
    predictedCount: 6.4,
    reportCount: 1024,
    note: '기흥역 상가 골목',
  }),
  hot(GIHEUNG_CELL, 1, 0, { topPercent: 5.2, predictedCount: 3.4, reportCount: 288 }),
  hot(GIHEUNG_CELL, 0, -1, { topPercent: 8.9, predictedCount: 2.2, reportCount: 140 }),
]);
const HOT_BY_KEY = new Map(HOT_CELLS.map((c) => [c.key, c]));

const NOT_TARGET_ZONE = { lat: 37.2697, lng: 127.1527, radiusM: 200 };
const MISSING_ROW_ZONE = { lat: 37.2378, lng: 127.2096, radiusM: 150 };
const EXTRA_REPORTS = new Map([[cellOf(37.3245, 127.1074).key, 142]]);

function inZone(cell, zone) {
  const c = cellCenter(cell);
  return distanceM(c.lat, c.lng, zone.lat, zone.lng) <= zone.radiusM;
}

export function hotValues(cell, weekday, slot) {
  const off =
    (cell.slots && !cell.slots.includes(slot)) ||
    (cell.weekdays && !cell.weekdays.includes(weekday));
  return off
    ? { topPercent: cell.offTopPercent, predictedCount: cell.offPredictedCount }
    : { topPercent: cell.topPercent, predictedCount: cell.predictedCount };
}

/** 판정용 예측 조회. attempt 1의 버스터미널 칸은 예측 행 누락(MISSING_ROW)을 흉내 낸다. */
export function predictCell(cell, weekday, slot, attempt) {
  if (inZone(cell, NOT_TARGET_ZONE)) return { kind: 'NOT_TARGET' };
  if (attempt < 2 && inZone(cell, MISSING_ROW_ZONE)) return { kind: 'MISSING_ROW' };
  const hotCell = HOT_BY_KEY.get(cell.key);
  if (hotCell) return { kind: 'OK', ...hotValues(hotCell, weekday, slot) };
  const key = `${cell.key}:${weekday}:${slot}`;
  return {
    kind: 'OK',
    topPercent: 35 + Math.floor(hash01(`top:${key}`) * 3500) / 100,
    predictedCount: Math.round((0.02 + hash01(`pred:${key}`) * 0.6) * 1000) / 1000,
  };
}

/** 칸의 전체 기간 신고 건수(2025-01-01~2025-09-25). */
export function cellReportCount(cell) {
  const hotCell = HOT_BY_KEY.get(cell.key);
  if (hotCell) return hotCell.reportCount;
  if (EXTRA_REPORTS.has(cell.key)) return EXTRA_REPORTS.get(cell.key);
  if (inZone(cell, NOT_TARGET_ZONE) || inZone(cell, MISSING_ROW_ZONE)) return 0;
  if (hash01(`reports:${cell.key}`) < 0.15) return 0;
  return 1 + Math.floor(hash01(`reports-n:${cell.key}`) * 40);
}

const SLOT_WEIGHTS = [0.6, 0.35, 0.45, 1, 1.25, 1.5, 2.6, 1.45];
const WEEKDAY_WEIGHTS = [1, 0.95, 1, 1.05, 1.2, 1.4, 1.15];
const binCache = new Map();

/** 요일(1~7)의 3시간 구간 8개 신고 건수. 그 요일 신고가 하나도 없으면 null(peak 없음). */
export function cellSlotCounts(cell, weekday) {
  let bins = binCache.get(cell.key);
  if (!bins) {
    const total = cellReportCount(cell);
    const weights = [];
    for (let d = 1; d <= 7; d += 1) {
      for (let s = 0; s < 8; s += 1) {
        const jitter = 0.6 + 0.8 * hash01(`bin:${cell.key}:${d}:${s}`);
        weights.push(WEEKDAY_WEIGHTS[d - 1] * SLOT_WEIGHTS[s] * jitter);
      }
    }
    const sum = weights.reduce((a, b) => a + b, 0);
    const exact = weights.map((w) => (w / sum) * total);
    bins = exact.map((v) => Math.floor(v));
    const rest = total - bins.reduce((a, b) => a + b, 0);
    const order = exact.map((v, i) => [v - bins[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; k < rest; k += 1) bins[order[k][1]] += 1;
    binCache.set(cell.key, bins);
  }
  const day = bins.slice((weekday - 1) * 8, weekday * 8);
  return day.some((c) => c > 0) ? day : null;
}

// ---------- 주변 주차장 ----------

function lot(seed, spec) {
  return { id: fixtureUuid(`parking-lot:${seed}`), ...spec };
}
const H24 = ['00:00', '23:59'];

// hours: 평일 / 토요일 / 공휴일(일요일 포함) 칸. null 은 원천 결측.
export const PARKING_LOTS = Object.freeze([
  lot('pungdeokcheon-public', {
    name: '풍덕천 공영주차장',
    address: '경기도 용인시 수지구 풍덕천로 131',
    lat: 37.3213,
    lng: 127.0961,
    parkingType: 'PUBLIC',
    feeType: 'PAID',
    feeInfo: '30분 600원',
    hours: { weekday: ['09:00', '18:00'], saturday: ['09:00', '13:00'], holiday: null },
    capacity: 80,
  }),
  lot('suji-office', {
    name: '수지구청 공영주차장',
    address: '경기도 용인시 수지구 포은대로 435',
    lat: 37.3228,
    lng: 127.0985,
    parkingType: 'PUBLIC',
    feeType: 'MIXED',
    feeInfo: '민원인 1시간 무료, 이후 10분 300원',
    hours: { weekday: H24, saturday: H24, holiday: H24 },
    capacity: 210,
  }),
  lot('pungdeokcheon2-street', {
    name: '풍덕천2동 노상공영주차장',
    address: '경기도 용인시 수지구 풍덕천동 1035',
    lat: 37.3204,
    lng: 127.0995,
    parkingType: 'PUBLIC',
    feeType: 'PAID',
    feeInfo: '10분 300원',
    hours: { weekday: ['09:00', '19:00'], saturday: ['09:00', '15:00'], holiday: null },
    capacity: 24,
  }),
  lot('suji-food-street', {
    name: '수지 먹자골목 민영주차장',
    address: '경기도 용인시 수지구 문정로 25',
    lat: 37.3235,
    lng: 127.1004,
    parkingType: 'PRIVATE',
    feeType: 'PAID',
    feeInfo: '1시간 3,000원',
    hours: {
      weekday: ['18:00', '02:00'],
      saturday: ['18:00', '02:00'],
      holiday: ['18:00', '02:00'],
    },
    capacity: null,
  }),
  lot('sinjeong-attached', {
    name: '신정마을 부설주차장',
    address: '경기도 용인시 수지구 신정로 34',
    lat: 37.3249,
    lng: 127.0958,
    parkingType: 'ATTACHED',
    feeType: null,
    feeInfo: null,
    hours: { weekday: null, saturday: null, holiday: null },
    capacity: 45,
  }),
  lot('suji-sports-park', {
    name: '수지체육공원 공영주차장',
    address: '경기도 용인시 수지구 죽전로 112',
    lat: 37.3262,
    lng: 127.1047,
    parkingType: 'PUBLIC',
    feeType: 'FREE',
    feeInfo: '무료',
    hours: {
      weekday: ['06:00', '22:00'],
      saturday: ['06:00', '22:00'],
      holiday: ['06:00', '22:00'],
    },
    capacity: 150,
  }),
  lot('jukjeon-station', {
    name: '죽전역 공영주차장',
    address: '경기도 용인시 수지구 포은대로 536',
    lat: 37.3236,
    lng: 127.1101,
    parkingType: 'PUBLIC',
    feeType: 'PAID',
    feeInfo: '30분 1,000원',
    hours: {
      weekday: ['07:00', '23:00'],
      saturday: ['07:00', '23:00'],
      holiday: ['07:00', '23:00'],
    },
    capacity: 200,
  }),
  lot('giheung-transfer', {
    name: '기흥역 환승 공영주차장',
    address: '경기도 용인시 기흥구 구갈로 60',
    lat: 37.2808,
    lng: 127.1131,
    parkingType: 'PUBLIC',
    feeType: 'PAID',
    feeInfo: '1일 4,000원 (대중교통 환승 시 할인)',
    hours: {
      weekday: ['05:00', '23:59'],
      saturday: ['05:00', '23:59'],
      holiday: ['05:00', '23:59'],
    },
    capacity: 320,
  }),
  lot('gugal-offstreet', {
    name: '구갈동 노외공영주차장',
    address: '경기도 용인시 기흥구 구갈동 381',
    lat: 37.2705,
    lng: 127.1101,
    parkingType: 'PUBLIC',
    feeType: 'MIXED',
    feeInfo: '최초 30분 무료, 이후 10분 200원',
    hours: { weekday: ['08:00', '20:00'], saturday: ['08:00', '20:00'], holiday: null },
    capacity: 64,
  }),
  lot('giheung-office', {
    name: '기흥구청 부설주차장',
    address: '경기도 용인시 기흥구 중부대로 476',
    lat: 37.2801,
    lng: 127.1203,
    parkingType: 'ATTACHED',
    feeType: 'FREE',
    feeInfo: null,
    hours: { weekday: ['09:00', '18:00'], saturday: null, holiday: null },
    capacity: 120,
  }),
  lot('yongin-terminal', {
    name: '용인공용버스터미널 주차장',
    address: '경기도 용인시 처인구 중부대로 1462',
    lat: 37.2385,
    lng: 127.2085,
    parkingType: 'PUBLIC',
    feeType: 'PAID',
    feeInfo: '1시간 1,200원',
    hours: { weekday: H24, saturday: H24, holiday: H24 },
    capacity: 98,
  }),
  lot('dongbaek-severance', {
    name: '동백세브란스 부설주차장',
    address: '경기도 용인시 기흥구 동백죽전대로 363',
    lat: 37.2848,
    lng: 127.1446,
    parkingType: 'ATTACHED',
    feeType: 'PAID',
    feeInfo: '10분 500원',
    hours: {
      weekday: ['06:00', '22:00'],
      saturday: ['06:00', '18:00'],
      holiday: ['06:00', '18:00'],
    },
    capacity: 600,
  }),
]);
