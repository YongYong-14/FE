// 목 서버 계약·흐름 자동 점검. HTTP로만 확인한다.
//   node scripts/mock-api/contract-check.mjs          → API_BASE_URL (기본 http://localhost:4000)
//   node scripts/mock-api/contract-check.mjs --spawn  → 목 서버를 이 프로세스 안에서 임시 포트로 띄워 점검
// 시작할 때 POST /__mock/reset 으로 목 서버 상태를 지운다. 실패가 하나라도 있으면 종료 코드 1.
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { startMockServer } from './server.mjs';

const VERSION = '2026-11-06-v1';
const ADMIN_KEY = process.env.MOCK_KAKAO_ADMIN_KEY || 'mock-admin-key';
const T0 = '2026-11-07T19:10:00+09:00'; // 토요일 19:10 KST
const PLACES = {
  suji: { lat: 37.3222, lng: 127.0977 }, // 수지구청 앞
  jukjeon: { lat: 37.3245, lng: 127.1074 }, // 죽전역 2번 출구
  here: { lat: 37.3221, lng: 127.0982 }, // 현재 위치
  giheung: { lat: 37.2752, lng: 127.1159 }, // 기흥역 상가 골목
  dongbaek: { lat: 37.2697, lng: 127.1527 }, // 동백호수공원 입구
  terminal: { lat: 37.2378, lng: 127.2096 }, // 용인공용버스터미널
  generic: { lat: 37.2, lng: 127.3 }, // 용인 안 일반 지점
  seoul: { lat: 37.5665, lng: 126.978 }, // 용인 밖
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KST_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+09:00$/;
const KEYS = {
  login: ['accessToken', 'refreshToken', 'expiresIn', 'isNewUser', 'user', 'agreements'],
  tokens: ['accessToken', 'refreshToken', 'expiresIn'],
  me: ['id', 'nickname', 'email', 'hasVehicle', 'agreements'],
  agreement: ['type', 'version', 'action', 'occurredAt'],
  vehicle: ['id', 'name', 'bluetoothAddress', 'deviceType'],
  settings: ['dangerEnabled', 'cautionEnabled', 'nightEnabled'],
  post: ['parkingEventId', 'address', 'assessment'],
  assessment: [
    'status',
    'level',
    'predictionStatus',
    'primaryZoneType',
    'reasons',
    'stats',
    'referenceFineAmount',
    'attemptCount',
    'notify',
    'evaluatedAt',
  ],
  reason: ['rank', 'type', 'zoneType', 'distanceM', 'thresholdM', 'accuracyMarginM', 'description'],
  stats: [
    'reportCount',
    'reportRadiusM',
    'periodStart',
    'periodEnd',
    'predictedCount',
    'topPercent',
  ],
  notify: ['decision', 'expiresAt', 'title', 'body'],
  event: ['id', 'detectedAt', 'confirmedLocation', 'address', 'vehicleName'],
  listAssessment: [
    'status',
    'level',
    'predictionStatus',
    'primaryZoneType',
    'distanceM',
    'referenceFineAmount',
    'topPercent',
  ],
  lot: [
    'id',
    'name',
    'address',
    'distanceM',
    'location',
    'parkingType',
    'feeType',
    'feeInfo',
    'operatingHours',
    'capacity',
  ],
};

let base = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
let passed = 0;
const failed = [];

// ---------- 공통 도우미 ----------

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed.push(name);
    const extra =
      detail === undefined
        ? ''
        : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    console.log(`✗ ${name}${extra}`);
  }
  return Boolean(condition);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameKeys = (obj, keys) =>
  obj !== null && typeof obj === 'object' && same(Object.keys(obj).sort(), [...keys].sort());
const summary = (res) => `${res.status} ${res.code ?? ''} ${res.text.slice(0, 160)}`;

function expectError(name, res, status, code) {
  return check(
    name,
    res.status === status &&
      res.json?.success === false &&
      res.json?.data === null &&
      res.code === code &&
      typeof res.json?.error?.message === 'string',
    summary(res),
  );
}

function expectOk(name, res, status = 200) {
  return check(
    name,
    res.status === status && res.json?.success === true && res.json?.error === null,
    summary(res),
  );
}

async function api(method, path, { token, body, raw, headers = {}, url = base } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (raw !== undefined) {
    init.body = raw;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] ??= 'application/json';
  }
  const res = await fetch(url + path, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: res.status,
    headers: res.headers,
    text,
    json,
    data: json?.data ?? null,
    code: json?.error?.code ?? null,
  };
}

function kstIso(ms) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '+09:00');
}
const shift = (iso, seconds) => kstIso(Date.parse(iso) + seconds * 1000);
const D = (seconds) => shift('2026-11-07T19:05:00+09:00', seconds);

const login = (id, url = base, deviceInfo = undefined) =>
  api('POST', '/api/v1/auth/kakao', {
    body: { kakaoAccessToken: `mock-kakao-${id}`, deviceInfo },
    url,
  });

async function session(id, url = base) {
  const res = await login(id, url);
  if (res.status !== 200) throw new Error(`login ${id} failed: ${summary(res)}`);
  return {
    token: res.data.accessToken,
    refresh: res.data.refreshToken,
    id: res.data.user.id,
    url,
    res,
  };
}

const agree = (s, type, action = 'AGREE', version = VERSION) =>
  api('POST', '/api/v1/me/agreements', {
    token: s.token,
    body: { type, version, action },
    url: s.url,
  });

async function agreeAll(s) {
  for (const type of ['TERMS', 'PRIVACY', 'LOCATION_SERVICE']) await agree(s, type);
}

const putVehicle = (s, body) => api('PUT', '/api/v1/vehicle', { token: s.token, body, url: s.url });
const postEvent = (s, body) =>
  api('POST', '/api/v1/parking-events', { token: s.token, body, url: s.url });
const getEvent = (s, id) =>
  api('GET', `/api/v1/parking-events/${id}`, { token: s.token, url: s.url });
const patchSettings = (s, body) =>
  api('PATCH', '/api/v1/notification-settings', { token: s.token, body, url: s.url });
const delivery = (s, id, body) =>
  api('PATCH', `/api/v1/parking-events/${id}/delivery`, { token: s.token, body, url: s.url });
const nearby = (s, query) =>
  api('GET', `/api/v1/parking-lots/nearby?${query}`, { token: s.token, url: s.url });
const riskZones = (s, query) =>
  api('GET', `/api/v1/map/risk-zones?${query}`, { token: s.token, url: s.url });
const setClock = (body) => api('POST', '/__mock/clock', { body });

function eventBody(place, options) {
  const {
    vehicleId,
    detectedAt,
    confirmedAt = shift(detectedAt, 30),
    method = 'CONFIRMED',
    accuracyM = 8.5,
    original = place,
    lastKnown = null,
    confirmed = place,
    remeasureCount = 0,
    key = randomUUID(),
  } = options;
  return {
    clientEventId: key,
    vehicleId,
    detectedAt,
    confirmedAt,
    confirmationMethod: method,
    originalLocation: original ? { lat: original.lat, lng: original.lng, accuracyM } : null,
    lastKnownLocation: lastKnown,
    confirmedLocation: { lat: confirmed.lat, lng: confirmed.lng },
    remeasureCount,
  };
}

async function deliveryState(eventId) {
  const res = await api('GET', '/__mock/state');
  return res.data?.events?.find((e) => e.id === eventId) ?? null;
}

function argmaxEarliest(values) {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) if (values[i] > values[best]) best = i;
  return best;
}

async function step(title, fn) {
  console.log(`\n## ${title}`);
  try {
    await fn();
  } catch (error) {
    check(`${title}: 예외 없이 끝남`, false, error.stack ?? String(error));
  }
}

// ---------- 시나리오 ----------

