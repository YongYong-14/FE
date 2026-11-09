// 목 API 서버와 Expo 웹을 함께 띄운다. 앱은 서버 API 모드(EXPO_PUBLIC_API_BASE_URL)로 실행된다.
// 사용: npm run web:mock  (종료: Ctrl+C)
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// --mock-port=4100 --web-port=8083 처럼 바꿀 수 있다.
const arg = (name) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const mockPort = arg('mock-port') ?? process.env.MOCK_API_PORT ?? '4000';
const webPort = arg('web-port') ?? process.env.WEB_PORT ?? process.env.PORT ?? '8081';

const children = [];

function run(label, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    console.log(`[${label}] 종료 (code ${code ?? 'signal'})`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

let closing = false;
function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('mock-api', [join(root, 'scripts', 'mock-api', 'server.mjs')], { MOCK_API_PORT: mockPort });
run(
  'expo-web',
  // 환경 변수는 번들에 들어가므로 캐시를 비우고 시작한다.
  [
    join(root, 'node_modules', 'expo', 'bin', 'cli'),
    'start',
    '--web',
    '--port',
    webPort,
    '--clear',
  ],
  {
    EXPO_PUBLIC_API_BASE_URL:
      process.env.EXPO_PUBLIC_API_BASE_URL ?? `http://localhost:${mockPort}`,
    EXPO_PUBLIC_KAKAO_ACCESS_TOKEN: process.env.EXPO_PUBLIC_KAKAO_ACCESS_TOKEN ?? 'mock-kakao-demo',
  },
);
