/* global __dirname */
// 실제 서비스의 HTTP·Android 지오코더 경계만 대체한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const keyword = (extra = {}) => ({
  id: '11045491',
  place_name: '강남대학교',
  address_name: '경기 용인시 기흥구 구갈동 111',
  road_address_name: '경기 용인시 기흥구 강남로 40',
  x: '127.13315421201591',
  y: '37.27603234338971',
  ...extra,
});
const address = (extra = {}) => ({
  address_name: '경기 용인시 기흥구 구갈동 111',
  address: { region_2depth_name: '용인시 기흥구' },
  road_address: {
    address_name: '경기 용인시 기흥구 강남로 40',
    region_2depth_name: '용인시 기흥구',
    building_name: '강남대학교',
  },
  x: '127.13315421201591',
  y: '37.27603234338971',
  ...extra,
});
const response = (documents, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => ({ documents }),
});

function harness() {
  const calls = [],
    fallbackCalls = [],
    timers = new Map();
  const config = { kakaoRestApiKey: 'project-rest-key' };
  let nextTimer = 0,
    respond = async () => response([]);
  const file = path.resolve(__dirname, '../src/services/api/places.ts');
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'fetch', 'setTimeout', 'clearTimeout', outputText)(
    (id) => {
      if (id === './config') return { apiConfig: config };
      if (id === '../device/location')
        return {
          devicePlaceService: {
            search: async (query) => {
              fallbackCalls.push(query);
              return [];
            },
          },
        };
      throw new Error(`Unexpected dependency: ${id}`);
    },
    module,
    module.exports,
    (url, init) => {
      const call = { url: new URL(url), ...init };
      calls.push(call);
      return respond(call);
    },
    (callback) => {
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    (id) => timers.delete(id),
  );
  return {
    ...module.exports,
    calls,
    fallbackCalls,
    config,
    timers,
    respond: (next) => (respond = next),
    expire: () => [...timers.values()].forEach((callback) => callback()),
  };
}