async function scenario() {
  const index = await api('GET', '/__mock');
  const reset = await api('POST', '/__mock/reset');
  if (reset.status !== 200 || reset.data?.reset !== true) {
    throw new Error(`${base} 는 목 서버가 아닙니다 (POST /__mock/reset → ${reset.status})`);
  }
  const mockConfig = index.data?.config ?? {};
  let A;
  let B;
  let vehicleA;
  const created = [];
  const ev = {};

  const create = async (label, body, s = A) => {
    const res = await postEvent(s, body);
    if (res.status === 201) {
      const a = res.data.assessment;
      created.push({ id: res.data.parkingEventId, detectedAt: body.detectedAt, level: a.level, a });
      ev[label] = { id: res.data.parkingEventId, body, res };
    }
    return res;
  };

  await step('공통 규칙', async () => {
    const health = await api('GET', '/api/v1/health');
    expectOk('GET /health 200', health);
    check('health data = {status:"UP"}', same(health.data, { status: 'UP' }), health.text);
    const preflight = await api('OPTIONS', '/api/v1/parking-events', {
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    check(
      'CORS preflight → 204 + 허용 헤더',
      preflight.status === 204 &&
        preflight.headers.get('access-control-allow-origin') === '*' &&
        /Authorization/.test(preflight.headers.get('access-control-allow-headers') ?? '') &&
        /PATCH/.test(preflight.headers.get('access-control-allow-methods') ?? ''),
      `${preflight.status}`,
    );
    const noToken = await api('GET', '/api/v1/me');
    expectError('토큰 없음 → 401 UNAUTHORIZED', noToken, 401, 'UNAUTHORIZED');
    check('401 에 WWW-Authenticate: Bearer', noToken.headers.get('www-authenticate') === 'Bearer');
    check('오류 응답 CORS 헤더', noToken.headers.get('access-control-allow-origin') === '*');
    expectError(
      '위조 토큰 → 401 UNAUTHORIZED',
      await api('GET', '/api/v1/me', { token: 'abc.def.ghi' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      'Bearer 아닌 헤더 → 401',
      await api('GET', '/api/v1/me', { headers: { Authorization: 'Basic abc' } }),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      '없는 경로 + 토큰 없음 → 401 (Spring Security처럼 인증이 먼저)',
      await api('GET', '/api/v1/nope'),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      '공개 경로의 다른 메서드 + 토큰 없음 → 401',
      await api('GET', '/api/v1/auth/kakao'),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      '깨진 JSON → 400 INVALID_INPUT',
      await api('POST', '/api/v1/auth/kakao', {
        raw: '{"kakaoAccessToken":',
        headers: { 'Content-Type': 'application/json' },
      }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '빈 본문 → 400 INVALID_INPUT',
      await api('POST', '/api/v1/auth/refresh', {
        raw: '',
        headers: { 'Content-Type': 'application/json' },
      }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      'text/plain 본문 → 415 UNSUPPORTED_MEDIA_TYPE',
      await api('POST', '/api/v1/auth/kakao', {
        raw: '{"kakaoAccessToken":"mock-kakao-x"}',
        headers: { 'Content-Type': 'text/plain' },
      }),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
  });

  await step('카카오 로그인·회원', async () => {
    const kakao = (token, extra = {}) =>
      api('POST', '/api/v1/auth/kakao', { body: { kakaoAccessToken: token, ...extra } });
    expectError(
      'mock-kakao-invalid → 401 KAKAO_TOKEN_INVALID',
      await kakao('mock-kakao-invalid'),
      401,
      'KAKAO_TOKEN_INVALID',
    );
    expectError(
      'mock-kakao- 접두사 아님 → 401 KAKAO_TOKEN_INVALID',
      await kakao('real-kakao-token'),
      401,
      'KAKAO_TOKEN_INVALID',
    );
    expectError(
      'mock-kakao-unavailable → 503 SERVICE_UNAVAILABLE',
      await kakao('mock-kakao-unavailable'),
      503,
      'SERVICE_UNAVAILABLE',
    );
    expectError('빈 카카오 토큰 → 400', await kakao('   '), 400, 'INVALID_INPUT');
    expectError(
      'deviceInfo 201자 → 400',
      await kakao('mock-kakao-contract-a', { deviceInfo: 'x'.repeat(201) }),
      400,
      'INVALID_INPUT',
    );
    const first = await login('contract-a', base, 'Pixel 8 / Android 15');
    expectOk('신규 로그인 200', first);
    A = {
      token: first.data.accessToken,
      refresh: first.data.refreshToken,
      id: first.data.user.id,
      url: base,
    };
    check('로그인 응답 키', sameKeys(first.data, KEYS.login), Object.keys(first.data));
    check('isNewUser true', first.data.isNewUser === true);
    check(
      'agreements.missing = TERMS, PRIVACY, LOCATION_SERVICE',
      same(first.data.agreements, { missing: ['TERMS', 'PRIVACY', 'LOCATION_SERVICE'] }),
    );
    check(
      'user = {id, nickname 테스트contract-a, profileImageUrl null}',
      sameKeys(first.data.user, ['id', 'nickname', 'profileImageUrl']) &&
        UUID_RE.test(first.data.user.id) &&
        first.data.user.nickname === '테스트contract-a' &&
        first.data.user.profileImageUrl === null,
      first.data.user,
    );
    check(
      `expiresIn = 서버 설정(${mockConfig.accessTtlSec})`,
      first.data.expiresIn === mockConfig.accessTtlSec,
    );
    check('accessToken 은 JWT 3조각', first.data.accessToken.split('.').length === 3);
    const again = await login('contract-a');
    check(
      '기존 사용자 로그인 → isNewUser false, 같은 id',
      again.data?.isNewUser === false && again.data?.user.id === A.id,
    );
    const me = await api('GET', '/api/v1/me', { token: A.token });
    expectOk('GET /me 200', me);
    check(
      'GET /me = {id,nickname,email,hasVehicle:false,agreements:[]}',
      sameKeys(me.data, KEYS.me) &&
        me.data.id === A.id &&
        me.data.email === 'contract-a@example.com' &&
        me.data.hasVehicle === false &&
        same(me.data.agreements, []),
      me.data,
    );
    expectError(
      '없는 경로 + 토큰 → 404 NOT_FOUND',
      await api('GET', '/api/v1/nope', { token: A.token }),
      404,
      'NOT_FOUND',
    );
    const wrongMethod = await api('DELETE', '/api/v1/vehicle', { token: A.token });
    expectError('허용되지 않은 메서드 → 405', wrongMethod, 405, 'METHOD_NOT_ALLOWED');
    check('405 Allow 헤더', /GET/.test(wrongMethod.headers.get('allow') ?? ''));
    B = await session('contract-b');
  });

  await step('약관 동의·위치 동의', async () => {
    expectError(
      '동의 전 주변 주차장 → 403 LOCATION_CONSENT_REQUIRED',
      await nearby(A, 'lat=37.3221&lng=127.0982'),
      403,
      'LOCATION_CONSENT_REQUIRED',
    );
    expectError(
      '허용되지 않은 약관 버전 → 400',
      await agree(A, 'TERMS', 'AGREE', '2020-01-01'),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '없는 약관 유형 → 400',
      await api('POST', '/api/v1/me/agreements', {
        token: A.token,
        body: { type: 'MARKETING', version: VERSION, action: 'AGREE' },
      }),
      400,
      'INVALID_INPUT',
    );
    const terms = await agree(A, 'TERMS');
    expectOk('TERMS AGREE → 201', terms, 201);
    check(
      '동의 응답 = {type, version, action, occurredAt}',
      sameKeys(terms.data, KEYS.agreement) &&
        terms.data.type === 'TERMS' &&
        terms.data.version === VERSION &&
        terms.data.action === 'AGREE' &&
        !Number.isNaN(Date.parse(terms.data.occurredAt)),
      terms.data,
    );
    await agree(A, 'PRIVACY');
    const mid = await login('contract-a');
    check(
      'TERMS·PRIVACY 후 missing = [LOCATION_SERVICE]',
      same(mid.data?.agreements.missing, ['LOCATION_SERVICE']),
    );
    const bodyBefore = eventBody(PLACES.here, { vehicleId: randomUUID(), detectedAt: D(0) });
    expectError(
      '위치 동의 전 POST /parking-events → 403 LOCATION_CONSENT_REQUIRED',
      await postEvent(A, bodyBefore),
      403,
      'LOCATION_CONSENT_REQUIRED',
    );
    expectError(
      '동의 전이라도 본문 검증이 먼저 → 400',
      await postEvent(A, { ...bodyBefore, remeasureCount: 99 }),
      400,
      'INVALID_INPUT',
    );
    expectOk('LOCATION_SERVICE AGREE → 201', await agree(A, 'LOCATION_SERVICE'), 201);
    expectError(
      'LOCATION_SERVICE WITHDRAW → 503 SERVICE_UNAVAILABLE',
      await agree(A, 'LOCATION_SERVICE', 'WITHDRAW'),
      503,
      'SERVICE_UNAVAILABLE',
    );
    const after = await login('contract-a');
    check('세 약관 동의 후 missing = []', same(after.data?.agreements.missing, []));
    const me = await api('GET', '/api/v1/me', { token: A.token });
    check(
      'GET /me agreements = 유형별 최신 3건',
      me.data?.agreements.length === 3 &&
        same(
          me.data.agreements.map((a) => a.type),
          ['TERMS', 'PRIVACY', 'LOCATION_SERVICE'],
        ) &&
        me.data.agreements.every((a) => sameKeys(a, KEYS.agreement)),
      me.data?.agreements,
    );
    expectOk(
      'TERMS WITHDRAW → 201 (위치 외 철회는 기록)',
      await agree(A, 'TERMS', 'WITHDRAW'),
      201,
    );
    const withdrawn = await login('contract-a');
    check('철회 후 missing = [TERMS]', same(withdrawn.data?.agreements.missing, ['TERMS']));
    await agree(A, 'TERMS');
  });

  await step('차량', async () => {
    const empty = await api('GET', '/api/v1/vehicle', { token: A.token });
    check(
      '차량 없음 → {vehicle:null}',
      empty.status === 200 && same(empty.data, { vehicle: null }),
    );
    expectError(
      '소문자 MAC → 400 INVALID_BLUETOOTH_ADDRESS',
      await putVehicle(A, { name: '아반떼', bluetoothAddress: 'aa:bb:cc:dd:ee:01' }),
      400,
      'INVALID_BLUETOOTH_ADDRESS',
    );
    expectError(
      'MAC 누락 → 400 INVALID_BLUETOOTH_ADDRESS',
      await putVehicle(A, { name: '아반떼' }),
      400,
      'INVALID_BLUETOOTH_ADDRESS',
    );
    expectError(
      '공백 이름 → 400 INVALID_INPUT',
      await putVehicle(A, { name: '   ', bluetoothAddress: 'AA:BB:CC:DD:EE:01' }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      'deviceType 51자 → 400 INVALID_INPUT',
      await putVehicle(A, {
        name: '아반떼',
        bluetoothAddress: 'AA:BB:CC:DD:EE:01',
        deviceType: 'x'.repeat(51),
      }),
      400,
      'INVALID_INPUT',
    );
    const registered = await putVehicle(A, {
      name: '아반떼',
      bluetoothAddress: 'AA:BB:CC:DD:EE:01',
      deviceType: 'CAR_AUDIO',
    });
    expectOk('PUT /vehicle 신규 → 200', registered);
    vehicleA = registered.data?.vehicle;
    check(
      '등록 응답 = {vehicle:{id,name,bluetoothAddress,deviceType}}',
      sameKeys(registered.data, ['vehicle']) &&
        sameKeys(vehicleA, KEYS.vehicle) &&
        UUID_RE.test(vehicleA.id) &&
        vehicleA.deviceType === 'CAR_AUDIO',
      registered.data,
    );
    const renamed = await putVehicle(A, {
      name: '아반떼 N',
      bluetoothAddress: 'AA:BB:CC:DD:EE:01',
    });
    check(
      '같은 MAC → 같은 id, 이름 변경, deviceType null',
      renamed.data?.vehicle.id === vehicleA.id &&
        renamed.data.vehicle.name === '아반떼 N' &&
        renamed.data.vehicle.deviceType === null,
      renamed.data,
    );
    const fetched = await api('GET', '/api/v1/vehicle', { token: A.token });
    check('GET /vehicle = 변경 후 차량', same(fetched.data, renamed.data));
    const me = await api('GET', '/api/v1/me', { token: A.token });
    check('GET /me hasVehicle true', me.data?.hasVehicle === true);
    await putVehicle(B, { name: 'B의 차', bluetoothAddress: '11:22:33:44:55:66' });
  });

  await step('알림 설정', async () => {
    const initial = await api('GET', '/api/v1/notification-settings', { token: A.token });
    check(
      '기본값 = {dangerEnabled:true, cautionEnabled:true, nightEnabled:false}',
      initial.status === 200 &&
        same(initial.data, { dangerEnabled: true, cautionEnabled: true, nightEnabled: false }),
      initial.text,
    );
    expectError(
      'dangerEnabled 전송 → 400',
      await patchSettings(A, { dangerEnabled: true }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '모르는 필드 → 400',
      await patchSettings(A, { soundEnabled: true }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      'null → 400',
      await patchSettings(A, { cautionEnabled: null }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '문자열 불리언 → 400',
      await patchSettings(A, { nightEnabled: 'true' }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '배열 본문 → 400',
      await api('PATCH', '/api/v1/notification-settings', {
        token: A.token,
        raw: '[]',
        headers: { 'Content-Type': 'application/json' },
      }),
      400,
      'INVALID_INPUT',
    );
    const night = await patchSettings(A, { nightEnabled: true });
    check(
      'PATCH {nightEnabled:true} → 세 필드 모두 반환',
      night.status === 200 &&
        same(night.data, { dangerEnabled: true, cautionEnabled: true, nightEnabled: true }),
      night.text,
    );
    const noop = await patchSettings(A, {});
    check('PATCH {} → 변경 없음', noop.status === 200 && noop.data?.nightEnabled === true);
    await patchSettings(A, { nightEnabled: false });
  });

  await step('주차 판정: 시연 좌표별 결과 (목 시각 토 19:10)', async () => {
    const clock = await setClock({ now: T0 });
    check('목 시각 설정', clock.status === 200 && clock.data?.now.startsWith('2026-11-07T19:10'));
    const vehicleId = vehicleA.id;
    const e1 = await create(
      'suji',
      eventBody(PLACES.suji, {
        vehicleId,
        detectedAt: D(0),
        lastKnown: { lat: 37.32215, lng: 127.09765, at: D(-10) },
      }),
    );
    expectOk('수지구청 앞 → 201', e1, 201);
    const a1 = e1.data?.assessment;
    check('POST 응답 키 / address null', sameKeys(e1.data, KEYS.post) && e1.data.address === null);
    check('assessment 키', sameKeys(a1, KEYS.assessment), a1 && Object.keys(a1));
    check(
      '수지구청 앞 = SUCCEEDED / 1 / SKIPPED / HYDRANT',
      a1?.status === 'SUCCEEDED' &&
        a1.level === 1 &&
        a1.predictionStatus === 'SKIPPED' &&
        a1.primaryZoneType === 'HYDRANT',
      a1,
    );
    const r1 = a1?.reasons[0];
    check(
      'FACILITY_RULE 근거: 약 3m / 5m / accuracyMarginM 8.5',
      sameKeys(r1, KEYS.reason) &&
        r1.rank === 1 &&
        r1.type === 'FACILITY_RULE' &&
        r1.zoneType === 'HYDRANT' &&
        r1.distanceM > 2 &&
        r1.distanceM < 4 &&
        r1.thresholdM === 5 &&
        r1.accuracyMarginM === 8.5 &&
        typeof r1.description === 'string',
      r1,
    );
    check('소화전 과태료 80000', a1?.referenceFineAmount === 80000);
    check('attemptCount 1', a1?.attemptCount === 1);
    check(
      '1단계 notify SEND, expiresAt = detectedAt + 30분',
      sameKeys(a1?.notify, KEYS.notify) &&
        a1.notify.decision === 'SEND' &&
        a1.notify.expiresAt === '2026-11-07T19:35:00+09:00' &&
        typeof a1.notify.title === 'string' &&
        /신고 \d+건/.test(a1.notify.body),
      a1?.notify,
    );
    check(
      '1단계 stats: predictedCount·topPercent null, peak 없음(POST)',
      sameKeys(a1?.stats, KEYS.stats) &&
        a1.stats.reportRadiusM === 50 &&
        Number.isInteger(a1.stats.reportCount) &&
        a1.stats.predictedCount === null &&
        a1.stats.topPercent === null,
      a1?.stats,
    );
    check('evaluatedAt 은 KST(+09:00)', KST_RE.test(a1?.evaluatedAt ?? ''), a1?.evaluatedAt);

    const e2 = await create('jukjeon', eventBody(PLACES.jukjeon, { vehicleId, detectedAt: D(20) }));
    const a2 = e2.data?.assessment;
    check(
      '죽전역 2번 출구 = 1단계 BUS_STOP 약 7m / 10m, 과태료 40000, SEND',
      e2.status === 201 &&
        a2.level === 1 &&
        a2.primaryZoneType === 'BUS_STOP' &&
        a2.reasons[0].distanceM > 6 &&
        a2.reasons[0].distanceM < 8 &&
        a2.reasons[0].thresholdM === 10 &&
        a2.referenceFineAmount === 40000 &&
        a2.notify.decision === 'SEND',
      a2,
    );

    const e3 = await create('here', eventBody(PLACES.here, { vehicleId, detectedAt: D(40) }));
    const a3 = e3.data?.assessment;
    const m3 = a3?.reasons[0];
    check(
      '현재 위치 = SUCCEEDED / 2 / OK, primaryZoneType null',
      e3.status === 201 &&
        a3.status === 'SUCCEEDED' &&
        a3.level === 2 &&
        a3.predictionStatus === 'OK' &&
        a3.primaryZoneType === null,
      a3,
    );
    check(
      'MODEL 근거 1개 (zoneType·거리 null, "상위 8%")',
      a3?.reasons.length === 1 &&
        sameKeys(m3, KEYS.reason) &&
        m3.type === 'MODEL' &&
        m3.zoneType === null &&
        m3.distanceM === null &&
        m3.thresholdM === null &&
        m3.accuracyMarginM === null &&
        m3.description.includes('상위 8%'),
      m3,
    );
    check(
      '2단계 stats 채움 (8%, 587건, 50m, 2025-01-01~2025-09-25)',
      same(a3?.stats, {
        reportCount: 587,
        reportRadiusM: 50,
        periodStart: '2025-01-01',
        periodEnd: '2025-09-25',
        predictedCount: 3.2,
        topPercent: 8,
      }),
      a3?.stats,
    );
    check('2단계 과태료 40000 (OTHER)', a3?.referenceFineAmount === 40000);
    check(
      '2단계 notify SEND + 제목',
      a3?.notify.decision === 'SEND' && a3.notify.title === '여기는 신고가 잦은 곳이에요',
      a3?.notify,
    );

    const e4 = await create('giheung', eventBody(PLACES.giheung, { vehicleId, detectedAt: D(60) }));
    check(
      '기흥역 상가 골목 = 2단계 상위 1.5%, SEND',
      e4.status === 201 &&
        e4.data.assessment.level === 2 &&
        e4.data.assessment.stats.topPercent === 1.5 &&
        e4.data.assessment.notify.decision === 'SEND',
      e4.data?.assessment,
    );

    const e5 = await create(
      'dongbaek',
      eventBody(PLACES.dongbaek, { vehicleId, detectedAt: D(-240) }),
    );
    const a5 = e5.data?.assessment;
    check(
      '동백호수공원 입구 = PARTIAL / null / NOT_TARGET, NONE, 금액·문구 null',
      e5.status === 201 &&
        a5.status === 'PARTIAL' &&
        a5.level === null &&
        a5.predictionStatus === 'NOT_TARGET' &&
        a5.notify.decision === 'NONE' &&
        a5.referenceFineAmount === null &&
        a5.notify.title === null &&
        a5.notify.body === null &&
        same(a5.reasons, []),
      a5,
    );

    const terminalBody = eventBody(PLACES.terminal, { vehicleId, detectedAt: D(-180) });
    const e6 = await create('terminal', terminalBody);
    const a6 = e6.data?.assessment;
    check(
      '용인공용버스터미널 1회차 = FAILED / null / MISSING_ROW, attemptCount 1, NONE',
      e6.status === 201 &&
        a6.status === 'FAILED' &&
        a6.level === null &&
        a6.predictionStatus === 'MISSING_ROW' &&
        a6.attemptCount === 1 &&
        a6.notify.decision === 'NONE',
      a6,
    );
    const retry = await postEvent(A, terminalBody);
    const ar = retry.data?.assessment;
    check(
      '같은 키 재시도 → 200, 재판정 level 3, attemptCount 2',
      retry.status === 200 &&
        retry.data.parkingEventId === e6.data?.parkingEventId &&
        ar.status === 'SUCCEEDED' &&
        ar.level === 3 &&
        ar.predictionStatus === 'OK' &&
        ar.attemptCount === 2 &&
        ar.notify.decision === 'NONE',
      ar,
    );
    const third = await postEvent(A, terminalBody);
    check(
      '세 번째 → 200, 저장된 결과 그대로 (attemptCount 2, evaluatedAt 동일)',
      third.status === 200 &&
        third.data.assessment.attemptCount === 2 &&
        third.data.assessment.evaluatedAt === ar?.evaluatedAt,
      third.data?.assessment,
    );
    if (created.length > 0) {
      const record = created.find((c) => c.id === e6.data?.parkingEventId);
      if (record) record.level = 3;
    }
    const e6b = await create(
      'terminalFailed',
      eventBody(PLACES.terminal, { vehicleId, detectedAt: D(-170) }),
    );
    check(
      '터미널 두 번째 이벤트(재시도 안 함) FAILED 유지',
      e6b.data?.assessment.status === 'FAILED',
    );

    const e7 = await create(
      'generic',
      eventBody(PLACES.generic, { vehicleId, detectedAt: D(-120) }),
    );
    const a7 = e7.data?.assessment;
    check(
      '용인 안 일반 지점 = SUCCEEDED / 3 / OK, topPercent 35~70, NONE, 금액 null',
      e7.status === 201 &&
        a7.level === 3 &&
        a7.predictionStatus === 'OK' &&
        a7.stats.topPercent >= 35 &&
        a7.stats.topPercent <= 70 &&
        a7.notify.decision === 'NONE' &&
        a7.referenceFineAmount === null &&
        same(a7.reasons, []) &&
        a7.notify.title === null,
      a7,
    );

    const e8 = await create('seoul', eventBody(PLACES.seoul, { vehicleId, detectedAt: D(-60) }));
    const a8 = e8.data?.assessment;
    check(
      '용인 밖 = PARTIAL / OUT_OF_AREA, 신고 0건·기간 null',
      e8.status === 201 &&
        a8.status === 'PARTIAL' &&
        a8.predictionStatus === 'OUT_OF_AREA' &&
        a8.stats.reportCount === 0 &&
        a8.stats.periodStart === null &&
        a8.stats.periodEnd === null,
      a8,
    );

    const e9 = await create(
      'stale',
      eventBody(PLACES.suji, { vehicleId, detectedAt: '2026-11-07T18:30:00+09:00' }),
    );
    check(
      '30분 넘은 1단계 → 저장·판정은 하되 NONE',
      e9.status === 201 &&
        e9.data.assessment.level === 1 &&
        e9.data.assessment.notify.decision === 'NONE',
      e9.data?.assessment,
    );
    const e9b = await create(
      'staleCaution',
      eventBody(PLACES.here, { vehicleId, detectedAt: '2026-11-07T18:39:00+09:00' }),
    );
    check(
      '30분 넘은 2단계 → NONE',
      e9b.data?.assessment.level === 2 && e9b.data.assessment.notify.decision === 'NONE',
      e9b.data?.assessment,
    );
  });

  await step('멱등 재요청 (clientEventId)', async () => {
    const original = ev.suji;
    const replay = await postEvent(A, original.body);
    check(
      '같은 본문 → 200, 같은 parkingEventId·evaluatedAt (재계산 없음)',
      replay.status === 200 &&
        replay.data.parkingEventId === original.id &&
        replay.data.assessment.evaluatedAt === original.res.data.assessment.evaluatedAt &&
        replay.data.assessment.attemptCount === 1,
      summary(replay),
    );
    const b = original.body;
    const reordered = {
      remeasureCount: b.remeasureCount,
      confirmedLocation: b.confirmedLocation,
      lastKnownLocation: {
        ...b.lastKnownLocation,
        at: new Date(Date.parse(b.lastKnownLocation.at)).toISOString(),
      },
      originalLocation: b.originalLocation,
      confirmationMethod: b.confirmationMethod,
      confirmedAt: new Date(Date.parse(b.confirmedAt)).toISOString(),
      detectedAt: '2026-11-07T10:05:00Z',
      vehicleId: b.vehicleId.toUpperCase(),
      clientEventId: b.clientEventId.toUpperCase(),
    };
    const sameInstant = await postEvent(A, reordered);
    check(
      '키 순서·시간대 표현·UUID 대소문자만 다름 → 200 같은 이벤트',
      sameInstant.status === 200 && sameInstant.data.parkingEventId === original.id,
      summary(sameInstant),
    );
    const rawText = JSON.stringify(b).replace(
      '"confirmedLocation":{"lat":37.3222,',
      '"confirmedLocation":{"lat":37.32220000004,',
    );
    const rounded = await api('POST', '/api/v1/parking-events', {
      token: A.token,
      raw: rawText,
      headers: { 'Content-Type': 'application/json' },
    });
    check(
      '좌표 소수 7자리 아래만 다름 → 200 (같은 해시)',
      rawText !== JSON.stringify(b) &&
        rounded.status === 200 &&
        rounded.data.parkingEventId === original.id,
      summary(rounded),
    );
    const reused = await postEvent(A, { ...b, remeasureCount: 1 });
    expectError(
      '같은 키 + 다른 본문 → 409 IDEMPOTENCY_KEY_REUSED',
      reused,
      409,
      'IDEMPOTENCY_KEY_REUSED',
    );
    expectError(
      '같은 키 + 다른 좌표 → 409',
      await postEvent(A, { ...b, confirmedLocation: { lat: 37.32221, lng: 127.0977 } }),
      409,
      'IDEMPOTENCY_KEY_REUSED',
    );
  });

  await step('POST /parking-events 검증 오류', async () => {
    const vehicleId = vehicleA.id;
    const valid = (extra = {}) => ({
      ...eventBody(PLACES.here, { vehicleId, detectedAt: D(5) }),
      ...extra,
    });
    const far = { lat: PLACES.here.lat + 0.0025, lng: PLACES.here.lng }; // 약 277m 북쪽
    expectError(
      'AUTO + originalLocation 없음 → 400 AUTO_CONFIRM_NOT_ALLOWED',
      await postEvent(
        A,
        eventBody(PLACES.here, { vehicleId, detectedAt: D(5), method: 'AUTO', original: null }),
      ),
      400,
      'AUTO_CONFIRM_NOT_ALLOWED',
    );
    expectError(
      'originalLocation 에서 200m 초과 보정 → 400 ADJUST_DISTANCE_EXCEEDED',
      await postEvent(
        A,
        eventBody(PLACES.here, { vehicleId, detectedAt: D(5), method: 'ADJUSTED', confirmed: far }),
      ),
      400,
      'ADJUST_DISTANCE_EXCEEDED',
    );
    expectError(
      'original 없으면 lastKnownLocation 기준 200m 초과 → 400 ADJUST_DISTANCE_EXCEEDED',
      await postEvent(
        A,
        eventBody(PLACES.here, {
          vehicleId,
          detectedAt: D(5),
          method: 'ADJUSTED',
          original: null,
          lastKnown: { ...PLACES.here, at: D(-30) },
          confirmed: far,
        }),
      ),
      400,
      'ADJUST_DISTANCE_EXCEEDED',
    );
    const noReference = await create(
      'noReference',
      eventBody(PLACES.generic, {
        vehicleId,
        detectedAt: D(80),
        method: 'ADJUSTED',
        original: null,
        confirmed: { lat: 37.21, lng: 127.31 },
      }),
    );
    expectOk('기준점이 둘 다 없으면 거리 제한 없음 → 201', noReference, 201);
    const near = await create(
      'adjustedNear',
      eventBody(PLACES.here, {
        vehicleId,
        detectedAt: D(100),
        method: 'ADJUSTED',
        confirmed: { lat: PLACES.here.lat + 0.001, lng: PLACES.here.lng },
      }),
    );
    expectOk('200m 이내 보정 → 201', near, 201);
    expectError(
      'confirmedAt < detectedAt → 400 INVALID_TIME_ORDER',
      await postEvent(A, valid({ confirmedAt: D(-5) })),
      400,
      'INVALID_TIME_ORDER',
    );
    expectError(
      'detectedAt 이 서버 시각 + 2분 초과 → 400 INVALID_TIME',
      await postEvent(A, valid({ detectedAt: shift(T0, 300), confirmedAt: shift(T0, 330) })),
      400,
      'INVALID_TIME',
    );
    const futureBody = eventBody(PLACES.generic, {
      vehicleId,
      detectedAt: shift(T0, 60),
      confirmedAt: shift(T0, 65),
    });
    expectOk('detectedAt 이 +1분 (허용 범위) → 201', await create('future', futureBody), 201);
    await setClock({ now: shift(T0, -900) });
    const futureReplay = await postEvent(A, futureBody);
    check(
      '기존 키 재요청은 미래 시각 검사를 건너뜀 → 200',
      futureReplay.status === 200 && futureReplay.data.parkingEventId === ev.future?.id,
      summary(futureReplay),
    );
    expectError(
      '같은 시각, 새 키 → 400 INVALID_TIME',
      await postEvent(A, { ...futureBody, clientEventId: randomUUID() }),
      400,
      'INVALID_TIME',
    );
    await setClock({ now: T0 });
    const invalidInputs = [
      ['모르는 최상위 필드', valid({ crosswalkNearby: true })],
      ['remeasureCount 11', valid({ remeasureCount: 11 })],
      ['remeasureCount -1', valid({ remeasureCount: -1 })],
      ['remeasureCount 1.5', valid({ remeasureCount: 1.5 })],
      ['remeasureCount 문자열', valid({ remeasureCount: '1' })],
      [
        'lastKnownLocation.at 이 detectedAt 10분 초과 전',
        valid({ lastKnownLocation: { ...PLACES.here, at: D(-605) } }),
      ],
      [
        'lastKnownLocation.at 이 detectedAt 보다 늦음',
        valid({ lastKnownLocation: { ...PLACES.here, at: D(6) } }),
      ],
      ['lastKnownLocation.at 없음', valid({ lastKnownLocation: { ...PLACES.here } })],
      ['lat 91', valid({ confirmedLocation: { lat: 91, lng: 127.0982 } })],
      ['accuracyM 음수', valid({ originalLocation: { ...PLACES.here, accuracyM: -1 } })],
      ['accuracyM 없음', valid({ originalLocation: { ...PLACES.here } })],
      ['시간대 없는 detectedAt', valid({ detectedAt: '2026-11-07T19:05:05' })],
      ['잘못된 clientEventId', valid({ clientEventId: 'not-a-uuid' })],
      ['confirmedLocation 없음', valid({ confirmedLocation: null })],
      ['confirmationMethod MANUAL', valid({ confirmationMethod: 'MANUAL' })],
      [
        'remeasureCount 11 + 시간 역전 (입력 검사가 먼저)',
        valid({ remeasureCount: 11, confirmedAt: D(-5) }),
      ],
    ];
    for (const [label, body] of invalidInputs) {
      expectError(`${label} → 400 INVALID_INPUT`, await postEvent(A, body), 400, 'INVALID_INPUT');
    }
    const floatCount = JSON.stringify(valid()).replace(
      '"remeasureCount":0',
      '"remeasureCount":1.0',
    );
    expectError(
      'remeasureCount 1.0 (정수 토큰 아님) → 400',
      await api('POST', '/api/v1/parking-events', {
        token: A.token,
        raw: floatCount,
        headers: { 'Content-Type': 'application/json' },
      }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '없는 vehicleId → 404 VEHICLE_NOT_FOUND',
      await postEvent(A, valid({ vehicleId: randomUUID() })),
      404,
      'VEHICLE_NOT_FOUND',
    );
    const bVehicle = await api('GET', '/api/v1/vehicle', { token: B.token });
    expectError(
      '남의 vehicleId → 404 VEHICLE_NOT_FOUND',
      await postEvent(A, valid({ vehicleId: bVehicle.data?.vehicle?.id })),
      404,
      'VEHICLE_NOT_FOUND',
    );
  });

  await step('차량 교체와 기존 키', async () => {
    const replaced = await putVehicle(A, { name: '쏘렌토', bluetoothAddress: 'AA:BB:CC:DD:EE:02' });
    check(
      '다른 MAC → 새 차량 id',
      replaced.status === 200 &&
        replaced.data.vehicle.id !== vehicleA.id &&
        replaced.data.vehicle.name === '쏘렌토',
      replaced.data,
    );
    const current = await api('GET', '/api/v1/vehicle', { token: A.token });
    check('GET /vehicle = 새 차량', current.data?.vehicle?.id === replaced.data?.vehicle.id);
    const replay = await postEvent(A, ev.suji.body);
    check(
      '교체 전 차량으로 만든 기존 키 재요청 → 200 (차량 재검사 안 함)',
      replay.status === 200 && replay.data.parkingEventId === ev.suji.id,
      summary(replay),
    );
    expectError(
      '교체된(소프트 삭제) 차량으로 새 이벤트 → 404 VEHICLE_NOT_FOUND',
      await postEvent(A, eventBody(PLACES.here, { vehicleId: vehicleA.id, detectedAt: D(110) })),
      404,
      'VEHICLE_NOT_FOUND',
    );
    vehicleA = replaced.data.vehicle;
  });

  await step('알림 결정: 설정·야간·상위 2%', async () => {
    const vehicleId = vehicleA.id;
    await patchSettings(A, { cautionEnabled: false });
    const n1 = await create(
      'suppressedSetting',
      eventBody(PLACES.here, { vehicleId, detectedAt: D(120) }),
    );
    check(
      'cautionEnabled false + 2단계 8% → SUPPRESSED_SETTING',
      n1.data?.assessment.level === 2 &&
        n1.data.assessment.notify.decision === 'SUPPRESSED_SETTING',
      n1.data?.assessment.notify,
    );
    const n2 = await create('topTwo', eventBody(PLACES.giheung, { vehicleId, detectedAt: D(140) }));
    check(
      'cautionEnabled false 여도 상위 2% 이내(1.5%) → SEND',
      n2.data?.assessment.notify.decision === 'SEND',
      n2.data?.assessment.notify,
    );
    const n3 = await create(
      'levelOneOff',
      eventBody(PLACES.suji, { vehicleId, detectedAt: D(160) }),
    );
    check('cautionEnabled false 여도 1단계 → SEND', n3.data?.assessment.notify.decision === 'SEND');
    await patchSettings(A, { cautionEnabled: true, nightEnabled: false });
    await setClock({ now: '2026-11-07T23:10:00+09:00' });
    const night = (label, place, detectedAt) =>
      create(label, eventBody(place, { vehicleId, detectedAt }));
    const n4 = await night('night', PLACES.here, '2026-11-07T23:05:00+09:00');
    check(
      '23시 감지 + nightEnabled false → SUPPRESSED_NIGHT',
      n4.data?.assessment.notify.decision === 'SUPPRESSED_NIGHT',
      n4.data?.assessment.notify,
    );
    const n5 = await night('nightTopTwo', PLACES.giheung, '2026-11-07T23:05:10+09:00');
    check('야간이어도 상위 2% → SEND', n5.data?.assessment.notify.decision === 'SEND');
    await patchSettings(A, { nightEnabled: true });
    const n6 = await night('nightAllowed', PLACES.here, '2026-11-07T23:05:20+09:00');
    check('nightEnabled true → SEND', n6.data?.assessment.notify.decision === 'SEND');
    await patchSettings(A, { cautionEnabled: false, nightEnabled: false });
    const n7 = await night('nightAndSetting', PLACES.here, '2026-11-07T23:05:30+09:00');
    check(
      '주의 끔 + 야간 끔 → SUPPRESSED_SETTING (설정 검사가 먼저)',
      n7.data?.assessment.notify.decision === 'SUPPRESSED_SETTING',
    );
    await patchSettings(A, { cautionEnabled: true, nightEnabled: false });
    await setClock({ now: '2026-11-08T06:30:00+09:00' });
    const n8 = await night('earlyMorning', PLACES.here, '2026-11-08T06:20:00+09:00');
    check(
      '06:20 감지(야간) → SUPPRESSED_NIGHT, 일요일 weekday 문구',
      n8.data?.assessment.notify.decision === 'SUPPRESSED_NIGHT' &&
        n8.data.assessment.reasons[0].description.startsWith('일요일'),
      n8.data?.assessment,
    );
    await setClock({ now: T0 });
  });

  await step('알림 표시 보고 (PATCH delivery)', async () => {
    const suji = ev.suji.id;
    const ok1 = await delivery(A, suji, {
      deliveredAt: '2026-11-07T19:05:40+09:00',
      failure: null,
    });
    check(
      'SEND 이벤트 성공 보고 → 204 본문 없음',
      ok1.status === 204 && ok1.text === '',
      summary(ok1),
    );
    check(
      '저장된 deliveredAt',
      (await deliveryState(suji))?.deliveredAt === '2026-11-07T19:05:40+09:00',
    );
    check(
      '같은 보고 반복 → 204',
      (await delivery(A, suji, { deliveredAt: '2026-11-07T19:05:40+09:00', failure: null }))
        .status === 204,
    );
    check(
      '다른 성공 시각 → 204',
      (await delivery(A, suji, { deliveredAt: '2026-11-07T19:06:10+09:00' })).status === 204,
    );
    check(
      '성공 후 실패 보고 → 204',
      (await delivery(A, suji, { deliveredAt: null, failure: 'NO_PERMISSION' })).status === 204,
    );
    const kept = await deliveryState(suji);
    check(
      '최초 성공 유지, failure null',
      kept?.deliveredAt === '2026-11-07T19:05:40+09:00' && kept.deliveryFailure === null,
      kept,
    );
    expectError(
      '둘 다 null → 400',
      await delivery(A, suji, { deliveredAt: null, failure: null }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '둘 다 값 → 400',
      await delivery(A, suji, { deliveredAt: '2026-11-07T19:05:40+09:00', failure: 'UNKNOWN' }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      'failure 허용 외 값 → 400',
      await delivery(A, suji, { failure: 'MUTED' }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      'deliveredAt < confirmedAt → 400 (중복 보고에도 검증)',
      await delivery(A, suji, { deliveredAt: '2026-11-07T19:05:10+09:00' }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      'deliveredAt > 서버 시각 + 2분 → 400',
      await delivery(A, suji, { deliveredAt: shift(T0, 300) }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      'NONE 이벤트 → 409 DELIVERY_NOT_EXPECTED',
      await delivery(A, ev.dongbaek.id, { deliveredAt: shift(ev.dongbaek.body.confirmedAt, 10) }),
      409,
      'DELIVERY_NOT_EXPECTED',
    );
    expectError(
      'SUPPRESSED_SETTING 이벤트 → 409',
      await delivery(A, ev.suppressedSetting.id, { failure: 'UNKNOWN' }),
      409,
      'DELIVERY_NOT_EXPECTED',
    );
    expectError(
      'NONE 이벤트라도 시각 오류가 먼저 → 400',
      await delivery(A, ev.dongbaek.id, { deliveredAt: shift(ev.dongbaek.body.confirmedAt, -10) }),
      400,
      'INVALID_INPUT',
    );
    const here = ev.here.id;
    const confirmedAt = ev.here.body.confirmedAt;
    check(
      '실패 NO_PERMISSION → 204',
      (await delivery(A, here, { failure: 'NO_PERMISSION' })).status === 204,
    );
    check(
      '다른 실패 DISPLAY_FAILED → 204',
      (await delivery(A, here, { failure: 'DISPLAY_FAILED' })).status === 204,
    );
    check('최초 실패 유지', (await deliveryState(here))?.deliveryFailure === 'NO_PERMISSION');
    check(
      '실패 뒤 성공 → 204',
      (await delivery(A, here, { deliveredAt: shift(confirmedAt, 5) })).status === 204,
    );
    const switched = await deliveryState(here);
    check(
      '실패 → 성공 전환 (failure 비움)',
      switched?.deliveredAt === shift(confirmedAt, 5) && switched.deliveryFailure === null,
      switched,
    );
    expectError(
      '잘못된 UUID 경로 → 400',
      await delivery(A, 'not-a-uuid', { failure: 'UNKNOWN' }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '없는 이벤트 → 404 PARKING_EVENT_NOT_FOUND',
      await delivery(A, randomUUID(), { failure: 'UNKNOWN' }),
      404,
      'PARKING_EVENT_NOT_FOUND',
    );
    expectError(
      '남의 이벤트 → 404 PARKING_EVENT_NOT_FOUND',
      await delivery(B, suji, { failure: 'UNKNOWN' }),
      404,
      'PARKING_EVENT_NOT_FOUND',
    );
  });

  await step('조회: latest / 목록 / 상세 / 비동기 주소', async () => {
    await sleep((mockConfig.geocodeDelayMs ?? 1500) + 300);
    const sorted = [...created].sort((x, y) =>
      x.detectedAt === y.detectedAt ? 0 : Date.parse(y.detectedAt) - Date.parse(x.detectedAt),
    );
    const latest = await api('GET', '/api/v1/parking-events/latest', { token: A.token });
    check(
      'latest = 가장 늦은 detectedAt 이벤트',
      latest.status === 200 && latest.data.event?.id === sorted[0]?.id,
      latest.text.slice(0, 200),
    );
    check(
      'latest 모양 (event 5필드, assessment 요약 3필드, dataPeriod)',
      sameKeys(latest.data, ['event', 'assessment', 'dataPeriod']) &&
        sameKeys(latest.data.event, KEYS.event) &&
        sameKeys(latest.data.assessment, ['status', 'level', 'predictionStatus']) &&
        same(latest.data.dataPeriod, { start: '2025-01-01', end: '2025-09-25' }),
      latest.data,
    );
    const emptyLatest = await api('GET', '/api/v1/parking-events/latest', { token: B.token });
    check(
      '기록 없음 → event·assessment null, dataPeriod 는 항상',
      emptyLatest.status === 200 &&
        same(emptyLatest.data, {
          event: null,
          assessment: null,
          dataPeriod: { start: '2025-01-01', end: '2025-09-25' },
        }),
      emptyLatest.text,
    );
    const all = await api('GET', '/api/v1/parking-events', { token: A.token });
    const items = all.data?.items ?? [];
    check(
      '목록 ALL = 내 기록 전부, detectedAt 최신순',
      all.status === 200 &&
        items.length === Math.min(50, created.length) &&
        items.every(
          (item, i) =>
            i === 0 ||
            Date.parse(items[i - 1].event.detectedAt) >= Date.parse(item.event.detectedAt),
        ),
      `${items.length} / ${created.length}`,
    );
    check(
      '목록 항목 모양',
      items.every(
        (item) =>
          sameKeys(item, ['event', 'assessment']) &&
          sameKeys(item.event, ['id', 'detectedAt', 'address']) &&
          sameKeys(item.assessment, KEYS.listAssessment),
      ),
    );
    check(
      'ALL 에 PARTIAL·FAILED·3단계 포함',
      ['PARTIAL', 'FAILED'].every((s) => items.some((i) => i.assessment.status === s)) &&
        items.some((i) => i.assessment.level === 3),
    );
    const levelOne = await api('GET', '/api/v1/parking-events?level=1', { token: A.token });
    const ones = levelOne.data?.items ?? [];
    check(
      'level=1 → 1단계만, distanceM 값, topPercent null',
      ones.length === created.filter((c) => c.level === 1).length &&
        ones.every(
          (i) =>
            i.assessment.level === 1 &&
            typeof i.assessment.distanceM === 'number' &&
            i.assessment.topPercent === null,
        ),
      `${ones.length}`,
    );
    const levelTwo = await api('GET', '/api/v1/parking-events?level=2', { token: A.token });
    const twos = levelTwo.data?.items ?? [];
    check(
      'level=2 → 2단계만, topPercent 값, distanceM null',
      twos.length === created.filter((c) => c.level === 2).length &&
        twos.every(
          (i) =>
            i.assessment.level === 2 &&
            typeof i.assessment.topPercent === 'number' &&
            i.assessment.distanceM === null,
        ),
      `${twos.length}`,
    );
    const limited = await api('GET', '/api/v1/parking-events?level=ALL&limit=3', {
      token: A.token,
    });
    check('limit=3 → 3건', limited.data?.items.length === 3);
    for (const query of ['limit=0', 'limit=101', 'limit=abc', 'limit=', 'level=3', 'level=all']) {
      expectError(
        `목록 ${query} → 400`,
        await api('GET', `/api/v1/parking-events?${query}`, { token: A.token }),
        400,
        'INVALID_INPUT',
      );
    }
    const emptyList = await api('GET', '/api/v1/parking-events', { token: B.token });
    check('기록 없음 → items []', same(emptyList.data, { items: [] }));

    const detail = await getEvent(A, ev.suji.id);
    const d = detail.data;
    const peak = d?.assessment.stats.peak;
    check(
      '상세 = event + assessment(POST 구조 + stats.peak)',
      detail.status === 200 &&
        sameKeys(d, ['event', 'assessment']) &&
        sameKeys(d.event, KEYS.event) &&
        sameKeys(d.assessment, KEYS.assessment) &&
        sameKeys(d.assessment.stats, [...KEYS.stats, 'peak']),
      d,
    );
    check(
      '상세 event: 확정 좌표·저장 당시 차량명·채워진 주소',
      same(d?.event.confirmedLocation, PLACES.suji) &&
        d.event.vehicleName === '아반떼 N' &&
        d.event.address === '경기 용인시 수지구 풍덕천동 1167-1',
      d?.event,
    );
    check(
      '1단계 peak = {weekday 6, timeSlot 최다(동점은 이른), slotCounts 8개}',
      sameKeys(peak, ['weekday', 'timeSlot', 'slotCounts']) &&
        peak.weekday === 6 &&
        peak.slotCounts.length === 8 &&
        peak.slotCounts.every((n) => Number.isInteger(n) && n >= 0) &&
        peak.timeSlot === argmaxEarliest(peak.slotCounts),
      peak,
    );
    const detailTwo = await getEvent(A, ev.here.id);
    check('2단계 상세 peak 있음', detailTwo.data?.assessment.stats.peak?.slotCounts.length === 8);
    for (const label of ['dongbaek', 'seoul', 'terminalFailed']) {
      const res = await getEvent(A, ev[label].id);
      check(
        `${label} 상세 peak = null (키는 존재)`,
        res.status === 200 &&
          'peak' in res.data.assessment.stats &&
          res.data.assessment.stats.peak === null,
        res.data?.assessment.stats,
      );
    }
    const seoul = await getEvent(A, ev.seoul.id);
    check(
      '용인 밖 이벤트도 주소 채움',
      seoul.data?.event.address === '서울 중구 태평로1가 31',
      seoul.data?.event,
    );
    const replay = await postEvent(A, ev.suji.body);
    check(
      '주소 채운 뒤 재요청 응답에 address 포함',
      replay.data?.address === '경기 용인시 수지구 풍덕천동 1167-1',
    );
    expectError('남의 상세 → 404', await getEvent(B, ev.suji.id), 404, 'PARKING_EVENT_NOT_FOUND');
    expectError('없는 상세 → 404', await getEvent(A, randomUUID()), 404, 'PARKING_EVENT_NOT_FOUND');
    expectError('잘못된 UUID 상세 → 400', await getEvent(A, '12345'), 400, 'INVALID_INPUT');
  });

  await step('주변 주차장', async () => {
    const hereQuery = `lat=${PLACES.here.lat}&lng=${PLACES.here.lng}`;
    const normal = await nearby(A, hereQuery);
    const items = normal.data?.items ?? [];
    check(
      '현재 위치 기본 500m → expanded false, 4곳 이상, 모두 500m 이내, 거리순',
      normal.status === 200 &&
        normal.data.radiusM === 500 &&
        normal.data.expanded === false &&
        items.length >= 4 &&
        items.every(
          (i, n) => i.distanceM <= 500 && (n === 0 || items[n - 1].distanceM <= i.distanceM),
        ),
      normal.text.slice(0, 200),
    );
    check(
      '주차장 항목 필드 (없는 값은 명시적 null)',
      items.every(
        (i) => sameKeys(i, KEYS.lot) && sameKeys(i.location, ['lat', 'lng']) && UUID_RE.test(i.id),
      ),
    );
    const byName = (name) => items.find((i) => i.name === name);
    check(
      '토요일 → 토요일 운영시간 (09:00-15:00)',
      byName('풍덕천2동 노상공영주차장')?.operatingHours === '09:00-15:00',
    );
    check('24시간 = 00:00-23:59', byName('수지구청 공영주차장')?.operatingHours === '00:00-23:59');
    const overnight = byName('수지 먹자골목 민영주차장');
    check(
      '자정 넘김 18:00-02:00, capacity null, PRIVATE',
      overnight?.operatingHours === '18:00-02:00' &&
        overnight.capacity === null &&
        overnight.parkingType === 'PRIVATE',
      overnight,
    );
    const attached = byName('신정마을 부설주차장');
    check(
      'ATTACHED, feeType·feeInfo·operatingHours null',
      attached?.parkingType === 'ATTACHED' &&
        attached.feeType === null &&
        attached.feeInfo === null &&
        attached.operatingHours === null,
      attached,
    );
    const wide = await nearby(A, `${hereQuery}&radius=1000`);
    check(
      'radius=1000 → 6곳 이상, expanded false',
      wide.data?.radiusM === 1000 && wide.data.expanded === false && wide.data.items.length >= 6,
      wide.text.slice(0, 120),
    );
    const small = await nearby(A, `${hereQuery}&radius=300`);
    check(
      'radius=300 → 300m 이내만',
      small.data?.radiusM === 300 && small.data.items.every((i) => i.distanceM <= 300),
    );
    const giheungQuery = `lat=${PLACES.giheung.lat}&lng=${PLACES.giheung.lng}`;
    const expanded = await nearby(A, giheungQuery);
    check(
      '기흥역: 500m 안에 없음 → expanded true, radiusM 1000, 500~1000m 만',
      expanded.data?.expanded === true &&
        expanded.data.radiusM === 1000 &&
        expanded.data.items.length > 0 &&
        expanded.data.items.every((i) => i.distanceM > 500 && i.distanceM <= 1000),
      expanded.text.slice(0, 200),
    );
    const noExpand = await nearby(A, `${giheungQuery}&radius=300`);
    check(
      'radius≠500 이면 넓히지 않음 → expanded false, items []',
      same(noExpand.data, { radiusM: 300, expanded: false, items: [] }),
      noExpand.text,
    );
    const none = await nearby(A, `lat=${PLACES.dongbaek.lat}&lng=${PLACES.dongbaek.lng}`);
    check(
      '동백호수공원: 1km 에도 없음 → expanded true, items []',
      same(none.data, { radiusM: 1000, expanded: true, items: [] }),
      none.text,
    );
    for (const query of [
      'lat=91&lng=127',
      `${hereQuery}&radius=0`,
      `${hereQuery}&radius=1001`,
      `${hereQuery}&radius=12.5`,
      'lat=37.3',
      'lat=abc&lng=127',
    ]) {
      expectError(`주차장 ${query} → 400`, await nearby(A, query), 400, 'INVALID_INPUT');
    }
    expectError(
      '위치 미동의 사용자 → 403',
      await nearby(B, hereQuery),
      403,
      'LOCATION_CONSENT_REQUIRED',
    );
    expectError(
      '미동의여도 파라미터 오류가 먼저 → 400',
      await nearby(B, 'lat=99&lng=127'),
      400,
      'INVALID_INPUT',
    );
    const hoursOn = async (now) => {
      await setClock({ now });
      const res = await nearby(A, hereQuery);
      return res.data?.items.find((i) => i.name === '풍덕천2동 노상공영주차장')?.operatingHours;
    };
    check('일요일 → 공휴일 칸(null)', (await hoursOn('2026-11-08T12:00:00+09:00')) === null);
    check(
      '월요일 → 평일 칸 09:00-19:00',
      (await hoursOn('2026-11-09T12:00:00+09:00')) === '09:00-19:00',
    );
    check(
      '평일 공휴일(12/25) → 공휴일 칸(null)',
      (await hoursOn('2026-12-25T12:00:00+09:00')) === null,
    );
    await setClock({ now: T0 });
  });

  await step('지도 위험 구역', async () => {
    const box = (lat, lng, dLat, dLng) =>
      `minLat=${lat - dLat}&minLng=${lng - dLng}&maxLat=${lat + dLat}&maxLng=${lng + dLng}`;
    const hereBox = box(PLACES.here.lat, PLACES.here.lng, 0.0036, 0.0045);
    const saturday = await riskZones(B, `${hereBox}&at=2026-11-07T19:05:00%2B09:00`);
    const d = saturday.data;
    check('위치 동의 없이도 200', saturday.status === 200, summary(saturday));
    check(
      '최상위 필드 순서 = facilityZones, cells, slot, dataPeriod',
      same(Object.keys(d ?? {}), ['facilityZones', 'cells', 'slot', 'dataPeriod']),
    );
    check('slot = 토요일(6) 18~21시(6)', same(d?.slot, { weekday: 6, timeSlot: 6 }));
    check('dataPeriod', same(d?.dataPeriod, { start: '2025-01-01', end: '2025-09-25' }));
    const zones = d?.facilityZones ?? [];
    check(
      '현재 위치 주변 소화전·버스정류소 구역 (radiusM 5/10, 유형순)',
      zones.length >= 6 &&
        zones.some((z) => z.zoneType === 'HYDRANT') &&
        zones.some((z) => z.zoneType === 'BUS_STOP') &&
        zones.every(
          (z) =>
            sameKeys(z, ['zoneType', 'location', 'radiusM']) &&
            z.radiusM === (z.zoneType === 'HYDRANT' ? 5 : 10),
        ) &&
        zones.every((z, i) => i === 0 || zones[i - 1].zoneType <= z.zoneType),
      zones,
    );
    const cells = d?.cells ?? [];
    const hereCell = cells.find((c) => c.topPercent === 8);
    check(
      '노란 칸: 모두 topPercent ≤ 10, sizeM 50',
      cells.length > 0 &&
        cells.every(
          (c) =>
            sameKeys(c, ['location', 'sizeM', 'topPercent', 'reportCount']) &&
            c.sizeM === 50 &&
            c.topPercent <= 10,
        ),
      cells,
    );
    check(
      '현재 위치 칸 = 상위 8%, 신고 587건, 중심이 50m 이내',
      hereCell?.reportCount === 587 &&
        Math.abs(hereCell.location.lat - PLACES.here.lat) < 0.0005 &&
        Math.abs(hereCell.location.lng - PLACES.here.lng) < 0.0006,
      hereCell,
    );
    check(
      '신고 0건인 노란 칸 존재',
      cells.some((c) => c.reportCount === 0),
    );
    const monday = await riskZones(B, `${hereBox}&at=2026-11-09T10:00:00%2B09:00`);
    check(
      '월 09~12시엔 시간대 한정 칸 2개가 빠짐',
      same(monday.data?.slot, { weekday: 1, timeSlot: 3 }) &&
        monday.data.cells.length === cells.length - 2,
      `${monday.data?.cells.length} vs ${cells.length}`,
    );
    const holiday = await riskZones(B, `${hereBox}&at=2026-12-25T13:00:00%2B09:00`);
    check(
      '공휴일(금) → weekday 7',
      same(holiday.data?.slot, { weekday: 7, timeSlot: 4 }),
      holiday.data?.slot,
    );
    const utc = await riskZones(B, `${hereBox}&at=2026-11-07T10:05:00Z`);
    check('같은 순간 UTC 표기 → 같은 slot', same(utc.data?.slot, { weekday: 6, timeSlot: 6 }));
    await setClock({ now: T0 });
    const defaultAt = await riskZones(B, hereBox);
    check(
      'at 생략 → 목 서버 현재 시각 기준 slot',
      same(defaultAt.data?.slot, { weekday: 6, timeSlot: 6 }),
    );
    expectError(
      'at 의 + 를 인코딩하지 않으면 → 400',
      await riskZones(B, `${hereBox}&at=2026-11-07T19:05:00+09:00`),
      400,
      'INVALID_INPUT',
    );
    expectError(
      'at 형식 오류 → 400',
      await riskZones(B, `${hereBox}&at=tomorrow`),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '한 변 2km 초과 → 400',
      await riskZones(B, box(PLACES.here.lat, PLACES.here.lng, 0.0095, 0.001)),
      400,
      'INVALID_INPUT',
    );
    expectOk(
      '한 변 약 1.9km → 200',
      await riskZones(B, box(PLACES.here.lat, PLACES.here.lng, 0.0085, 0.0105)),
    );
    expectOk(
      '점(min=max) 범위 → 200',
      await riskZones(B, box(PLACES.here.lat, PLACES.here.lng, 0, 0)),
    );
    expectError(
      'min > max → 400',
      await riskZones(B, 'minLat=37.33&minLng=127.09&maxLat=37.32&maxLng=127.1'),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '필수 파라미터 누락 → 400',
      await riskZones(B, 'minLat=37.32&minLng=127.09&maxLat=37.33'),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '위도 범위 밖 → 400',
      await riskZones(B, 'minLat=90&minLng=127&maxLat=91&maxLng=127'),
      400,
      'INVALID_INPUT',
    );
    const hydrant = zones
      .filter((z) => z.zoneType === 'HYDRANT')
      .sort(
        (x, y) =>
          Math.hypot(x.location.lat - PLACES.suji.lat, x.location.lng - PLACES.suji.lng) -
          Math.hypot(y.location.lat - PLACES.suji.lat, y.location.lng - PLACES.suji.lng),
      )[0];
    if (hydrant) {
      const below = (gap) =>
        `minLat=${hydrant.location.lat - 0.0005}&minLng=${hydrant.location.lng - 0.0003}` +
        `&maxLat=${hydrant.location.lat - gap}&maxLng=${hydrant.location.lng + 0.0003}`;
      const touching = await riskZones(B, below(0.00003));
      check(
        '시설 중심이 화면 밖(약 3m)이어도 반경 5m 가 닿으면 포함',
        touching.data?.facilityZones.some((z) => same(z.location, hydrant.location)),
        touching.data?.facilityZones,
      );
      const apart = await riskZones(B, below(0.0001));
      check(
        '약 11m 떨어지면 제외',
        apart.status === 200 &&
          !apart.data.facilityZones.some((z) => same(z.location, hydrant.location)),
      );
    } else {
      check('수지구청 앞 소화전 구역 찾기', false);
    }
  });

  await step('토큰 재발급·재사용·로그아웃', async () => {
    const rotated = await api('POST', '/api/v1/auth/refresh', {
      body: { refreshToken: A.refresh },
    });
    expectOk('refresh → 200', rotated);
    check(
      'refresh 응답 = {accessToken, refreshToken, expiresIn}, 새 리프레시',
      sameKeys(rotated.data, KEYS.tokens) && rotated.data.refreshToken !== A.refresh,
      rotated.data && Object.keys(rotated.data),
    );
    expectOk(
      '새 액세스 토큰으로 GET /me',
      await api('GET', '/api/v1/me', { token: rotated.data?.accessToken }),
    );
    expectError(
      '회전 전 리프레시 재사용 → 401 TOKEN_REUSED',
      await api('POST', '/api/v1/auth/refresh', { body: { refreshToken: A.refresh } }),
      401,
      'TOKEN_REUSED',
    );
    expectError(
      '재사용 감지 뒤 같은 family 의 최신 토큰도 폐기 → 401 TOKEN_REUSED',
      await api('POST', '/api/v1/auth/refresh', {
        body: { refreshToken: rotated.data?.refreshToken },
      }),
      401,
      'TOKEN_REUSED',
    );
    expectError(
      '모르는 리프레시 → 401 UNAUTHORIZED',
      await api('POST', '/api/v1/auth/refresh', { body: { refreshToken: 'unknown-token' } }),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      '빈 리프레시 → 400',
      await api('POST', '/api/v1/auth/refresh', { body: { refreshToken: '' } }),
      400,
      'INVALID_INPUT',
    );
    const first = await session('contract-a');
    const second = await session('contract-a');
    const logout = (s, refreshToken) =>
      api('POST', '/api/v1/auth/logout', { token: s?.token, body: { refreshToken } });
    const out = await logout(first, first.refresh);
    check('logout → 204 본문 없음', out.status === 204 && out.text === '', summary(out));
    expectError(
      '로그아웃한 family 의 리프레시 → 401 TOKEN_REUSED',
      await api('POST', '/api/v1/auth/refresh', { body: { refreshToken: first.refresh } }),
      401,
      'TOKEN_REUSED',
    );
    expectOk(
      '다른 family(다른 기기) 리프레시는 유지 → 200',
      await api('POST', '/api/v1/auth/refresh', { body: { refreshToken: second.refresh } }),
    );
    check('이미 폐기된 토큰으로 logout → 204', (await logout(first, first.refresh)).status === 204);
    expectError(
      '남의 리프레시로 logout → 403 FORBIDDEN',
      await logout(first, B.refresh),
      403,
      'FORBIDDEN',
    );
    expectError(
      '모르는 리프레시로 logout → 401',
      await logout(first, 'unknown-token'),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      'Bearer 없이 logout → 401',
      await logout(null, second.refresh),
      401,
      'UNAUTHORIZED',
    );
    expectOk(
      '로그아웃 후에도 액세스 토큰은 만료까지 유효',
      await api('GET', '/api/v1/me', { token: first.token }),
    );
  });

  await step('TOKEN_EXPIRED (별도 인스턴스, MOCK_ACCESS_TTL_SEC=2)', async () => {
    const short = await startMockServer({ port: 0, accessTtlSec: 2, log: false });
    try {
      const s = await session('ttl-user', short.url);
      check('짧은 TTL expiresIn = 2', s.res.data.expiresIn === 2);
      expectOk(
        '발급 직후 GET /me 200',
        await api('GET', '/api/v1/me', { token: s.token, url: short.url }),
      );
      await sleep(2200);
      const expired = await api('GET', '/api/v1/me', { token: s.token, url: short.url });
      expectError('만료된 액세스 → 401 TOKEN_EXPIRED', expired, 401, 'TOKEN_EXPIRED');
      check(
        'TOKEN_EXPIRED 에도 WWW-Authenticate',
        expired.headers.get('www-authenticate') === 'Bearer',
      );
      const renewed = await api('POST', '/api/v1/auth/refresh', {
        body: { refreshToken: s.refresh },
        url: short.url,
      });
      expectOk('만료 후 refresh → 200', renewed);
      expectOk(
        '새 토큰으로 재시도 → 200',
        await api('GET', '/api/v1/me', { token: renewed.data?.accessToken, url: short.url }),
      );
    } finally {
      await short.close();
    }
  });

  await step('활성 예측 버전 없음 (별도 인스턴스, MOCK_MODEL_ACTIVE=0)', async () => {
    const noModel = await startMockServer({
      port: 0,
      modelActive: false,
      log: false,
      geocodeDelayMs: 0,
    });
    try {
      const s = await session('model-off', noModel.url);
      await agreeAll(s);
      const vehicle = await putVehicle(s, {
        name: '테스트카',
        bluetoothAddress: 'AA:00:00:00:00:01',
      });
      const now = Date.now();
      const body = (place, offset) =>
        eventBody(place, {
          vehicleId: vehicle.data?.vehicle.id,
          detectedAt: kstIso(now - offset * 1000),
          confirmedAt: kstIso(now - offset * 1000 + 10000),
        });
      const partial = await postEvent(s, body(PLACES.here, 120));
      check(
        '모델 없음 → PARTIAL / NO_ACTIVE_VERSION',
        partial.data?.assessment.status === 'PARTIAL' &&
          partial.data.assessment.predictionStatus === 'NO_ACTIVE_VERSION',
        partial.data?.assessment,
      );
      const facility = await postEvent(s, body(PLACES.suji, 60));
      check('시설 규칙은 그대로 1단계', facility.data?.assessment.level === 1);
      const detail = await getEvent(s, facility.data?.parkingEventId);
      check('활성 버전 없으면 peak null', detail.data?.assessment.stats.peak === null);
      const latest = await api('GET', '/api/v1/parking-events/latest', {
        token: s.token,
        url: noModel.url,
      });
      check('latest dataPeriod null', latest.status === 200 && latest.data.dataPeriod === null);
      const map = await riskZones(
        s,
        `minLat=37.3185&minLng=127.0937&maxLat=37.3257&maxLng=127.1027&at=2026-12-25T13:00:00%2B09:00`,
      );
      check(
        '지도: cells [], dataPeriod null, 공휴일 치환 없음(금=5)',
        map.status === 200 &&
          same(map.data.cells, []) &&
          map.data.dataPeriod === null &&
          map.data.facilityZones.length > 0 &&
          same(map.data.slot, { weekday: 5, timeSlot: 4 }),
        map.data,
      );
    } finally {
      await noModel.close();
    }
  });

  await step('카카오 연결 끊기 웹훅', async () => {
    const appId = mockConfig.kakaoAppId ?? 'mock-app-id';
    const C = await session('4242424242');
    const webhook = (
      form,
      authorization = `KakaoAK ${ADMIN_KEY}`,
      type = 'application/x-www-form-urlencoded',
    ) =>
      api('POST', '/api/v1/webhooks/kakao/unlink', {
        raw:
          type === 'application/json' ? JSON.stringify(form) : new URLSearchParams(form).toString(),
        headers: {
          'Content-Type': type,
          ...(authorization ? { Authorization: authorization } : {}),
        },
      });
    const form = { app_id: appId, user_id: '4242424242', referrer_type: 'UNLINK_FROM_APPS' };
    expectError(
      '잘못된 어드민 키 → 401',
      await webhook(form, 'KakaoAK wrong-key'),
      401,
      'UNAUTHORIZED',
    );
    expectError('Authorization 없음 → 401', await webhook(form, null), 401, 'UNAUTHORIZED');
    expectError(
      'app_id 누락 → 400',
      await webhook({ user_id: '4242424242', referrer_type: 'UNLINK_FROM_APPS' }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      '폼·JSON 외 형식 → 415',
      await webhook(form, `KakaoAK ${ADMIN_KEY}`, 'text/plain'),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
    const otherApp = await webhook({ ...form, app_id: 'another-app' });
    check('app_id 불일치 → 200 무시', otherApp.status === 200 && otherApp.text === '');
    expectOk('무시된 뒤에도 회원 유지', await api('GET', '/api/v1/me', { token: C.token }));
    const unlinked = await webhook(form);
    check(
      '정상 웹훅 → 200 본문 없음',
      unlinked.status === 200 && unlinked.text === '',
      summary(unlinked),
    );
    expectError(
      '삭제된 회원의 토큰 → 401 UNAUTHORIZED',
      await api('GET', '/api/v1/me', { token: C.token }),
      401,
      'UNAUTHORIZED',
    );
    check('없는 회원 → 200', (await webhook({ ...form, user_id: '999999999' })).status === 200);
    const E = await session('contract-e');
    const json = await webhook(
      { app_id: appId, user_id: 'contract-e', referrer_type: 'ACCOUNT_DELETE' },
      `KakaoAK ${ADMIN_KEY}`,
      'application/json',
    );
    check('JSON 본문 웹훅도 처리 → 200', json.status === 200);
    expectError(
      'JSON 웹훅으로 삭제됨',
      await api('GET', '/api/v1/me', { token: E.token }),
      401,
      'UNAUTHORIZED',
    );
    const relogin = await login('4242424242');
    check('같은 카카오 계정 재로그인 → 신규 가입', relogin.data?.isNewUser === true);
  });

  await step('회원 탈퇴 DELETE /me', async () => {
    const s = await session('contract-d');
    await agreeAll(s);
    const vehicle = await putVehicle(s, {
      name: '삭제될 차',
      bluetoothAddress: 'DD:DD:DD:DD:DD:01',
    });
    const event = await postEvent(
      s,
      eventBody(PLACES.here, { vehicleId: vehicle.data?.vehicle.id, detectedAt: D(170) }),
    );
    check('탈퇴 전 주차 기록 생성', event.status === 201);
    const removed = await api('DELETE', '/api/v1/me', { token: s.token });
    check(
      'DELETE /me → 204 본문 없음',
      removed.status === 204 && removed.text === '',
      summary(removed),
    );
    expectError(
      '탈퇴 후 같은 토큰 → 401 UNAUTHORIZED',
      await api('GET', '/api/v1/me', { token: s.token }),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      '탈퇴 후 리프레시 → 401 UNAUTHORIZED',
      await api('POST', '/api/v1/auth/refresh', { body: { refreshToken: s.refresh } }),
      401,
      'UNAUTHORIZED',
    );
    const again = await session('contract-d');
    check(
      '재가입 = 신규, 약관·차량·기록 모두 없음',
      again.res.data.isNewUser === true &&
        same(again.res.data.agreements.missing, ['TERMS', 'PRIVACY', 'LOCATION_SERVICE']),
    );
    const vehicleAfter = await api('GET', '/api/v1/vehicle', { token: again.token });
    const listAfter = await api('GET', '/api/v1/parking-events', { token: again.token });
    const settingsAfter = await api('GET', '/api/v1/notification-settings', { token: again.token });
    check(
      'CASCADE: vehicle null, items [], 설정은 기본값으로 새로',
      vehicleAfter.data?.vehicle === null &&
        same(listAfter.data, { items: [] }) &&
        same(settingsAfter.data, {
          dangerEnabled: true,
          cautionEnabled: true,
          nightEnabled: false,
        }),
    );
  });

  await step('개발용 /__mock 도우미', async () => {
    const log = await api('GET', '/__mock/requests');
    const items = log.data?.items ?? [];
    check(
      '요청 기록: method·path(쿼리 포함)·status·errorCode·time',
      items.length > 0 &&
        items.every((i) =>
          sameKeys(i, ['time', 'method', 'path', 'status', 'errorCode', 'durationMs']),
        ) &&
        items.some(
          (i) => i.method === 'POST' && i.path === '/api/v1/parking-events' && i.status === 201,
        ) &&
        items.some((i) => i.status === 409 && i.errorCode === 'IDEMPOTENCY_KEY_REUSED') &&
        items.some((i) => i.path.startsWith('/api/v1/parking-lots/nearby?')),
      items.slice(0, 3),
    );
    check('요청 기록은 최대 200개', items.length <= 200);
    expectError(
      'clock now 형식 오류 → 400',
      await setClock({ now: 'yesterday' }),
      400,
      'INVALID_INPUT',
    );
    expectError(
      'clock offsetMs 문자열 → 400',
      await setClock({ offsetMs: 'x' }),
      400,
      'INVALID_INPUT',
    );
    const offset = await setClock({ offsetMs: 60000 });
    check('clock offsetMs → 반영', offset.data?.offsetMs === 60000);
    const back = await setClock({});
    check('clock {} → 실제 시각으로 복귀', back.data?.offsetMs === 0);
    const state = await api('GET', '/__mock/state');
    check(
      '/__mock/state 에 토큰 없음',
      state.status === 200 &&
        Array.isArray(state.data.users) &&
        !/refresh|accessToken/i.test(state.text),
    );
  });
}

async function main() {
  let spawned = null;
  if (process.argv.includes('--spawn')) {
    spawned = await startMockServer({ port: 0, log: false });
    base = spawned.url;
  }
  console.log(`contract-check → ${base}`);
  let fatal = null;
  try {
    await fetch(`${base}/api/v1/health`);
  } catch (error) {
    fatal = `서버에 연결할 수 없습니다 (${error.cause?.code ?? error.message}). 목 서버를 먼저 띄우거나 --spawn 을 쓰세요.`;
  }
  if (!fatal) {
    try {
      await scenario();
    } catch (error) {
      fatal = error.message;
    } finally {
      await setClock({}).catch(() => {});
    }
  }
  if (spawned) await spawned.close();
  if (fatal) {
    console.log(`\n✗ ${fatal}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${failed.length === 0 ? '✓' : '✗'} ${passed} passed, ${failed.length} failed`);
  if (failed.length > 0) {
    for (const name of failed) console.log(`  - ${name}`);
    process.exitCode = 1;
  }
}

await main();
