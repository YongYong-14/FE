// 세울까말까 로컬 목 백엔드. API 명세 v0.11과 실제 Spring 백엔드(BE)의 응답 형태를 따른다.
// 실행: node scripts/mock-api/server.mjs  (Node 24 내장 모듈만 사용, 모든 상태는 메모리에만 둔다)
import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAUTION_TOP_PERCENT,
  CELL_SIZE_M,
  DATA_PERIOD,
  DEMO_PLACES,
  FACILITIES,
  FACILITY_PRIORITY,
  HOLIDAYS,
  HOT_CELLS,
  IMMEDIATE_TOP_PERCENT,
  OTHER_FINE_AMOUNT,
  PARKING_LOTS,
  REPORT_RADIUS_M,
  ZONE_RULES,
  cellBounds,
  cellCenter,
  cellOf,
  cellReportCount,
  cellSlotCounts,
  distanceM,
  fakeAddress,
  hotValues,
  insideYongin,
  predictCell,
} from './data.mjs';

const API = '/api/v1';
const ISSUER = 'mock-parking-server';
const MAX_BODY_BYTES = 1024 * 1024;
const MINUTE_US = 60_000_000n;
const KST_OFFSET_MS = 9 * 3600 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANONICAL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2}(?::\d{2})?)$/i;
const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
const NUMBER_PARAM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const AGREEMENT_TYPES = ['TERMS', 'PRIVACY', 'LOCATION_SERVICE'];
const AGREEMENT_ACTIONS = ['AGREE', 'WITHDRAW'];
const CONFIRMATION_METHODS = ['CONFIRMED', 'ADJUSTED', 'AUTO'];
const DELIVERY_FAILURES = ['NO_PERMISSION', 'DISPLAY_FAILED', 'UNKNOWN'];
const DAY_NAMES = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const SLOT_NAMES = ['새벽', '새벽', '아침', '오전', '오후', '오후', '저녁', '밤'];
const PARKING_FIELDS = new Set([
  'clientEventId',
  'vehicleId',
  'detectedAt',
  'confirmedAt',
  'confirmationMethod',
  'originalLocation',
  'lastKnownLocation',
  'confirmedLocation',
  'remeasureCount',
]);
// SecurityConfig.publicApi 와 같다. 그 밖의 (메서드, 경로)는 없는 경로라도 먼저 인증한다.
const PUBLIC_ROUTES = new Set([
  `GET ${API}/health`,
  `POST ${API}/auth/kakao`,
  `POST ${API}/auth/refresh`,
  `POST ${API}/webhooks/kakao/unlink`,
]);
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// global/exception/ErrorCode.java
const ERRORS = {
  PARKING_EVENT_NOT_FOUND: [404, '주차 기록을 찾을 수 없습니다.'],
  DELIVERY_NOT_EXPECTED: [409, '알림 표시 보고 대상이 아닙니다.'],
  VEHICLE_NOT_FOUND: [404, '활성 차량을 찾을 수 없습니다.'],
  LOCATION_CONSENT_REQUIRED: [403, '위치기반서비스 동의가 필요합니다.'],
  IDEMPOTENCY_KEY_REUSED: [409, '같은 요청 키에 다른 내용이 전달되었습니다.'],
  INVALID_TIME: [400, '감지 시각을 확인해 주세요.'],
  INVALID_TIME_ORDER: [400, '확정 시각을 확인해 주세요.'],
  AUTO_CONFIRM_NOT_ALLOWED: [400, 'GPS 없이 자동 확정할 수 없습니다.'],
  ADJUST_DISTANCE_EXCEEDED: [400, '위치 보정 범위를 초과했습니다.'],
  INVALID_BLUETOOTH_ADDRESS: [400, '블루투스 주소 형식을 확인해 주세요.'],
  VEHICLE_CONFLICT: [409, '차량 정보가 변경되었습니다. 다시 조회한 뒤 재시도해 주세요.'],
  INVALID_INPUT: [400, '입력값을 확인해 주세요.'],
  UNAUTHORIZED: [401, '인증이 필요합니다.'],
  KAKAO_TOKEN_INVALID: [401, '카카오 인증 토큰을 확인해 주세요.'],
  TOKEN_REUSED: [401, '다시 로그인해 주세요.'],
  TOKEN_EXPIRED: [401, '토큰이 만료되었습니다.'],
  FORBIDDEN: [403, '접근 권한이 없습니다.'],
  NOT_FOUND: [404, '요청한 리소스를 찾을 수 없습니다.'],
  METHOD_NOT_ALLOWED: [405, '지원하지 않는 HTTP 메서드입니다.'],
  CONFLICT: [409, '요청이 현재 리소스 상태와 충돌합니다.'],
  PAYLOAD_TOO_LARGE: [413, '요청 크기가 허용 범위를 초과했습니다.'],
  UNSUPPORTED_MEDIA_TYPE: [415, '지원하지 않는 요청 형식입니다.'],
  INTERNAL_SERVER_ERROR: [500, '서버 오류가 발생했습니다.'],
  SERVICE_UNAVAILABLE: [503, '서비스를 일시적으로 사용할 수 없습니다.'],
};

class ApiError extends Error {
  constructor(code, headers) {
    super(code);
    this.code = code;
    this.headers = headers;
  }
}

function fail(code, headers) {
  throw new ApiError(code, headers);
}

// 인증 필터에서 만든 401만 WWW-Authenticate 헤더를 붙인다(SecurityErrorWriter).
function authFail(code) {
  fail(code, { 'WWW-Authenticate': 'Bearer' });
}

const ok = (data, status = 200) => ({ status, data });
const noContent = (status = 204) => ({ status, empty: true });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const p2 = (n) => String(n).padStart(2, '0');

// ---------- 시각 (내부는 epoch 마이크로초 BigInt, 응답은 KST +09:00) ----------

