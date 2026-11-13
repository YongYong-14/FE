/* global __dirname */
// 실제 리포트·기록 코드를 실행하고 저장소 경계만 메모리로 대체한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const memory = new Map();
const cache = new Map();
function load(id, parent = path.join(root, 'src/index.ts')) {
  if (id === '@react-native-async-storage/async-storage')
    return {
      __esModule: true,
      default: {
        getItem: async (key) => memory.get(key) ?? null,
        setItem: async (key, value) => memory.set(key, value),
        multiRemove: async (keys) => keys.forEach((key) => memory.delete(key)),
      },
    };
  const target = id.startsWith('@/')
    ? path.join(root, 'src', id.slice(2))
    : path.resolve(path.dirname(parent), id);
  const file = [target, target + '.ts'].find(
    (file) => fs.existsSync(file) && fs.statSync(file).isFile(),
  );
  assert(file, 'Unknown dependency: ' + id);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  new Function('module', 'exports', 'require', outputText)(module, module.exports, (dep) =>
    load(dep, file),
  );
  return module.exports;
}
const { withCrosswalkEvidence, withCrosswalkDecision } = load('@/shared/utils/crosswalk');
const { mergeRecord, mergeRemoteRecords, mergeRecordsForLevel } = load(
  '@/features/parking/utils/records',
);
const records = load('@/storage/records');
const { storageKeys } = load('@/storage/keys');
const { toParkingEventRequest } = load('@/services/api/mappers');
const report = (status = 'no-risk-found') => ({
  status,
  badge: '서버 배지',
  headline: '서버 제목',
  summary: '서버 요약',
  evidence: [],
  stats: [{ label: '반경 50m 신고', value: '12건' }],
  unavailable: [],
});
const record = (id = 'event-1', answer = 'yes', status = 'no-risk-found') => ({
  id,
  parkedAt: '2026-11-12T01:00:00Z',
  place: {
    id: 'place',
    name: '주차 위치',
    address: '용인시',
    coordinate: { latitude: 37.272352, longitude: 127.12775 },
    isSupportedRegion: true,
  },
  crosswalkAnswer: answer,
  status,
  report: report(status),
  updatedAt: '2026-11-12T01:00:00Z',
  detailed: true,
});
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('예 응답은 서버의 위험 정보 없음을 직접 응답 기반 1단계로 표시', () => {
  const original = report();
  const result = withCrosswalkEvidence(original, 'yes');
  assert.equal(result.status, 'level-1');
  assert.equal(result.source, 'user-crosswalk');
  assert.equal(result.headline, '횡단보도 주변이에요');
  assert.equal(result.evidence[0].value, '예');
  assert.equal(original.status, 'no-risk-found');
  assert.equal(original.evidence.length, 0);
});
test('아니요 응답은 서버 결과를 유지하며 1단계를 새로 만들지 않음', () => {
  for (const status of ['no-risk-found', 'level-2', 'failed', 'insufficient-data']) {
    const result = withCrosswalkEvidence(report(status), 'no');
    assert.equal(result.status, status);
    assert.equal(result.evidence[0].value, '아니요');
    assert.notEqual(result.source, 'user-crosswalk');
  }
});
test('이미 서버 1단계이면 시설 이름·거리·과태료를 유지', () => {
  const original = {
    ...report('level-1'),
    headline: '소화전 주변이에요',
    stats: [{ label: '예상 과태료 (최대)', value: '8만 원' }],
    evidence: [{ label: '소화전까지 거리', value: '3m' }],
  };
  const result = withCrosswalkEvidence(original, 'yes');
  assert.equal(result.headline, original.headline);
  assert.deepEqual(result.stats, original.stats);
  assert.equal(result.evidence.length, 2);
});
test('횡단보도 응답에서 실측 거리와 과태료를 만들어 넣지 않음', () => {
  const original = {
    ...report('level-2'),
    stats: [
      { label: '반경 50m 신고', value: '12건' },
      { label: '예상 과태료 (금지 구역이라면)', value: '12만 원' },
    ],
  };
  const result = withCrosswalkEvidence(original, 'yes');
  assert.deepEqual(result.stats, [original.stats[0]]);
  assert.deepEqual(
    result.evidence.map((e) => e.value),
    ['예'],
  );
  assert.equal(result.notes, undefined);
});
test('서버 정보 부족·실패와 구분하여 사용자 제공 위험 근거 유지', () => {
  for (const status of ['insufficient-data', 'failed']) {
    const result = withCrosswalkEvidence(
      { ...report(status), stats: [], unavailable: ['신고 집중도'] },
      'yes',
    );
    assert.equal(result.status, 'level-1');
    assert.equal(result.source, 'user-crosswalk');
    assert.deepEqual(result.stats, []);
  }
});
test('같은 응답을 다시 적용해도 판정 근거가 중복되지 않음', () => {
  const once = withCrosswalkEvidence(report(), 'yes');
  assert.deepEqual(withCrosswalkEvidence(once, 'yes'), once);
  assert.strictEqual(withCrosswalkEvidence(once, null), once);
});
test('기록 분류와 리포트 분류가 일치하고 서버 원본을 보관', () => {
  const original = record();
  const next = withCrosswalkDecision(original);
  assert.equal(next.status, 'level-1');
  assert.equal(next.report.status, 'level-1');
  assert.equal(next.serverReport.status, 'no-risk-found');
  assert.equal(original.status, 'no-risk-found');
});
test('상세 재조회에서 서버가 다시 3단계를 보내도 직접 응답 1단계 유지', () => {
  const cached = withCrosswalkDecision(record());
  const remote = record('event-1', null);
  remote.report.stats = [{ label: '반경 50m 신고', value: '24건' }];
  const next = mergeRecord(remote, cached);
  assert.equal(next.status, 'level-1');
  assert.equal(next.report.stats[0].value, '24건');
  assert.equal(next.serverReport.status, 'no-risk-found');
  assert.equal(next.crosswalkAnswer, 'yes');
});
test('서버 전체 목록 새로고침 후에도 직접 응답 결과 유지', () => {
  const next = mergeRemoteRecords([record('event-1', null)], [withCrosswalkDecision(record())]);
  assert.equal(next[0].status, 'level-1');
  assert.equal(next[0].report.source, 'user-crosswalk');
});
test('서버 원본을 사용해 예에서 아니요로 바꿀 때 이전 보정이 남지 않음', () => {
  const cached = withCrosswalkDecision(record());
  const next = withCrosswalkDecision({ ...cached, crosswalkAnswer: 'no' });
  assert.equal(next.status, 'no-risk-found');
  assert.equal(next.serverReport, undefined);
  assert.equal(next.report.evidence[0].value, '아니요');
});
test('1단계 필터는 서버 필터에 없는 기기의 예 응답 기록도 포함', () => {
  const result = mergeRecordsForLevel([], [record('local-yes')], 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'level-1');
});
test('2단계 필터에서는 예 응답으로 1단계가 된 기록을 제외', () => {
  const yes = record('yes', null, 'level-2');
  const no = record('no', null, 'level-2');
  const result = mergeRecordsForLevel([yes, no], [record('yes', 'yes', 'level-2')], 2);
  assert.deepEqual(
    result.map((r) => r.id),
    ['no'],
  );
});
test('서버와 로컬에 같은 기록이 있어도 1단계 목록에서 중복되지 않음', () => {
  const result = mergeRecordsForLevel([record('event-1', null, 'level-1')], [record()], 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].report.source, undefined);
});
test('과거에 저장한 예 응답 기록을 읽는 즉시 1단계로 복원', async () => {
  memory.set(storageKeys.records, JSON.stringify([record()]));
  const [restored] = await records.listRecords();
  assert.equal(restored.status, 'level-1');
  assert.equal(restored.serverReport.status, 'no-risk-found');
});
test('저장 후 재실행 형태의 재조회에서도 서버 결과와 직접 응답을 유지', async () => {
  memory.clear();
  await records.upsertRecord(record());
  const [saved] = await records.listRecords();
  assert.equal(saved.status, 'level-1');
  assert.equal(saved.report.source, 'user-crosswalk');
  assert.equal(saved.serverReport.status, 'no-risk-found');
  assert.equal(JSON.parse(memory.get(storageKeys.records))[0].status, 'level-1');
});
test('재분석으로 서버 결과가 바뀌면 새 서버 결과를 보관하며 1단계 유지', () => {
  const cached = withCrosswalkDecision(record());
  const fresh = report('level-2');
  fresh.stats = [{ label: '반경 50m 신고', value: '30건' }];
  const next = withCrosswalkDecision({
    ...cached,
    serverReport: fresh,
    report: withCrosswalkEvidence(fresh, 'yes'),
  });
  assert.equal(next.status, 'level-1');
  assert.equal(next.serverReport.status, 'level-2');
  assert.equal(next.report.stats[0].value, '30건');
});
test('백엔드 요청에는 지원하지 않는 횡단보도 필드를 넣지 않음', () => {
  const submission = {
    clientEventId: 'qa-id',
    vehicleId: 'qa-vehicle',
    detectedAt: '2026-11-12T01:00:00Z',
    confirmedAt: '2026-11-12T01:00:10Z',
    confirmationMethod: 'CONFIRMED',
    gps: null,
    confirmed: { latitude: 37.272352, longitude: 127.12775 },
    remeasureCount: 0,
    crosswalkAnswer: 'yes',
  };
  const body = toParkingEventRequest(submission);
  assert(!Object.hasOwn(body, 'crosswalkAnswer'));
  assert(!Object.hasOwn(body, 'serverReport'));
  assert.equal(body.vehicleId, 'qa-vehicle');
});