const tests = [
  [
    '빈 검색어에는 HTTP·기기 조회를 하지 않음',
    async (h) => {
      assert.deepEqual(await h.kakaoPlaceService.search('  '), []);
      assert.equal(h.calls.length + h.fallbackCalls.length, 0);
    },
  ],
  [
    '키 미설정 시 기존 Android 주소 검색 사용',
    async (h) => {
      h.config.kakaoRestApiKey = null;
      await h.kakaoPlaceService.search(' 강남로 40 ');
      assert.deepEqual(h.fallbackCalls, ['강남로 40']);
      assert.equal(h.calls.length, 0);
    },
  ],
  [
    '카카오 주소에 REST 키로만 인증하고 검색어를 인코딩',
    async (h) => {
      await h.kakaoPlaceService.search('용인 카페 & 공원');
      assert.equal(h.calls.length, 3);
      for (const call of h.calls) {
        assert.equal(call.url.origin, 'https://dapi.kakao.com');
        assert.equal(call.url.searchParams.get('query'), '용인 카페 & 공원');
        assert.deepEqual(call.headers, { Authorization: 'KakaoAK project-rest-key' });
      }
      assert.equal(h.fallbackCalls.length, 0);
      assert.equal(h.timers.size, 0);
    },
  ],
  [
    '키워드 중복 제거·용인 우선·실제 좌표와 주소 전달',
    async (h) => {
      h.respond(async ({ url }) =>
        response(
          url.pathname.endsWith('/address.json')
            ? []
            : [keyword({ id: 'seoul', address_name: '서울 용산구 용인길 1' }), keyword()],
        ),
      );
      const places = await h.kakaoPlaceService.search('강남대학교');
      assert.equal(places.length, 2);
      assert.equal(places[0].name, '강남대학교');
      assert.equal(places[0].address, '경기 용인시 기흥구 강남로 40');
      assert.deepEqual(places[0].coordinate, {
        latitude: 37.27603234338971,
        longitude: 127.13315421201591,
      });
      assert.equal(places[0].isSupportedRegion, true);
      assert.equal(places[1].isSupportedRegion, false);
    },
  ],
  [
    '도로명 주소와 지번 주소의 행정구역 판정',
    async (h) => {
      h.respond(async ({ url }) =>
        response(url.pathname.endsWith('/address.json') ? [address()] : []),
      );
      const [place] = await h.kakaoPlaceService.search('강남로 40');
      assert.equal(place.address, '경기 용인시 기흥구 강남로 40');
      assert.equal(place.isSupportedRegion, true);
      const outside = h.fromAddress(
        address({
          address_name: '서울 강남구 용인빌딩',
          address: { region_2depth_name: '강남구' },
          road_address: null,
        }),
      );
      assert.equal(outside.isSupportedRegion, false);
      assert.equal(outside.address, '서울 강남구 용인빌딩');
    },
  ],
  [
    '빈 값·범위 밖 좌표·잘못된 결과를 지도 위치로 사용하지 않음',
    async (h) => {
      for (const doc of [
        null,
        keyword({ x: '' }),
        keyword({ y: ' ' }),
        keyword({ x: 'NaN' }),
        keyword({ x: '181' }),
        keyword({ y: '91' }),
        keyword({ id: '' }),
      ])
        assert.equal(h.fromKeyword(doc), null);
      assert.equal(h.fromAddress(address({ y: '100' })), null);
    },
  ],
  [
    '일부 조회 실패 시 성공한 검색 결과 유지',
    async (h) => {
      h.respond(async ({ url }) =>
        url.pathname.endsWith('/address.json') ? response([], 503) : response([keyword()]),
      );
      assert.equal((await h.kakaoPlaceService.search('강남대학교')).length, 1);
    },
  ],
  [
    '실패한 조회만 있고 유효한 결과가 없으면 빈 목록 대신 오류',
    async (h) => {
      h.respond(async ({ url }) =>
        response([], url.pathname.endsWith('/address.json') ? 200 : 503),
      );
      await assert.rejects(h.kakaoPlaceService.search('강남대학교'), /검색하지 못/);
    },
  ],
  [
    '인증·쿼터 오류가 빈 결과나 GPS 우회로 처리되지 않음',
    async (h) => {
      for (const status of [401, 403, 429]) {
        h.respond(async () => response([], status));
        await assert.rejects(h.kakaoPlaceService.search('강남대학교'));
      }
      assert.equal(h.fallbackCalls.length, 0);
    },
  ],
  [
    '응답 형식 오류와 정상 검색 결과 없음을 구분',
    async (h) => {
      h.respond(async () => response(undefined));
      await assert.rejects(h.kakaoPlaceService.search('강남대학교'), /응답/);
      h.respond(async () => response([]));
      assert.deepEqual(await h.kakaoPlaceService.search('없는 상호'), []);
    },
  ],
  [
    '검색 취소 시 진행 중인 세 요청도 함께 취소',
    async (h) => {
      const controller = new AbortController();
      h.respond(
        ({ signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      );
      const pending = h.kakaoPlaceService.search('강남대학교', controller.signal);
      controller.abort();
      await assert.rejects(pending, (error) => error.name === 'AbortError');
      assert(h.calls.every((call) => call.signal.aborted));
      assert.equal(h.timers.size, 0);
      await assert.rejects(h.kakaoPlaceService.search('다른 상호', controller.signal));
      assert.equal(h.calls.length, 3);
    },
  ],
  [
    '응답 시간 초과 시 요청 종료',
    async (h) => {
      h.respond(
        ({ signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      );
      const pending = h.kakaoPlaceService.search('강남대학교');
      h.expire();
      await assert.rejects(pending);
      assert(h.calls.every((call) => call.signal.aborted));
      assert.equal(h.timers.size, 0);
    },
  ],
];

async function main() {
  for (const [name, test] of tests) {
    await test(harness());
    console.log(`✓ ${name}`);
  }
  console.log(`${tests.length} place search checks passed`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