function floorDiv(a, b) {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

function daysFromCivil(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}

function daysInMonth(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** 시간대가 붙은 ISO-8601만 받는다. 마이크로초 미만은 절삭(백엔드와 같음). 실패하면 null. */
function parseOffsetDateTime(text) {
  if (typeof text !== 'string') return null;
  const m = ISO_RE.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi] = [1, 2, 3, 4, 5].map((i) => Number(m[i]));
  const s = m[6] === undefined ? 0 : Number(m[6]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) {
    return null;
  }
  let offsetSec = 0;
  if (m[8].toUpperCase() !== 'Z') {
    const [oh, om, os = '0'] = m[8].slice(1).split(':').map(Number);
    offsetSec = (m[8][0] === '-' ? -1 : 1) * (oh * 3600 + om * 60 + Number(os));
    if (om > 59 || Number(os) > 59 || Math.abs(offsetSec) > 18 * 3600) return null;
  }
  const micros = m[7] ? Number(m[7].padEnd(9, '0').slice(0, 6)) : 0;
  const epochSec = daysFromCivil(y, mo, d) * 86400 + h * 3600 + mi * 60 + s - offsetSec;
  return BigInt(epochSec) * 1_000_000n + BigInt(micros);
}

function kstInfo(us) {
  const d = new Date(Number(floorDiv(us, 1000n)) + KST_OFFSET_MS);
  const date = `${String(d.getUTCFullYear()).padStart(4, '0')}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  return { d, date, isoWeekday: d.getUTCDay() === 0 ? 7 : d.getUTCDay(), hour: d.getUTCHours() };
}

/** Jackson의 OffsetDateTime(ISO_OFFSET_DATE_TIME) 직렬화와 같은 모양: 초는 항상, 소수는 필요한 만큼. */
function formatKst(us) {
  const { d, date } = kstInfo(us);
  const micros = Number(us - floorDiv(us, 1_000_000n) * 1_000_000n);
  const fraction = micros ? `.${String(micros).padStart(6, '0').replace(/0+$/, '')}` : '';
  return `${date}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}${fraction}+09:00`;
}

/** Java Instant 직렬화(UTC Z). 동의 이력 occurredAt 이 Instant 다. */
function formatInstant(ms) {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

// ---------- 숫자 정규화 (BigDecimal 의미값 기준 해시) ----------

function decimalParts(source) {
  const m = DECIMAL_RE.exec(source);
  if (!m) return null;
  const fraction = m[3] ?? '';
  const all = (m[2] + fraction).replace(/^0+/, '');
  if (!all) return { zero: true };
  const digits = all.replace(/0+$/, '');
  const exp = Number(m[4] ?? 0) - fraction.length + (all.length - digits.length);
  return { zero: false, neg: Boolean(m[1]), digits, exp };
}

function canonicalDecimal(source) {
  const p = decimalParts(source);
  if (!p) return source;
  return p.zero ? '0' : `${p.neg ? '-' : ''}${p.digits}e${p.exp}`;
}

/** 소수 7자리 HALF_UP 반올림(ParkingRequest.round). 범위 검증 뒤에만 호출한다. */
function roundScale7(source) {
  const p = decimalParts(source);
  if (!p || p.zero) return { text: '0', value: 0 };
  const shift = p.exp + 7;
  let units;
  if (shift >= 0) {
    units = BigInt(p.digits) * 10n ** BigInt(shift);
  } else if (-shift > p.digits.length) {
    units = 0n;
  } else {
    const cut = p.digits.length + shift;
    units = BigInt(p.digits.slice(0, cut) || '0') + (p.digits[cut] >= '5' ? 1n : 0n);
  }
  if (units === 0n) return { text: '0', value: 0 };
  const text = `${p.neg ? '-' : ''}${units}e-7`;
  return { text, value: Number(text) };
}

/** JSON.parse + 숫자 원문(context.source) 보존. remeasureCount 정수 토큰 검사와 해시에 쓴다. */
function parseJsonText(text, withSources) {
  if (!withSources) return { value: JSON.parse(text), sources: null };
  const sources = new WeakMap();
  const value = JSON.parse(text, function reviver(key, val, context) {
    if (typeof val === 'number' && context && typeof context.source === 'string') {
      let map = sources.get(this);
      if (!map) {
        map = Object.create(null);
        sources.set(this, map);
      }
      map[key] = context.source;
    }
    return val;
  });
  return { value, sources };
}

function numberSource(sources, holder, key) {
  return sources?.get(holder)?.[key] ?? String(holder[key]);
}

function decodeUtf8(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return fail('INVALID_INPUT');
  }
}

function mediaType(header) {
  return typeof header === 'string' ? header.split(';')[0].trim().toLowerCase() : null;
}

function isJsonMediaType(header) {
  const type = mediaType(header);
  return type === 'application/json' || /^application\/[^/\s]+\+json$/.test(type ?? '');
}

function headerValues(req, name) {
  const values = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() === name) values.push(req.rawHeaders[i + 1]);
  }
  return values;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) reject(new ApiError('PAYLOAD_TOO_LARGE'));
      else resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

// ---------- 앱 ----------

export function createApp(config) {
  const secret = randomBytes(32);
  const timers = new Set();
  let requestLog = [];
  let state = freshState();

  function freshState() {
    return {
      users: new Map(),
      kakaoIndex: new Map(),
      settings: new Map(),
      agreements: [],
      agreementSeq: 0,
      refreshTokens: new Map(),
      vehicles: new Map(),
      events: new Map(),
      eventKeys: new Map(),
      clockOffsetMs: 0,
    };
  }

  // 판정·검증용 "서버 현재 시각"(/__mock/clock 으로 조정). 토큰 만료는 실제 시계를 쓴다.
  const nowMs = () => Date.now() + state.clockOffsetMs;
  const nowUs = () => BigInt(nowMs()) * 1000n;

  // ----- 요청 본문 -----

  async function readJson(ctx, withSources = false) {
    const contentType = ctx.req.headers['content-type'];
    const raw = await ctx.rawBody();
    const unsupported = contentType !== undefined ? !isJsonMediaType(contentType) : raw.length > 0;
    if (unsupported) fail('UNSUPPORTED_MEDIA_TYPE');
    const text = decodeUtf8(raw);
    if (text.trim() === '') fail('INVALID_INPUT');
    try {
      return parseJsonText(text, withSources);
    } catch {
      return fail('INVALID_INPUT');
    }
  }

  async function readJsonObject(ctx) {
    const { value } = await readJson(ctx);
    if (!isPlainObject(value)) fail('INVALID_INPUT');
    return value;
  }

  function param(ctx, name) {
    const values = ctx.query.getAll(name);
    return values.length === 0 ? null : values.join(',');
  }

  function doubleParam(ctx, name) {
    const raw = param(ctx, name);
    const text = raw === null ? '' : raw.trim();
    if (!NUMBER_PARAM_RE.test(text)) fail('INVALID_INPUT');
    return Number(text);
  }

  function intParam(ctx, name, fallback) {
    const raw = param(ctx, name);
    if (raw === null || raw.trim() === '') return fallback;
    const text = raw.trim();
    const n = Number(text);
    if (!/^[+-]?\d+$/.test(text) || n > 2147483647 || n < -2147483648) fail('INVALID_INPUT');
    return n;
  }

  function pathUuid(value) {
    let text;
    try {
      text = decodeURIComponent(value);
    } catch {
      fail('INVALID_INPUT');
    }
    if (!UUID_RE.test(text)) fail('INVALID_INPUT');
    return text.toLowerCase();
  }

  // ----- 토큰 -----

  function issueTokens(userId, familyId, deviceInfo) {
    const iat = Math.floor(Date.now() / 1000);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'HS256' })}.${encode({
      iss: ISSUER,
      sub: userId,
      iat,
      exp: iat + config.accessTtlSec,
      token_type: 'access',
    })}`;
    const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    const row = {
      id: randomUUID(),
      userId,
      familyId,
      deviceInfo,
      expiresAtMs: Date.now() + config.refreshTtlSec * 1000,
      revokedAtMs: null,
      replacedById: null,
    };
    state.refreshTokens.set(sha256(refreshToken), row);
    return {
      row,
      response: {
        accessToken: `${unsigned}.${signature}`,
        refreshToken,
        expiresIn: config.accessTtlSec,
      },
    };
  }

  function verifyAccessToken(token) {
    const parts = token.split('.');
    if (parts.length !== 3) authFail('UNAUTHORIZED');
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`);
    if (!safeEqual(parts[2], expected.digest('base64url'))) authFail('UNAUTHORIZED');
    let header;
    let claims;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      authFail('UNAUTHORIZED');
    }
    const valid =
      isPlainObject(header) &&
      header.alg === 'HS256' &&
      isPlainObject(claims) &&
      claims.iss === ISSUER &&
      claims.token_type === 'access' &&
      Number.isInteger(claims.iat) &&
      Number.isInteger(claims.exp) &&
      claims.exp > claims.iat &&
      claims.iat * 1000 <= Date.now() &&
      typeof claims.sub === 'string' &&
      CANONICAL_UUID_RE.test(claims.sub);
    if (!valid) authFail('UNAUTHORIZED');
    if (claims.exp * 1000 <= Date.now()) authFail('TOKEN_EXPIRED');
    return claims.sub;
  }

  /** AccessTokenFilter + 인증 진입점: 헤더 없음/형식 오류/위조 → UNAUTHORIZED, 만료 → TOKEN_EXPIRED. */
  function authenticate(req) {
    const values = headerValues(req, 'authorization');
    const header = values[0] ?? '';
    if (values.length !== 1 || header.slice(0, 7).toLowerCase() !== 'bearer ') {
      authFail('UNAUTHORIZED');
    }
    const token = header.slice(7);
    if (token.trim() === '' || token.includes(' ')) authFail('UNAUTHORIZED');
    const user = state.users.get(verifyAccessToken(token));
    if (!user) authFail('UNAUTHORIZED');
    return user;
  }

  function revokeFamily(userId, familyId) {
    for (const row of state.refreshTokens.values()) {
      if (row.userId === userId && row.familyId === familyId && row.revokedAtMs === null) {
        row.revokedAtMs = Date.now();
      }
    }
  }

  // ----- 계정 -----

  function verifyKakaoToken(token) {
    if (!token.startsWith('mock-kakao-')) fail('KAKAO_TOKEN_INVALID');
    const key = token.slice('mock-kakao-'.length);
    if (key === '' || key === 'invalid') fail('KAKAO_TOKEN_INVALID');
    if (key === 'unavailable') fail('SERVICE_UNAVAILABLE');
    // 카카오 회원번호(양의 정수): 접미사가 숫자면 그대로, 아니면 접미사에서 고정 숫자를 만든다.
    const kakaoId = /^[1-9]\d{0,17}$/.test(key)
      ? key
      : String(parseInt(sha256(`kakao:${key}`).slice(0, 12), 16) + 1);
    return { key, kakaoId, nickname: `테스트${key}`, email: `${key}@example.com` };
  }

  function latestAgreements(userId) {
    const latest = new Map();
    for (const row of state.agreements) if (row.userId === userId) latest.set(row.type, row);
    return [...latest.values()].sort((a, b) => a.id - b.id);
  }

  function missingAgreements(userId) {
    const latest = latestAgreements(userId);
    const current = config.agreementVersions[0];
    return AGREEMENT_TYPES.filter(
      (type) =>
        !latest.some((a) => a.type === type && a.action === 'AGREE' && a.version === current),
    );
  }

  function requireLocationConsent(userId) {
    if (!state.users.has(userId)) fail('UNAUTHORIZED');
    const latest = latestAgreements(userId).find((a) => a.type === 'LOCATION_SERVICE');
    if (!latest || latest.action !== 'AGREE' || latest.version !== config.agreementVersions[0]) {
      fail('LOCATION_CONSENT_REQUIRED');
    }
  }

  const agreementView = (a) => ({
    type: a.type,
    version: a.version,
    action: a.action,
    occurredAt: formatInstant(a.occurredAtMs),
  });

  function activeVehicle(userId) {
    for (const v of state.vehicles.values()) {
      if (v.userId === userId && v.deletedAtUs === null) return v;
    }
    return null;
  }

  const vehicleView = (v) =>
    v
      ? { id: v.id, name: v.name, bluetoothAddress: v.bluetoothAddress, deviceType: v.deviceType }
      : null;

  function deleteUser(userId) {
    const user = state.users.get(userId);
    if (!user) return;
    state.users.delete(userId);
    state.kakaoIndex.delete(user.kakaoKey);
    state.settings.delete(userId);
    state.agreements = state.agreements.filter((a) => a.userId !== userId);
    for (const [hash, row] of state.refreshTokens) {
      if (row.userId === userId) state.refreshTokens.delete(hash);
    }
    for (const [id, v] of state.vehicles) if (v.userId === userId) state.vehicles.delete(id);
    for (const [id, e] of state.events) {
      if (e.userId === userId) {
        state.events.delete(id);
        state.eventKeys.delete(`${userId}|${e.clientEventId}`);
      }
    }
  }

  function findUserByKakao(value) {
    for (const user of state.users.values()) {
      if (user.kakaoKey === value || user.kakaoId === value) return user;
    }
    return null;
  }

  // ----- 판정 -----

  function facilityHits(lat, lng) {
    const priority = (type) => FACILITY_PRIORITY.indexOf(type);
    return FACILITIES.map((f) => ({ f, d: distanceM(lat, lng, f.lat, f.lng) }))
      .filter((hit) => hit.d <= ZONE_RULES[hit.f.zoneType].thresholdM)
      .sort(
        (x, y) =>
          priority(x.f.zoneType) - priority(y.f.zoneType) ||
          x.d - y.d ||
          compareText(x.f.id, y.f.id),
      );
  }

  function modelDescription(weekday, slot, top) {
    const day = DAY_NAMES[weekday - 1];
    if (config.notifyText === 'spec') return `${day} ${SLOT_NAMES[slot]} 기준 신고 상위 ${top}%`;
    return `${day} ${slot * 3}~${(slot + 1) * 3}시 기준 신고 상위 ${top}% (격자 근사값)`;
  }

  function periodLabel(stats) {
    if (!stats.periodStart || !stats.periodEnd) return '';
    if (config.notifyText !== 'spec') return ` (${stats.periodStart} ~ ${stats.periodEnd})`;
    const [y, m1] = stats.periodStart.split('-').map(Number);
    const m2 = Number(stats.periodEnd.split('-')[1]);
    return ` (${y}년 ${m1}~${m2}월)`;
  }

  // ParkingAssessmentEngine: 1·2단계는 status/level 만으로 문구를 채우고 그 밖은 null.
  function notifyText(a, hits) {
    if (a.status === 'SUCCEEDED' && a.level === 1) {
      const rule = ZONE_RULES[hits[0].f.zoneType];
      return {
        title: config.notifyText === 'spec' ? `여기는 ${rule.label} 주변이에요` : rule.title,
        body: `이 근처에서 신고 ${a.stats.reportCount}건${periodLabel(a.stats)}`,
      };
    }
    if (a.status === 'SUCCEEDED' && a.level === 2) {
      return {
        title: '여기는 신고가 잦은 곳이에요',
        body: modelDescription(a.weekday, a.timeSlot, a.stats.topPercent),
      };
    }
    return { title: null, body: null };
  }

  // ParkingNotificationPolicy.decide
  function decide(a, detectedUs, evaluatedUs, settings) {
    if (evaluatedUs > detectedUs + 30n * MINUTE_US || a.status !== 'SUCCEEDED') return 'NONE';
    if (a.level === 1) return 'SEND';
    if (a.level !== 2) return 'NONE';
    if (a.stats.topPercent !== null && a.stats.topPercent <= IMMEDIATE_TOP_PERCENT) return 'SEND';
    if (!settings.cautionEnabled) return 'SUPPRESSED_SETTING';
    const { hour } = kstInfo(detectedUs);
    if ((hour >= 22 || hour < 7) && !settings.nightEnabled) return 'SUPPRESSED_NIGHT';
    return 'SEND';
  }

  function evaluate(event, attempt) {
    const evaluatedUs = nowUs();
    const { lat, lng } = event.confirmed;
    const day = kstInfo(event.detectedUs);
    const holiday = HOLIDAYS.has(day.date);
    const inArea = insideYongin(lat, lng);
    const a = {
      status: 'FAILED',
      level: null,
      predictionStatus: null,
      primaryZoneType: null,
      reasons: [],
      referenceFineAmount: null,
      attemptCount: attempt,
      evaluatedUs,
      weekday: config.modelActive && holiday ? 7 : day.isoWeekday,
      timeSlot: Math.floor(day.hour / 3),
      modelActive: config.modelActive,
      cell: inArea ? cellOf(lat, lng) : null,
      deliveredAtUs: null,
      deliveryFailure: null,
    };
    let topPercent = null;
    let predictedCount = null;
    const hits = facilityHits(lat, lng);
    if (hits.length > 0) {
      Object.assign(a, {
        status: 'SUCCEEDED',
        level: 1,
        predictionStatus: 'SKIPPED',
        primaryZoneType: hits[0].f.zoneType,
        referenceFineAmount: ZONE_RULES[hits[0].f.zoneType].fineAmount,
      });
      a.reasons = hits.map((hit, index) => {
        const rule = ZONE_RULES[hit.f.zoneType];
        return {
          rank: index + 1,
          type: 'FACILITY_RULE',
          zoneType: hit.f.zoneType,
          distanceM: hit.d,
          thresholdM: rule.thresholdM,
          accuracyMarginM: event.original ? event.original.accuracyM : null,
          description: `${rule.label} 법정 거리 이내 (확정 좌표 기준)`,
        };
      });
    } else if (!config.modelActive) {
      Object.assign(a, { status: 'PARTIAL', predictionStatus: 'NO_ACTIVE_VERSION' });
    } else if (!a.cell) {
      Object.assign(a, { status: 'PARTIAL', predictionStatus: 'OUT_OF_AREA' });
    } else {
      const prediction = predictCell(a.cell, a.weekday, a.timeSlot, attempt);
      if (prediction.kind === 'NOT_TARGET') {
        Object.assign(a, { status: 'PARTIAL', predictionStatus: 'NOT_TARGET' });
      } else if (prediction.kind === 'MISSING_ROW') {
        a.predictionStatus = 'MISSING_ROW';
      } else {
        topPercent = prediction.topPercent;
        predictedCount = prediction.predictedCount;
        const level = topPercent <= CAUTION_TOP_PERCENT ? 2 : 3;
        Object.assign(a, { status: 'SUCCEEDED', level, predictionStatus: 'OK' });
        if (level === 2) {
          a.referenceFineAmount = OTHER_FINE_AMOUNT;
          a.reasons = [
            {
              rank: 1,
              type: 'MODEL',
              zoneType: null,
              distanceM: null,
              thresholdM: null,
              accuracyMarginM: null,
              description: modelDescription(a.weekday, a.timeSlot, topPercent),
            },
          ];
        }
      }
    }
    const reportCount = a.cell ? cellReportCount(a.cell) : 0;
    a.stats = {
      reportCount,
      reportRadiusM: REPORT_RADIUS_M,
      periodStart: reportCount > 0 ? DATA_PERIOD.start : null,
      periodEnd: reportCount > 0 ? DATA_PERIOD.end : null,
      predictedCount,
      topPercent,
    };
    const settings = state.settings.get(event.userId) ?? {
      cautionEnabled: true,
      nightEnabled: false,
    };
    a.notify = {
      decision: decide(a, event.detectedUs, evaluatedUs, settings),
      ...notifyText(a, hits),
    };
    event.assessment = a;
  }

  function peakOf(a) {
    if (!a.modelActive || !a.cell) return null;
    const counts = cellSlotCounts(a.cell, a.weekday);
    if (!counts) return null;
    let best = 0;
    for (let i = 1; i < counts.length; i += 1) if (counts[i] > counts[best]) best = i;
    return { weekday: a.weekday, timeSlot: best, slotCounts: [...counts] };
  }

  function assessmentView(event, withPeak) {
    const a = event.assessment;
    const stats = { ...a.stats };
    if (withPeak) stats.peak = peakOf(a);
    return {
      status: a.status,
      level: a.level,
      predictionStatus: a.predictionStatus,
      primaryZoneType: a.primaryZoneType,
      reasons: a.reasons.map((r) => ({ ...r })),
      stats,
      referenceFineAmount: a.referenceFineAmount,
      attemptCount: a.attemptCount,
      notify: {
        decision: a.notify.decision,
        expiresAt: formatKst(event.detectedUs + 30n * MINUTE_US),
        title: a.notify.title,
        body: a.notify.body,
      },
      evaluatedAt: formatKst(a.evaluatedUs),
    };
  }

  const eventView = (e) => ({
    id: e.id,
    detectedAt: formatKst(e.detectedUs),
    confirmedLocation: { lat: e.confirmed.lat, lng: e.confirmed.lng },
    address: e.address,
    vehicleName: e.vehicleName,
  });

  function userEvents(userId) {
    return [...state.events.values()]
      .filter((e) => e.userId === userId)
      .sort((x, y) =>
        x.detectedUs === y.detectedUs
          ? compareText(y.id, x.id)
          : x.detectedUs < y.detectedUs
            ? 1
            : -1,
      );
  }

  function ownedEvent(userId, id) {
    const event = state.events.get(id);
    if (!event || event.userId !== userId) fail('PARKING_EVENT_NOT_FOUND');
    return event;
  }

  function scheduleGeocode(event) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      const current = state.events.get(event.id);
      if (current === event && current.address === null) {
        current.address = fakeAddress(current.confirmed.lat, current.confirmed.lng);
      }
    }, config.geocodeDelayMs);
    timer.unref();
    timers.add(timer);
  }

  // ----- 주차 요청 파싱·검증 (ParkingRequest) -----

  function uuidField(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || !UUID_RE.test(value)) fail('INVALID_INPUT');
    return value.toLowerCase();
  }

  function timeField(value) {
    if (value === undefined || value === null) return null;
    const us = parseOffsetDateTime(value);
    if (us === null) fail('INVALID_INPUT');
    return us;
  }

  function objectField(value) {
    if (value === undefined || value === null) return null;
    if (!isPlainObject(value)) fail('INVALID_INPUT');
    return value;
  }

  function numberField(holder, key, sources) {
    const value = holder[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_INPUT');
    return { value, source: numberSource(sources, holder, key) };
  }

  function parseParkingRequest(body, sources) {
    if (!isPlainObject(body)) fail('INVALID_INPUT');
    for (const key of Object.keys(body)) if (!PARKING_FIELDS.has(key)) fail('INVALID_INPUT');
    const method = body.confirmationMethod ?? null;
    if (method !== null && !CONFIRMATION_METHODS.includes(method)) fail('INVALID_INPUT');
    let remeasureCount = null;
    if (body.remeasureCount !== undefined && body.remeasureCount !== null) {
      const source = numberSource(sources, body, 'remeasureCount');
      if (typeof body.remeasureCount !== 'number' || !/^-?\d+$/.test(source)) fail('INVALID_INPUT');
      remeasureCount = body.remeasureCount;
    }
    const point = (o) => ({
      lat: numberField(o, 'lat', sources),
      lng: numberField(o, 'lng', sources),
    });
    const original = objectField(body.originalLocation);
    const last = objectField(body.lastKnownLocation);
    const confirmed = objectField(body.confirmedLocation);
    return {
      clientEventId: uuidField(body.clientEventId),
      vehicleId: uuidField(body.vehicleId),
      detectedUs: timeField(body.detectedAt),
      confirmedUs: timeField(body.confirmedAt),
      confirmationMethod: method,
      originalLocation: original && {
        ...point(original),
        accuracyM: numberField(original, 'accuracyM', sources),
      },
      lastKnownLocation: last && { ...point(last), atUs: timeField(last.at) },
      confirmedLocation: confirmed && point(confirmed),
      remeasureCount,
    };
  }

  function requireCoordinate(p) {
    if (!p.lat || !p.lng) fail('INVALID_INPUT');
    const { value: lat } = p.lat;
    const { value: lng } = p.lng;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) fail('INVALID_INPUT');
  }

  // ParkingRequest.validate 순서: 입력 오류(400 INVALID_INPUT) → 시간 순서 → AUTO
  function validateParkingRequest(r) {
    const required =
      r.clientEventId &&
      r.vehicleId &&
      r.detectedUs !== null &&
      r.confirmedUs !== null &&
      r.confirmationMethod &&
      r.confirmedLocation &&
      r.remeasureCount !== null;
    if (!required || r.remeasureCount < 0 || r.remeasureCount > 10) fail('INVALID_INPUT');
    requireCoordinate(r.confirmedLocation);
    if (r.originalLocation) {
      requireCoordinate(r.originalLocation);
      const accuracy = r.originalLocation.accuracyM;
      if (!accuracy || !(accuracy.value >= 0)) fail('INVALID_INPUT');
    }
    if (r.lastKnownLocation) {
      requireCoordinate(r.lastKnownLocation);
      const at = r.lastKnownLocation.atUs;
      if (at === null || at > r.detectedUs || at < r.detectedUs - 10n * MINUTE_US) {
        fail('INVALID_INPUT');
      }
    }
    if (r.confirmedUs < r.detectedUs) fail('INVALID_TIME_ORDER');
    if (r.confirmationMethod === 'AUTO' && !r.originalLocation) fail('AUTO_CONFIRM_NOT_ALLOWED');
  }

  // 해시: 키 순서 무관, 같은 순간은 같은 값, 좌표는 소수 7자리 반올림 (ParkingRequest.requestHash)
  function normalizeParkingRequest(r) {
    const point = (p) => {
      const lat = roundScale7(p.lat.source);
      const lng = roundScale7(p.lng.source);
      return { lat: lat.value, lng: lng.value, key: `${lat.text},${lng.text}` };
    };
    const confirmed = point(r.confirmedLocation);
    const original = r.originalLocation && {
      ...point(r.originalLocation),
      accuracyM: r.originalLocation.accuracyM.value,
      accuracyKey: canonicalDecimal(r.originalLocation.accuracyM.source),
    };
    const last = r.lastKnownLocation && {
      ...point(r.lastKnownLocation),
      atUs: r.lastKnownLocation.atUs,
    };
    const canonical = [
      'parking-v1',
      r.clientEventId,
      r.vehicleId,
      String(r.detectedUs),
      String(r.confirmedUs),
      r.confirmationMethod,
      original ? `${original.key},${original.accuracyKey}` : 'null',
      last ? `${last.key},${last.atUs}` : 'null',
      confirmed.key,
      String(r.remeasureCount),
    ].join('|');
    return { ...r, confirmed, original, last, hash: sha256(canonical) };
  }

  // ----- 핸들러: 공통·인증 -----

  const health = () => ok({ status: 'UP' });

  async function authKakao(ctx) {
    const body = await readJsonObject(ctx);
    const token = body.kakaoAccessToken;
    const deviceInfo = body.deviceInfo ?? null;
    const tokenValid =
      typeof token === 'string' &&
      token.trim() !== '' &&
      token.length <= 4096 &&
      /^[!-~]+$/.test(token);
    const deviceValid =
      deviceInfo === null || (typeof deviceInfo === 'string' && deviceInfo.length <= 200);
    if (!tokenValid || !deviceValid) fail('INVALID_INPUT');
    const profile = verifyKakaoToken(token);
    let user = state.users.get(state.kakaoIndex.get(profile.key));
    const isNewUser = !user;
    if (!user) {
      user = { id: randomUUID(), kakaoKey: profile.key, kakaoId: profile.kakaoId };
      state.users.set(user.id, user);
      state.kakaoIndex.set(profile.key, user.id);
    }
    Object.assign(user, {
      nickname: profile.nickname,
      email: profile.email,
      profileImageUrl: null,
      lastLoginAtMs: nowMs(),
    });
    if (!state.settings.has(user.id)) {
      state.settings.set(user.id, { cautionEnabled: true, nightEnabled: false });
    }
    const { response } = issueTokens(user.id, randomUUID(), deviceInfo);
    return ok({
      ...response,
      isNewUser,
      user: { id: user.id, nickname: user.nickname, profileImageUrl: user.profileImageUrl },
      agreements: { missing: missingAgreements(user.id) },
    });
  }

  async function readRefreshToken(ctx) {
    const body = await readJsonObject(ctx);
    const token = body.refreshToken;
    if (typeof token !== 'string' || token.trim() === '' || token.length > 256) {
      fail('INVALID_INPUT');
    }
    return token;
  }

  async function authRefresh(ctx) {
    const row = state.refreshTokens.get(sha256(await readRefreshToken(ctx)));
    if (!row || !state.users.has(row.userId)) fail('UNAUTHORIZED');
    if (row.revokedAtMs !== null) {
      // 재사용: 같은 family 전체를 먼저 폐기하고 401
      revokeFamily(row.userId, row.familyId);
      fail('TOKEN_REUSED');
    }
    if (row.expiresAtMs <= Date.now()) fail('UNAUTHORIZED');
    const issued = issueTokens(row.userId, row.familyId, row.deviceInfo);
    row.revokedAtMs = Date.now();
    row.replacedById = issued.row.id;
    return ok(issued.response);
  }

  async function authLogout(ctx) {
    const row = state.refreshTokens.get(sha256(await readRefreshToken(ctx)));
    if (!row) fail('UNAUTHORIZED');
    if (row.userId !== ctx.user.id) fail('FORBIDDEN');
    revokeFamily(row.userId, row.familyId);
    return noContent();
  }

  function getMe(ctx) {
    const user = ctx.user;
    return ok({
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      hasVehicle: activeVehicle(user.id) !== null,
      agreements: latestAgreements(user.id).map(agreementView),
    });
  }

  async function postAgreement(ctx) {
    const body = await readJsonObject(ctx);
    const { type, version, action } = body;
    const versionValid =
      typeof version === 'string' && version.trim() !== '' && version.length <= 20;
    if (!AGREEMENT_TYPES.includes(type) || !versionValid || !AGREEMENT_ACTIONS.includes(action)) {
      fail('INVALID_INPUT');
    }
    if (action === 'AGREE' && !config.agreementVersions.includes(version)) fail('INVALID_INPUT');
    // 위치 동의 철회는 이번 범위에서 503 (명세 8절 #4)
    if (type === 'LOCATION_SERVICE' && action === 'WITHDRAW') fail('SERVICE_UNAVAILABLE');
    state.agreementSeq += 1;
    const row = {
      id: state.agreementSeq,
      userId: ctx.user.id,
      type,
      version,
      action,
      occurredAtMs: nowMs(),
    };
    state.agreements.push(row);
    return ok(agreementView(row), 201);
  }

  function deleteMe(ctx) {
    // 실제 서버는 카카오 연결 끊기를 먼저 시도한다(실패해도 삭제 진행). 목은 생략.
    deleteUser(ctx.user.id);
    return noContent();
  }

  async function readWebhookFields(ctx) {
    const type = mediaType(ctx.req.headers['content-type']);
    const raw = await ctx.rawBody();
    if (type !== 'application/x-www-form-urlencoded' && type !== 'application/json') {
      fail('UNSUPPORTED_MEDIA_TYPE');
    }
    const text = decodeUtf8(raw);
    if (text.trim() === '') fail('INVALID_INPUT');
    const fields = new Map();
    if (type === 'application/json') {
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        fail('INVALID_INPUT');
      }
      if (!isPlainObject(body)) fail('INVALID_INPUT');
      for (const [key, value] of Object.entries(body)) {
        const list = Array.isArray(value) ? value : [value];
        fields.set(
          key,
          list.filter((v) => v !== null && v !== undefined).map((v) => String(v)),
        );
      }
    } else {
      const form = new URLSearchParams(text);
      for (const key of new Set(form.keys())) fields.set(key, form.getAll(key));
    }
    return fields;
  }

  function webhookField(fields, name) {
    const values = fields.get(name);
    if (!values || values.length !== 1 || values[0].trim() === '') fail('INVALID_INPUT');
    return values[0];
  }

  async function kakaoUnlink(ctx) {
    const fields = await readWebhookFields(ctx);
    const authorization = headerValues(ctx.req, 'authorization');
    if (authorization.length !== 1) fail('UNAUTHORIZED');
    const appId = webhookField(fields, 'app_id');
    if (!safeEqual(authorization[0], `KakaoAK ${config.kakaoAdminKey}`)) fail('UNAUTHORIZED');
    if (appId !== config.kakaoAppId) return noContent(200);
    const kakaoUserId = webhookField(fields, 'user_id');
    webhookField(fields, 'referrer_type');
    const user = findUserByKakao(kakaoUserId);
    if (user) deleteUser(user.id);
    return noContent(200);
  }

  // ----- 핸들러: 차량·알림 설정 -----

  const getVehicle = (ctx) => ok({ vehicle: vehicleView(activeVehicle(ctx.user.id)) });

  async function putVehicle(ctx) {
    const body = await readJsonObject(ctx);
    const { name, bluetoothAddress } = body;
    const deviceType = body.deviceType ?? null;
    const codePoints = (s) => [...s].length;
    const nameValid = typeof name === 'string' && name.trim() !== '' && codePoints(name) <= 100;
    const typeValid =
      deviceType === null || (typeof deviceType === 'string' && codePoints(deviceType) <= 50);
    if (
      !nameValid ||
      !typeValid ||
      (bluetoothAddress !== null && typeof bluetoothAddress === 'object')
    ) {
      fail('INVALID_INPUT');
    }
    if (typeof bluetoothAddress !== 'string' || !MAC_RE.test(bluetoothAddress)) {
      fail('INVALID_BLUETOOTH_ADDRESS');
    }
    let vehicle = activeVehicle(ctx.user.id);
    if (vehicle && vehicle.bluetoothAddress === bluetoothAddress) {
      Object.assign(vehicle, { name, deviceType });
    } else {
      if (vehicle) vehicle.deletedAtUs = nowUs();
      vehicle = {
        id: randomUUID(),
        userId: ctx.user.id,
        name,
        bluetoothAddress,
        deviceType,
        deletedAtUs: null,
      };
      state.vehicles.set(vehicle.id, vehicle);
    }
    return ok({ vehicle: vehicleView(vehicle) });
  }

  function settingsView(userId) {
    const s = state.settings.get(userId);
    if (!s) fail('NOT_FOUND');
    return { dangerEnabled: true, cautionEnabled: s.cautionEnabled, nightEnabled: s.nightEnabled };
  }

  const getSettings = (ctx) => ok(settingsView(ctx.user.id));

  async function patchSettings(ctx) {
    const { value: patch } = await readJson(ctx);
    if (!isPlainObject(patch)) fail('INVALID_INPUT');
    const changes = {};
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value !== 'boolean') fail('INVALID_INPUT');
      if (key !== 'cautionEnabled' && key !== 'nightEnabled') fail('INVALID_INPUT');
      changes[key] = value;
    }
    settingsView(ctx.user.id);
    Object.assign(state.settings.get(ctx.user.id), changes);
    return ok(settingsView(ctx.user.id));
  }

  // ----- 핸들러: 주차 이벤트 -----

  async function postParkingEvent(ctx) {
    const { value, sources } = await readJson(ctx, true);
    const parsed = parseParkingRequest(value, sources);
    validateParkingRequest(parsed);
    const request = normalizeParkingRequest(parsed);
    const userId = ctx.user.id;
    requireLocationConsent(userId);
    const existingId = state.eventKeys.get(`${userId}|${request.clientEventId}`);
    if (existingId) {
      // 기존 키: 차량·미래 시각·보정 거리는 다시 보지 않는다.
      const event = state.events.get(existingId);
      if (event.requestHash !== request.hash) fail('IDEMPOTENCY_KEY_REUSED');
      if (event.assessment.status === 'FAILED' && event.assessment.attemptCount < 2) {
        evaluate(event, 2);
      }
      return ok({
        parkingEventId: event.id,
        address: event.address,
        assessment: assessmentView(event, false),
      });
    }
    if (request.detectedUs > nowUs() + 2n * MINUTE_US) fail('INVALID_TIME');
    const reference = request.original ?? request.last;
    if (reference) {
      const { lat, lng } = request.confirmed;
      if (distanceM(reference.lat, reference.lng, lat, lng) > 200) fail('ADJUST_DISTANCE_EXCEEDED');
    }
    const vehicle = state.vehicles.get(request.vehicleId);
    if (!vehicle || vehicle.userId !== userId || vehicle.deletedAtUs !== null) {
      fail('VEHICLE_NOT_FOUND');
    }
    const event = {
      id: randomUUID(),
      userId,
      clientEventId: request.clientEventId,
      requestHash: request.hash,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      detectedUs: request.detectedUs,
      confirmedUs: request.confirmedUs,
      confirmationMethod: request.confirmationMethod,
      original: request.original,
      last: request.last,
      confirmed: { lat: request.confirmed.lat, lng: request.confirmed.lng },
      remeasureCount: request.remeasureCount,
      address: null,
      assessment: null,
    };
    state.events.set(event.id, event);
    state.eventKeys.set(`${userId}|${event.clientEventId}`, event.id);
    evaluate(event, 1);
    scheduleGeocode(event);
    return ok(
      { parkingEventId: event.id, address: null, assessment: assessmentView(event, false) },
      201,
    );
  }

  function latestParkingEvent(ctx) {
    const [event] = userEvents(ctx.user.id);
    const a = event?.assessment;
    return ok({
      event: event ? eventView(event) : null,
      assessment: a
        ? { status: a.status, level: a.level, predictionStatus: a.predictionStatus }
        : null,
      dataPeriod: config.modelActive ? { ...DATA_PERIOD } : null,
    });
  }

  function listParkingEvents(ctx) {
    const level = param(ctx, 'level') ?? 'ALL';
    const limitText = param(ctx, 'limit');
    if (limitText !== null && !/^[0-9]+$/.test(limitText)) fail('INVALID_INPUT');
    const limit = limitText === null ? 50 : Number(limitText);
    if (!['ALL', '1', '2'].includes(level) || limit < 1 || limit > 100) fail('INVALID_INPUT');
    const items = userEvents(ctx.user.id)
      .filter((e) => level === 'ALL' || e.assessment.level === Number(level))
      .slice(0, limit)
      .map((e) => {
        const a = e.assessment;
        return {
          event: { id: e.id, detectedAt: formatKst(e.detectedUs), address: e.address },
          assessment: {
            status: a.status,
            level: a.level,
            predictionStatus: a.predictionStatus,
            primaryZoneType: a.primaryZoneType,
            distanceM: a.level === 1 ? (a.reasons[0]?.distanceM ?? null) : null,
            referenceFineAmount: a.referenceFineAmount,
            topPercent: a.level === 2 ? a.stats.topPercent : null,
          },
        };
      });
    return ok({ items });
  }

  function getParkingEvent(ctx) {
    const event = ownedEvent(ctx.user.id, pathUuid(ctx.params.id));
    return ok({ event: eventView(event), assessment: assessmentView(event, true) });
  }

  async function patchDelivery(ctx) {
    const id = pathUuid(ctx.params.id);
    const body = await readJsonObject(ctx);
    const failure = body.failure ?? null;
    let deliveredUs = null;
    if (body.deliveredAt !== undefined && body.deliveredAt !== null) {
      deliveredUs = parseOffsetDateTime(body.deliveredAt);
      if (deliveredUs === null) fail('INVALID_INPUT');
    }
    if (
      (deliveredUs === null) === (failure === null) ||
      (failure !== null && !DELIVERY_FAILURES.includes(failure))
    ) {
      fail('INVALID_INPUT');
    }
    const event = ownedEvent(ctx.user.id, id);
    if (
      deliveredUs !== null &&
      (deliveredUs < event.confirmedUs || deliveredUs > nowUs() + 2n * MINUTE_US)
    ) {
      fail('INVALID_INPUT');
    }
    const a = event.assessment;
    if (a.notify.decision !== 'SEND') fail('DELIVERY_NOT_EXPECTED');
    if (a.deliveredAtUs !== null) return noContent(); // 최초 성공 유지
    if (deliveredUs !== null) {
      a.deliveredAtUs = deliveredUs;
      a.deliveryFailure = null;
    } else if (a.deliveryFailure === null) {
      a.deliveryFailure = failure; // 최초 실패 유지
    }
    return noContent();
  }

  // ----- 핸들러: 주변 주차장·지도 -----

  function nearbyLots(ctx) {
    const lat = doubleParam(ctx, 'lat');
    const lng = doubleParam(ctx, 'lng');
    const radius = intParam(ctx, 'radius', 500);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || radius <= 0 || radius > 1000) {
      fail('INVALID_INPUT');
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) fail('INVALID_INPUT');
    requireLocationConsent(ctx.user.id);
    const today = kstInfo(nowUs());
    const column =
      today.isoWeekday === 7 || HOLIDAYS.has(today.date)
        ? 'holiday'
        : today.isoWeekday === 6
          ? 'saturday'
          : 'weekday';
    const candidates = PARKING_LOTS.map((lot) => ({
      lot,
      distance: distanceM(lat, lng, lot.lat, lot.lng),
    })).filter((c) => c.distance <= (radius === 500 ? 1000 : radius));
    const within = candidates.filter((c) => c.distance <= radius);
    const expanded = radius === 500 && within.length === 0;
    const items = (expanded ? candidates : within)
      .sort((x, y) => x.distance - y.distance || compareText(x.lot.id, y.lot.id))
      .map(({ lot, distance }) => ({
        id: lot.id,
        name: lot.name,
        address: lot.address,
        distanceM: distance,
        location: { lat: lot.lat, lng: lot.lng },
        parkingType: lot.parkingType,
        feeType: lot.feeType,
        feeInfo: lot.feeInfo,
        operatingHours: lot.hours[column] ? lot.hours[column].join('-') : null,
        capacity: lot.capacity,
      }));
    return ok({ radiusM: expanded ? 1000 : radius, expanded, items });
  }

  function withinTwoKm(b) {
    const width = (lat) => {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        const from = b.minLng + ((b.maxLng - b.minLng) * k) / 4;
        const to = b.minLng + ((b.maxLng - b.minLng) * (k + 1)) / 4;
        sum += distanceM(lat, from, lat, to);
      }
      return sum;
    };
    const height = distanceM(b.minLat, b.minLng, b.maxLat, b.minLng);
    return Math.max(width(b.minLat), width(b.maxLat), height) <= 2000;
  }

  function distanceToBox(lat, lng, b) {
    const clampedLat = Math.min(Math.max(lat, b.minLat), b.maxLat);
    const clampedLng = Math.min(Math.max(lng, b.minLng), b.maxLng);
    return distanceM(lat, lng, clampedLat, clampedLng);
  }

  function riskZones(ctx) {
    const b = {
      minLat: doubleParam(ctx, 'minLat'),
      minLng: doubleParam(ctx, 'minLng'),
      maxLat: doubleParam(ctx, 'maxLat'),
      maxLng: doubleParam(ctx, 'maxLng'),
    };
    const atText = param(ctx, 'at');
    let atUs = null;
    if (atText !== null && atText !== '') {
      atUs = parseOffsetDateTime(atText);
      if (atUs === null) fail('INVALID_INPUT');
    }
    const finite = Object.values(b).every((v) => Number.isFinite(v));
    if (
      !finite ||
      b.minLat < -90 ||
      b.maxLat > 90 ||
      b.minLng < -180 ||
      b.maxLng > 180 ||
      b.minLat > b.maxLat ||
      b.minLng > b.maxLng ||
      !withinTwoKm(b)
    ) {
      fail('INVALID_INPUT');
    }
    const day = kstInfo(atUs ?? nowUs());
    const slot = {
      weekday: config.modelActive && HOLIDAYS.has(day.date) ? 7 : day.isoWeekday,
      timeSlot: Math.floor(day.hour / 3),
    };
    const facilityZones = FACILITIES.filter(
      (f) => distanceToBox(f.lat, f.lng, b) <= ZONE_RULES[f.zoneType].thresholdM,
    )
      .sort((x, y) => compareText(x.zoneType, y.zoneType) || compareText(x.id, y.id))
      .map((f) => ({
        zoneType: f.zoneType,
        location: { lat: f.lat, lng: f.lng },
        radiusM: ZONE_RULES[f.zoneType].thresholdM,
      }));
    if (!config.modelActive) return ok({ facilityZones, cells: [], slot, dataPeriod: null });
    const cells = HOT_CELLS.map((cell) => ({
      cell,
      ...hotValues(cell, slot.weekday, slot.timeSlot),
    }))
      .filter((c) => {
        if (c.topPercent > CAUTION_TOP_PERCENT) return false;
        const cb = cellBounds(c.cell);
        return (
          cb.minLat <= b.maxLat &&
          cb.maxLat >= b.minLat &&
          cb.minLng <= b.maxLng &&
          cb.maxLng >= b.minLng
        );
      })
      .sort((x, y) => x.cell.id - y.cell.id)
      .map((c) => ({
        location: cellCenter(c.cell),
        sizeM: CELL_SIZE_M,
        topPercent: c.topPercent,
        reportCount: c.cell.reportCount,
      }));
    return ok({ facilityZones, cells, slot, dataPeriod: { ...DATA_PERIOD } });
  }

  // ----- 라우팅 -----

  const routes = [
    ['GET', '/health', health],
    ['POST', '/auth/kakao', authKakao],
    ['POST', '/auth/refresh', authRefresh],
    ['POST', '/auth/logout', authLogout],
    ['GET', '/me', getMe],
    ['DELETE', '/me', deleteMe],
    ['POST', '/me/agreements', postAgreement],
    ['POST', '/webhooks/kakao/unlink', kakaoUnlink],
    ['GET', '/vehicle', getVehicle],
    ['PUT', '/vehicle', putVehicle],
    ['GET', '/notification-settings', getSettings],
    ['PATCH', '/notification-settings', patchSettings],
    ['POST', '/parking-events', postParkingEvent],
    ['GET', '/parking-events', listParkingEvents],
    ['GET', '/parking-events/latest', latestParkingEvent],
    ['GET', '/parking-events/:id', getParkingEvent],
    ['PATCH', '/parking-events/:id/delivery', patchDelivery],
    ['GET', '/parking-lots/nearby', nearbyLots],
    ['GET', '/map/risk-zones', riskZones],
  ].map(([method, pattern, handler]) => ({
    method,
    handler,
    re: new RegExp(`^${API}${pattern.replace(/:id/g, '([^/]+)')}$`),
  }));

  function matchRoute(method, pathname) {
    const allowed = [];
    for (const route of routes) {
      const m = route.re.exec(pathname);
      if (!m) continue;
      if (route.method === method) return { route, params: { id: m[1] }, allowed };
      if (!allowed.includes(route.method)) allowed.push(route.method);
    }
    return { route: null, params: null, allowed };
  }

  // ----- 개발용 /__mock -----

  const clockView = () => ({
    now: formatKst(nowUs()),
    offsetMs: state.clockOffsetMs,
    realNow: formatKst(BigInt(Date.now()) * 1000n),
  });

  function setClock(body) {
    if (body.now !== undefined) {
      const us = parseOffsetDateTime(body.now);
      if (us === null) fail('INVALID_INPUT');
      state.clockOffsetMs = Number(floorDiv(us, 1000n)) - Date.now();
    } else if (body.offsetMs !== undefined) {
      if (typeof body.offsetMs !== 'number' || !Number.isFinite(body.offsetMs))
        fail('INVALID_INPUT');
      state.clockOffsetMs = Math.trunc(body.offsetMs);
    } else {
      state.clockOffsetMs = 0;
    }
    return ok(clockView());
  }

  function stateView() {
    return {
      clock: clockView(),
      users: [...state.users.values()].map((u) => ({
        id: u.id,
        kakaoUserId: u.kakaoKey,
        kakaoId: u.kakaoId,
        nickname: u.nickname,
        email: u.email,
        settings: state.settings.get(u.id) ?? null,
        missingAgreements: missingAgreements(u.id),
        vehicle: vehicleView(activeVehicle(u.id)),
      })),
      events: [...state.events.values()].map((e) => ({
        id: e.id,
        userId: e.userId,
        clientEventId: e.clientEventId,
        detectedAt: formatKst(e.detectedUs),
        address: e.address,
        vehicleName: e.vehicleName,
        status: e.assessment.status,
        level: e.assessment.level,
        predictionStatus: e.assessment.predictionStatus,
        decision: e.assessment.notify.decision,
        attemptCount: e.assessment.attemptCount,
        deliveredAt:
          e.assessment.deliveredAtUs === null ? null : formatKst(e.assessment.deliveredAtUs),
        deliveryFailure: e.assessment.deliveryFailure,
      })),
    };
  }

  const devIndex = () => ({
    endpoints: {
      'GET /__mock': '이 안내',
      'GET /__mock/requests': '최근 요청 200개 (최신순)',
      'POST /__mock/reset': '모든 상태 초기화 (시계 포함)',
      'GET /__mock/clock': '목 서버 현재 시각',
      'POST /__mock/clock': '{"now":"ISO"} | {"offsetMs":n} | {} (실제 시각으로 복귀)',
      'GET /__mock/state': '사용자·차량·이벤트·알림 표시 보고 요약 (토큰 제외)',
    },
    kakaoTokens:
      'mock-kakao-<id> = 사용자 <id>, mock-kakao-invalid → 401, mock-kakao-unavailable → 503',
    agreementVersion: config.agreementVersions[0],
    demoPlaces: DEMO_PLACES,
    config: {
      accessTtlSec: config.accessTtlSec,
      refreshTtlSec: config.refreshTtlSec,
      geocodeDelayMs: config.geocodeDelayMs,
      kakaoAppId: config.kakaoAppId,
      modelActive: config.modelActive,
      notifyText: config.notifyText,
    },
  });

  async function readDevJson(ctx) {
    const text = decodeUtf8(await ctx.rawBody());
    if (text.trim() === '') return {};
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      fail('INVALID_INPUT');
    }
    if (!isPlainObject(body)) fail('INVALID_INPUT');
    return body;
  }

  async function devRoute(ctx, method, pathname) {
    const table = {
      '/__mock': { GET: () => ok(devIndex()) },
      '/__mock/requests': { GET: () => ok({ items: [...requestLog].reverse() }) },
      '/__mock/reset': {
        POST: () => {
          reset();
          return ok({ reset: true });
        },
      },
      '/__mock/clock': {
        GET: () => ok(clockView()),
        POST: async () => setClock(await readDevJson(ctx)),
      },
      '/__mock/state': { GET: () => ok(stateView()) },
    };
    const entry = table[pathname];
    if (!entry) fail('NOT_FOUND');
    if (!entry[method]) fail('METHOD_NOT_ALLOWED', { Allow: Object.keys(entry).join(', ') });
    return entry[method]();
  }

  // ----- 요청 처리 -----

  async function dispatch(req, url) {
    const method = req.method ?? 'GET';
    const pathname = url.pathname;
    let bodyPromise;
    const ctx = {
      req,
      query: url.searchParams,
      params: {},
      user: null,
      rawBody: () => {
        bodyPromise ??= readRawBody(req);
        return bodyPromise;
      },
    };
    if (method === 'OPTIONS')
      return { status: 204, empty: true, headers: { 'Access-Control-Max-Age': '600' } };
    if (pathname === '/__mock' || pathname.startsWith('/__mock/')) {
      return devRoute(ctx, method, pathname);
    }
    if (!PUBLIC_ROUTES.has(`${method} ${pathname}`)) ctx.user = authenticate(req);
    const { route, params, allowed } = matchRoute(method, pathname);
    if (!route) {
      if (allowed.length > 0) fail('METHOD_NOT_ALLOWED', { Allow: allowed.join(', ') });
      fail('NOT_FOUND');
    }
    ctx.params = params;
    return route.handler(ctx);
  }

  function writeResponse(res, status, headers, body) {
    if (res.headersSent) return;
    const all = { ...CORS_HEADERS, ...headers };
    if (body === undefined) {
      res.writeHead(status, all);
      res.end();
      return;
    }
    const text = JSON.stringify(body);
    res.writeHead(status, {
      ...all,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
  }

  async function handle(req, res) {
    const started = performance.now();
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://mock.local');
    } catch {
      url = new URL('http://mock.local/');
    }
    let errorCode = null;
    res.on('finish', () => {
      const ms = Math.round(performance.now() - started);
      // 경로만 기록한다(쿼리·본문·토큰은 남기지 않음).
      if (config.log) console.log(`${req.method} ${url.pathname} ${res.statusCode} ${ms}ms`);
      if (url.pathname === '/__mock' || url.pathname.startsWith('/__mock/')) return;
      requestLog.push({
        time: formatKst(BigInt(Date.now()) * 1000n),
        method: req.method,
        path: url.pathname + url.search,
        status: res.statusCode,
        errorCode,
        durationMs: ms,
      });
      if (requestLog.length > 200) requestLog.shift();
    });
    try {
      const result = await dispatch(req, url);
      const body = result.empty ? undefined : { success: true, data: result.data, error: null };
      writeResponse(res, result.status, result.headers ?? {}, body);
    } catch (error) {
      let code = 'INTERNAL_SERVER_ERROR';
      if (error instanceof ApiError) code = error.code;
      else console.error('[mock-api] unexpected error:', error);
      errorCode = code;
      const [status, message] = ERRORS[code];
      writeResponse(res, status, error instanceof ApiError ? (error.headers ?? {}) : {}, {
        success: false,
        data: null,
        error: { code, message },
      });
    }
  }

  function reset() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    state = freshState();
    requestLog = [];
  }

  function close() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }

  return { handle, reset, close };
}

// ---------- 설정·실행 ----------

function intSetting(name, raw, fallback, min, max = Number.MAX_SAFE_INTEGER) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function configFromEnv(env) {
  const versions = (env.MOCK_AGREEMENT_VERSIONS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return {
    port: intSetting('MOCK_API_PORT', env.MOCK_API_PORT, 4000, 0, 65535),
    host: env.MOCK_API_HOST || undefined,
    accessTtlSec: intSetting('MOCK_ACCESS_TTL_SEC', env.MOCK_ACCESS_TTL_SEC, 1800, 1),
    refreshTtlSec: intSetting('MOCK_REFRESH_TTL_SEC', env.MOCK_REFRESH_TTL_SEC, 30 * 24 * 3600, 1),
    geocodeDelayMs: intSetting('MOCK_GEOCODE_DELAY_MS', env.MOCK_GEOCODE_DELAY_MS, 1500, 0),
    kakaoAdminKey: env.MOCK_KAKAO_ADMIN_KEY || 'mock-admin-key',
    kakaoAppId: env.MOCK_KAKAO_APP_ID || 'mock-app-id',
    agreementVersions: versions.length > 0 ? [...new Set(versions)] : ['2026-11-06-v1'],
    modelActive: !['0', 'false', 'off'].includes((env.MOCK_MODEL_ACTIVE ?? '').toLowerCase()),
    notifyText: env.MOCK_NOTIFY_TEXT === 'spec' ? 'spec' : 'backend',
    log: true,
  };
}

/** 프로그램에서 띄울 때(contract-check 등). overrides 가 환경 변수보다 우선한다. */
export async function startMockServer(overrides = {}) {
  const config = { ...configFromEnv(process.env), ...overrides };
  const app = createApp(config);
  const server = http.createServer((req, res) => {
    app.handle(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    const done = () => {
      server.off('error', reject);
      resolve();
    };
    if (config.host) server.listen(config.port, config.host, done);
    else server.listen(config.port, done);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  return {
    port,
    url: `http://localhost:${port}`,
    config,
    reset: app.reset,
    close: () =>
      new Promise((resolve) => {
        app.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
const self = fileURLToPath(import.meta.url);
const isMain =
  process.platform === 'win32' ? entry.toLowerCase() === self.toLowerCase() : entry === self;

if (isMain) {
  try {
    const instance = await startMockServer();
    const c = instance.config;
    console.log(`[mock-api] listening on ${instance.url}${API}`);
    console.log(
      `[mock-api] accessTtl=${c.accessTtlSec}s refreshTtl=${c.refreshTtlSec}s geocodeDelay=${c.geocodeDelayMs}ms ` +
        `agreementVersion=${c.agreementVersions[0]} kakaoAppId=${c.kakaoAppId} modelActive=${c.modelActive} ` +
        `notifyText=${c.notifyText}`,
    );
    console.log('[mock-api] kakaoAccessToken: mock-kakao-<id>  |  dev helpers: GET /__mock');
    const stop = () => {
      instance.close().finally(() => process.exit(0));
      setTimeout(() => process.exit(0), 1000).unref();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (error) {
    console.error(`[mock-api] failed to start: ${error.message}`);
    process.exit(1);
  }
}
