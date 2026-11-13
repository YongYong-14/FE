/* global __dirname */
// 실제 서비스 코드를 실행하고 OS 경계만 대체한다. 서버·실제 계정에는 요청하지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function harness(platformOS = 'android') {
  const storage = new Map();
  const calls = { gps: 0, geocode: 0, permissionRequest: 0 };
  const coordinate = { latitude: 37.322, longitude: 127.097, accuracy: 8 };
  const fix = { coords: coordinate, timestamp: Date.now() };
  let timeout;
  const native = {
    listPairedDevices: async () => [
      { address: 'AA:BB:CC:DD:EE:01', name: '실제 등록한 이어폰', kind: 'earphone' },
    ],
    getParkingFix: async () => null,
  };
  const permissions = { granted: true, nativeAvailable: true };
  const location = {
    Accuracy: { Highest: 6 },
    getForegroundPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
    getBackgroundPermissionsAsync: async () => ({ granted: false }),
    hasServicesEnabledAsync: async () => true,
    getCurrentPositionAsync: async () => {
      calls.gps++;
      return fix;
    },
    geocodeAsync: async () => [{ latitude: 37.322, longitude: 127.097 }],
    reverseGeocodeAsync: async () => {
      calls.geocode++;
      return [{ city: '용인시', district: '수지구', formattedAddress: '경기도 용인시 수지구' }];
    },
    requestForegroundPermissionsAsync: async () => {
      calls.permissionRequest++;
    },
  };
  const cache = new Map();
  function load(id, parent = path.join(root, 'src/index.ts')) {
    if (id === '@react-native-async-storage/async-storage')
      return {
        __esModule: true,
        default: {
          getItem: async (key) => storage.get(key) ?? null,
          setItem: async (key, value) => storage.set(key, value),
        },
      };
    if (id === 'expo-location') return location;
    if (id === '@react-native-seoul/kakao-login')
      return { login: async () => ({ accessToken: 'sdk-user-token' }) };
    if (id === 'expo')
      return { requireOptionalNativeModule: () => (permissions.nativeAvailable ? native : null) };
    if (id === 'react-native')
      return {
        Platform: { OS: platformOS, Version: 35 },
        NativeModules: { RNKakaoLogins: { login: () => undefined } },
        Linking: { openSettings: async () => undefined },
        PermissionsAndroid: {
          PERMISSIONS: { BLUETOOTH_CONNECT: 'connect' },
          RESULTS: { GRANTED: 'granted' },
          check: async () => permissions.granted,
          request: async () => 'granted',
        },
      };
    const target = id.startsWith('@/')
      ? path.join(root, 'src', id.slice(2))
      : path.resolve(path.dirname(parent), id);
    const file = [target, `${target}.ts`].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
    assert(file, `Unknown dependency: ${id}`);
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
    new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', outputText)(
      (child) => load(child, file),
      module,
      module.exports,
      (callback) => {
        timeout = callback;
        return 1;
      },
      () => {
        timeout = undefined;
      },
    );
    return module.exports;
  }
  return {
    calls,
    storage,
    load,
    coordinate,
    fix,
    native,
    permissions,
    location,
    gps: load('@/services/device/location'),
    session: load('@/storage/session'),
    bluetooth: load('@/services/device/bluetooth'),
    expire: () => timeout?.(),
  };
}