const { statusOf, buildReport, toParkingLot } = load('@/services/api/mappers');
const { filterParkingLots } = load('@/features/parking-lots/utils/parkingLotVisibility');
test('명확한 3단계만 위험 없음, 비어 있거나 알 수 없는 단계는 판단 불가', () => {
  for (const level of [null, undefined, 0, 4, 999, '3']) {
    assert.equal(statusOf({ status: 'SUCCEEDED', level }), 'insufficient-data');
  }
  for (const level of [1, 2, 3]) {
    assert.equal(
      statusOf({ status: 'SUCCEEDED', level }),
      ['level-1', 'level-2', 'no-risk-found'][level - 1],
    );
  }
  assert.equal(statusOf({ status: 'PARTIAL', level: 3 }), 'insufficient-data');
  assert.equal(statusOf({ status: 'FAILED', level: 3 }), 'failed');
});
const assessment = (overrides) => ({
  status: 'SUCCEEDED',
  level: 3,
  predictionStatus: 'OK',
  primaryZoneType: null,
  reasons: [],
  stats: {
    reportCount: 12,
    reportRadiusM: 50,
    periodStart: '2025-01',
    periodEnd: '2025-09',
    predictedCount: null,
    topPercent: null,
  },
  referenceFineAmount: null,
  attemptCount: 1,
  notify: null,
  ...overrides,
});
// 2026-11-12T01:00:00Z = 한국 시간 목요일 10시(9~12시 구간).
const context = (crosswalkAnswer = null) => ({
  detectedAt: '2026-11-12T01:00:00Z',
  crosswalkAnswer,
});
const find = (items, label) => items.find((item) => item.label === label)?.value;
test('1단계 리포트는 시설 이름·거리·금지 거리·GPS 오차·과태료·신고 건수를 서버 값으로 표시', () => {
  const value = buildReport(
    assessment({
      level: 1,
      primaryZoneType: 'HYDRANT',
      referenceFineAmount: 80000,
      reasons: [
        {
          rank: 2,
          type: 'MODEL',
          zoneType: null,
          distanceM: null,
          thresholdM: null,
          description: null,
        },
        {
          rank: 1,
          type: 'FACILITY_RULE',
          zoneType: 'HYDRANT',
          distanceM: 3.24,
          thresholdM: 5,
          accuracyMarginM: 8,
          description: null,
        },
      ],
    }),
    context('no'),
  );
  assert.equal(value.status, 'level-1');
  assert.equal(value.badge, '1단계 소화전 주변');
  assert.equal(value.headline, '소화전 주변이에요');
  assert.equal(find(value.evidence, '소화전까지 거리'), '3.2m');
  assert.equal(find(value.evidence, '주정차 금지 거리'), '5m 이내');
  assert.equal(find(value.evidence, 'GPS 오차'), '±8m');
  assert.equal(find(value.evidence, '횡단보도 10m 이내 (직접 응답)'), '아니요');
  assert.equal(find(value.stats, '예상 과태료 (최대)'), '8만 원');
  assert.equal(find(value.stats, '반경 50m 신고 (2025년 1~9월)'), '12건');
  assert.equal(value.zoneLabel, '소화전 5m 이내');
  assert.equal(value.notes.length, 1);
});
test('1단계 리포트는 서버가 주지 않은 거리·과태료를 만들어 넣지 않음', () => {
  const value = buildReport(
    assessment({ level: 1, primaryZoneType: 'BUS_STOP', stats: null, reasons: [] }),
    context(),
  );
  assert.equal(value.badge, '1단계 버스정류소 주변');
  assert.deepEqual(value.evidence, []);
  assert.deepEqual(value.stats, []);
  assert.equal(value.zoneLabel, '금지 구역');
  assert.equal(value.notes, undefined);
  assert.equal(value.chart, undefined);
});
test('2단계 리포트는 주차 시각의 요일·시간대 집중도와 신고 건수·몰리는 시간을 표시', () => {
  const value = buildReport(
    assessment({
      level: 2,
      referenceFineAmount: 40000,
      stats: {
        reportCount: 1234,
        reportRadiusM: 50,
        periodStart: '2025-01',
        periodEnd: '2025-09',
        predictedCount: 3.1,
        topPercent: 4.25,
        peak: { weekday: 4, timeSlot: 3, slotCounts: [0, 1, 2, 8, 4, 2, 1, 0] },
      },
    }),
    context('no'),
  );
  assert.equal(value.status, 'level-2');
  assert.equal(value.badge, '2단계 신고 다발 구역');
  assert.equal(value.headline, '신고가 잦은 곳이에요');
  assert.equal(find(value.evidence, '목요일 9~12시 신고 집중도'), '상위 4.3%');
  assert.equal(find(value.evidence, '2단계 기준'), '상위 10% 이내');
  assert.equal(find(value.evidence, '횡단보도 10m 이내 (직접 응답)'), '아니요');
  assert.equal(find(value.stats, '반경 50m 신고 (2025년 1~9월)'), '1,234건');
  assert.equal(find(value.stats, '예상 과태료 (금지 구역이라면)'), '4만 원');
  assert.equal(value.zoneLabel, '신고 집중 칸 50m');
  assert.equal(value.chart.peakLabel, '9~12시');
  assert.equal(value.chart.bars[3], 1);
  assert.equal(value.chart.bars.length, 8);
});
test('2단계 리포트는 집중도·과태료·시간대 자료가 없으면 해당 항목을 비움', () => {
  const value = buildReport(assessment({ level: 2, stats: null }), context());
  assert.equal(value.status, 'level-2');
  assert.deepEqual(value.evidence, [{ label: '2단계 기준', value: '상위 10% 이내' }]);
  assert.deepEqual(value.stats, []);
  assert.equal(value.chart, undefined);
});
test('서버 2단계에서 횡단보도 예 응답은 1단계로 올리고 서버 2단계 리포트를 보관', () => {
  const server = buildReport(assessment({ level: 2 }), context('yes'));
  const value = withCrosswalkEvidence(server, 'yes');
  assert.equal(server.status, 'level-2');
  assert.equal(value.status, 'level-1');
});
test('단계 누락 리포트는 판정 정보 부족을 설명하고 위험 없음 문구를 쓰지 않음', () => {
  const value = buildReport(
    {
      status: 'SUCCEEDED',
      level: null,
      reasons: [],
      stats: null,
      attemptCount: 1,
      referenceFineAmount: null,
      notify: null,
    },
    { detectedAt: '2026-11-12T01:00:00Z', crosswalkAnswer: null },
  );
  assert.equal(value.status, 'insufficient-data');
  assert(value.summary.includes('단계 정보'));
  assert(!value.headline.includes('위험이 없어요'));
});
test('서버 100건 밖의 이전 기록과 횡단보도 응답·제출값을 보존', () => {
  const remote = Array.from({ length: 100 }, (_, i) => record('recent-' + i, null));
  const older = withCrosswalkDecision({
    ...record('older'),
    submission: { clientEventId: 'keep-me' },
  });
  const merged = mergeRemoteRecords(remote, [...remote, older]);
  assert.equal(merged.length, 101);
  const kept = merged.find((r) => r.id === 'older');
  assert.equal(kept.crosswalkAnswer, 'yes');
  assert.equal(kept.status, 'level-1');
  assert.equal(kept.submission.clientEventId, 'keep-me');
});
test('일부 서버 목록을 여러 번 병합해도 중복 없이 이전 기록 보존', () => {
  const first = mergeRemoteRecords([record('a', null)], [record('older')]);
  const second = mergeRemoteRecords([record('a', null), record('b', null)], first);
  assert.equal(second.length, 3);
  assert(second.some((r) => r.id === 'older'));
});
test('서버 단계 목록에 없는 기기 보관 1·2단계도 해당 필터에서 조회', () => {
  for (const level of [1, 2]) {
    const cached = record('older-' + level, null, 'level-' + level);
    const rows = mergeRecordsForLevel([], [cached], level);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, cached.id);
  }
});
test('서버 판정이 바뀐 기록은 예전 단계 필터에 남지 않음', () => {
  const rows = mergeRecordsForLevel(
    [record('same', null, 'level-1')],
    [record('same', null, 'level-2')],
    2,
  );
  assert.equal(rows.length, 0);
});
const lotDto = {
  id: 'lot',
  name: '주차장',
  address: null,
  distanceM: 10,
  location: { lat: 37.27, lng: 127.12 },
  feeType: null,
  feeInfo: null,
  operatingHours: null,
  capacity: null,
};
test('빈 유형·미지원 유형을 공영으로 채우지 않고 알려진 유형은 유지', () => {
  for (const type of [null, 'UNKNOWN', ''])
    assert.equal(toParkingLot({ ...lotDto, parkingType: type }).type, 'unknown');
  for (const [dto, type] of [
    ['PUBLIC', 'public'],
    ['PRIVATE', 'private'],
    ['ATTACHED', 'attached'],
  ])
    assert.equal(toParkingLot({ ...lotDto, parkingType: dto }).type, type);
});
test('기본 전체 목록은 운영시간 미상도 포함하고 공영 필터는 유형 미상 제외', () => {
  const unknown = toParkingLot({ ...lotDto, parkingType: null });
  const known = toParkingLot({ ...lotDto, id: 'known', parkingType: 'PUBLIC' });
  const base = { openOnly: false, publicOnly: false, paidOnly: false };
  const now = new Date('2026-11-12T01:00:00Z');
  assert.equal(filterParkingLots([unknown, known], base, now).length, 2);
  assert.equal(filterParkingLots([unknown, known], { ...base, publicOnly: true }, now).length, 1);
  assert.equal(filterParkingLots([unknown, known], { ...base, openOnly: true }, now).length, 0);
});
test('영업 여부를 조회 당시 값이 아닌 현재 한국 시간으로 재계산', () => {
  const lot = toParkingLot(
    { ...lotDto, parkingType: 'PUBLIC', operatingHours: '09:00-18:00' },
    new Date('2026-11-12T01:00:00Z'),
  );
  const filters = { openOnly: true, publicOnly: false, paidOnly: false };
  assert.equal(filterParkingLots([lot], filters, new Date('2026-11-12T01:00:00Z')).length, 1);
  assert.equal(filterParkingLots([lot], filters, new Date('2026-11-12T09:00:00Z')).length, 0);
});

(async () => {
  for (const { name, run } of tests) {
    await run();
    console.log('✓ ' + name);
  }
  console.log(tests.length + ' parking report checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