const tests = [
  [
    '서버 주소 미설정 시 API 설정 오류',
    async (h) => {
      h.load('@/services/api/config').apiConfig.baseUrl = null;
      await assert.rejects(
        h.load('@/services/api/client').apiRequest('/health', { auth: false }),
        (error) => error.code === 'API_CONFIG_MISSING',
      );
    },
  ],
  [
    '수동 토큰이 남아 있어도 실제 SDK 사용자 토큰 사용',
    async (h) => {
      const config = h.load('@/services/api/config').apiConfig;
      config.kakaoNativeAppKey = 'project-native-key';
      config.devKakaoAccessToken = 'old-fixed-user-token';
      assert.equal(await h.load('@/services/api/kakao').getKakaoLoginToken(), 'sdk-user-token');
    },
  ],
  [
    '웹 로그인에서 수동 토큰 우회가 열리지 않음',
    async () => {
      const web = harness('web');
      web.load('@/services/api/config').apiConfig.devKakaoAccessToken = 'old-fixed-user-token';
      await assert.rejects(
        web.load('@/services/api/kakao').getKakaoLoginToken(),
        (error) => error.code === 'KAKAO_SDK_UNAVAILABLE',
      );
    },
  ],

  [
    '기기 확인 전 연결됨으로 표시하지 않음',
    async (h) => {
      const device = h.load('@/shared/types/session').createInitialDevice();
      assert.equal(device.vehicleConnected, false);
      assert.equal(device.vehicleConnectionKnown, false);
    },
  ],
  [
    '이전 가짜 계정은 실제 세션으로 복원하지 않음',
    async (h) => {
      const result = h.session.parseSession(
        JSON.stringify({
          version: 1,
          user: { id: 'demo-user', nickname: '예시' },
          vehicle: { id: 'fake', name: '예시' },
          onboardingCompleted: true,
          surveyEnabled: true,
        }),
      );
      assert.equal(result.user, null);
      assert.equal(result.vehicle, null);
    },
  ],
  [
    '예시 기록만 제외하고 실제 서버 기록은 보존',
    async (h) => {
      h.storage.set(
        '@seulkkamalkka/records:v1',
        JSON.stringify([
          {
            id: 'example',
            parkedAt: new Date().toISOString(),
            status: 'level-2',
            place: {},
            report: { isExampleData: true },
          },
          {
            id: 'server-record',
            parkedAt: new Date().toISOString(),
            status: 'level-2',
            place: {},
            report: { isExampleData: false },
          },
        ]),
      );
      const records = await h.load('@/storage/records').listRecords();
      assert.deepEqual(
        records.map((record) => record.id),
        ['server-record'],
      );
    },
  ],
  [
    '빈 주소 검색은 지오코더·예시 목록을 반환하지 않음',
    async (h) => {
      h.location.geocodeAsync = async () => {
        throw new Error('호출되면 안 됨');
      };
      assert.deepEqual(await h.gps.devicePlaceService.search('  '), []);
    },
  ],
  [
    '실제 주소 검색 결과의 좌표·행정구역 사용',
    async (h) => {
      const results = await h.gps.devicePlaceService.search('경기도 용인시 수지구');
      assert.equal(results[0].isSupportedRegion, true);
      assert.deepEqual(results[0].coordinate, { latitude: 37.322, longitude: 127.097 });
      assert.equal(h.calls.geocode, 1);
    },
  ],
  [
    '지오코더 실패 시 예시 장소로 대체하지 않음',
    async (h) => {
      h.location.geocodeAsync = async () => {
        throw new Error('주소 조회 실패');
      };
      await assert.rejects(h.gps.devicePlaceService.search('주소'), /주소 조회 실패/);
    },
  ],
  [
    '용인이 없는 검색어는 용인시를 붙여 함께 찾고 용인시 결과를 먼저 표시',
    async (h) => {
      const asked = [];
      h.location.geocodeAsync = async (text) => {
        asked.push(text);
        return text.startsWith('용인시')
          ? [{ latitude: 37.275, longitude: 127.116 }]
          : [
              { latitude: 37.5547, longitude: 126.9707 },
              { latitude: 37.275, longitude: 127.116 },
            ];
      };
      h.location.reverseGeocodeAsync = async ({ latitude }) =>
        latitude > 37.5
          ? [{ city: '서울특별시', district: '중구', formattedAddress: '서울특별시 중구' }]
          : [{ city: '용인시', district: '기흥구', formattedAddress: '경기도 용인시 기흥구' }];
      const results = await h.gps.devicePlaceService.search('중앙동');
      assert.deepEqual(asked.sort(), ['용인시 중앙동', '중앙동']);
      assert.deepEqual(
        results.map((place) => place.isSupportedRegion),
        [true, false],
      );
    },
  ],
  [
    '주소 확인에 실패한 좌표가 있어도 나머지 검색 결과 유지',
    async (h) => {
      h.location.geocodeAsync = async () => [
        { latitude: 37.1, longitude: 127.1 },
        { latitude: 37.322, longitude: 127.097 },
      ];
      h.location.reverseGeocodeAsync = async ({ latitude }) =>
        latitude < 37.2 ? [] : [{ city: '용인시', formattedAddress: '경기도 용인시 수지구' }];
      const results = await h.gps.devicePlaceService.search('용인시 수지구');
      assert.equal(results.length, 1);
      assert.equal(results[0].coordinate.latitude, 37.322);
    },
  ],
  [
    '주소 검색 전 위치 권한 검사',
    async (h) => {
      h.location.getForegroundPermissionsAsync = async () => ({ granted: false });
      await assert.rejects(h.gps.devicePlaceService.search('주소'), /위치 권한/);
    },
  ],
  [
    '웹에서 블루투스·주소 검색을 모사하지 않음',
    async () => {
      const web = harness('web');
      assert.equal(await web.bluetooth.nativeBluetooth.permission(), 'unset');
      await assert.rejects(web.bluetooth.nativeBluetoothDeviceService.listPairedDevices());
      await assert.rejects(web.gps.devicePlaceService.search('용인시'), /Android/);
    },
  ],
  [
    '지도 배율에 따라 핀 이동 좌표를 계산',
    async (h) => {
      const { createProjector } = h.load('@/shared/utils/mercator');
      const center = { latitude: 37.322, longitude: 127.097 };
      const at17 = createProjector({ center, zoom: 17 }, { width: 360, height: 800 });
      const at18 = createProjector({ center, zoom: 18 }, { width: 360, height: 800 });
      const shift17 = at17.toCoordinate({ x: 280, y: 400 }).longitude - center.longitude;
      const shift18 = at18.toCoordinate({ x: 280, y: 400 }).longitude - center.longitude;
      assert.ok(Math.abs(shift17 / shift18 - 2) < 0.00001);
      const roundTrip = at17.toCoordinate(at17.toScreen(center));
      assert.ok(Math.abs(roundTrip.latitude - center.latitude) < 1e-9);
    },
  ],

  [
    '닉네임이 없는 기존 저장 계정의 ID·차량을 보존',
    async (h) => {
      const result = h.session.parseSession(
        JSON.stringify({
          version: 1,
          onboardingCompleted: true,
          surveyEnabled: true,
          user: { id: 'user-existing', nickname: null },
          vehicle: { id: 'vehicle-existing', name: '등록한 기기' },
        }),
      );
      assert.equal(result.user.id, 'user-existing');
      assert.equal(result.vehicle.id, 'vehicle-existing');
      assert.equal(result.user.nickname, '운전자');
    },
  ],
  [
    '잘못된 JSON을 새 계정으로 조용히 초기화하지 않음',
    async (h) => {
      assert.throws(() => h.session.parseSession('{broken'));
    },
  ],
  [
    '계정 ID가 없는 손상 저장값은 복원 거부',
    async (h) => {
      assert.throws(() =>
        h.session.parseSession(
          JSON.stringify({
            version: 1,
            onboardingCompleted: true,
            surveyEnabled: true,
            user: { nickname: 'name' },
            vehicle: null,
          }),
        ),
      );
    },
  ],
  [
    '실제 페어링 기기 목록을 그대로 사용',
    async (h) => {
      const result = await h.bluetooth.nativeBluetoothDeviceService.listPairedDevices();
      assert.equal(result.length, 1);
      assert.equal(result[0].name, '실제 등록한 이어폰');
    },
  ],
  [
    '근처 기기 권한 거부 시 예시 기기로 대체하지 않음',
    async (h) => {
      h.permissions.granted = false;
      await assert.rejects(
        h.bluetooth.nativeBluetoothDeviceService.listPairedDevices(),
        /근처 기기/,
      );
    },
  ],
  [
    '블루투스 꺼짐 안내',
    async (h) => {
      h.native.listPairedDevices = async () => {
        throw new Error('BLUETOOTH_DISABLED');
      };
      await assert.rejects(
        h.bluetooth.nativeBluetoothDeviceService.listPairedDevices(),
        /블루투스를 켜/,
      );
    },
  ],
  [
    '네이티브 모듈 누락 시 재빌드 안내',
    async (h) => {
      h.permissions.nativeAvailable = false;
      await assert.rejects(
        h.bluetooth.nativeBluetoothDeviceService.listPairedDevices(),
        /다시 빌드/,
      );
    },
  ],
  [
    '실제 용인 좌표·주소·정확도 전달, 권한을 임의로 요청하지 않음',
    async (h) => {
      const result = await h.gps.nativeLocationService.locate();
      assert.equal(result.kind, 'located');
      assert.equal(result.place.isSupportedRegion, true);
      assert.deepEqual(result.place.coordinate, { latitude: 37.322, longitude: 127.097 });
      assert.equal(result.accuracyMeters, 8);
      assert.equal(h.calls.permissionRequest, 0);
    },
  ],
  [
    '용인시 밖을 지원 지역으로 표시하지 않음',
    async (h) => {
      h.location.reverseGeocodeAsync = async () => [{ city: '수원시', district: '영통구' }];
      assert.equal((await h.gps.nativeLocationService.locate()).place.isSupportedRegion, false);
    },
  ],
  [
    '영문 용인 행정구역 인식',
    async (h) => {
      h.location.reverseGeocodeAsync = async () => [{ city: 'Yongin-si' }];
      assert.equal((await h.gps.nativeLocationService.locate()).place.isSupportedRegion, true);
    },
  ],
  [
    '행정구역 확인 실패를 용인시로 간주하지 않음',
    async (h) => {
      h.location.reverseGeocodeAsync = async () => [];
      assert.equal((await h.gps.nativeLocationService.locate()).kind, 'unavailable');
    },
  ],
  [
    '위치 권한 거부 시 GPS 호출 안 함',
    async (h) => {
      h.location.getForegroundPermissionsAsync = async () => ({ granted: false, status: 'denied' });
      assert.equal((await h.gps.nativeLocationService.locate()).kind, 'unavailable');
      assert.equal(h.calls.gps, 0);
    },
  ],
  [
    'GPS 서비스가 꺼져 있으면 위치를 만들지 않음',
    async (h) => {
      h.location.hasServicesEnabledAsync = async () => false;
      assert.equal((await h.gps.nativeLocationService.locate()).kind, 'unavailable');
      assert.equal(h.calls.gps, 0);
    },
  ],
  [
    '정확도 미제공은 자동 확정 가능한 위치로 취급하지 않음',
    async (h) => {
      h.coordinate.accuracy = null;
      assert.equal((await h.gps.nativeLocationService.locate()).kind, 'unavailable');
    },
  ],
  [
    '잘못된 위경도 거절',
    async (h) => {
      h.coordinate.latitude = 999;
      assert.equal((await h.gps.nativeLocationService.locate()).kind, 'unavailable');
    },
  ],
  [
    '연결 해제 시 보관한 GPS를 해당 주차에만 사용',
    async (h) => {
      let requestedAt;
      h.native.getParkingFix = async (at) => {
        requestedAt = at;
        return { latitude: 37.3, longitude: 127.1, accuracy: 12, timestamp: at };
      };
      const detectedAt = '2026-11-11T00:00:00.000Z';
      const result = await h.gps.nativeLocationService.locate(undefined, { detectedAt });
      assert.equal(requestedAt, Date.parse(detectedAt));
      assert.equal(result.place.coordinate.latitude, 37.3);
      assert.equal(h.calls.gps, 0);
      assert.equal(h.gps.currentDeviceCoordinate(), null);
    },
  ],
  [
    '보관 GPS가 없으면 새 측위로 진행',
    async (h) => {
      await h.gps.nativeLocationService.locate(undefined, { detectedAt: new Date().toISOString() });
      assert.equal(h.calls.gps, 1);
    },
  ],
  [
    '측위 중 재연결·취소 시 늦은 결과 무시',
    async (h) => {
      let deliver;
      h.location.getCurrentPositionAsync = () =>
        new Promise((resolve) => {
          deliver = resolve;
        });
      const controller = new AbortController();
      const result = h.gps.nativeLocationService.locate(controller.signal);
      await new Promise(setImmediate);
      controller.abort();
      await assert.rejects(result, { name: 'AbortError' });
      deliver(h.fix);
      await new Promise(setImmediate);
      assert.equal(h.calls.geocode, 0);
      assert.equal(h.gps.currentDeviceCoordinate(), null);
    },
  ],
  [
    '위치 조회 시간 초과 처리',
    async (h) => {
      h.location.getCurrentPositionAsync = () => new Promise(() => undefined);
      const result = h.gps.nativeLocationService.locate();
      await new Promise(setImmediate);
      h.expire();
      assert.equal((await result).kind, 'unavailable');
    },
  ],
];

(async () => {
  for (const [name, run] of tests) {
    await run(harness());
    process.stdout.write(`✓ ${name}\n`);
  }
  process.stdout.write(`${tests.length} device service checks passed\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
