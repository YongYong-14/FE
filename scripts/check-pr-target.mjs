const eventName = process.env.GITHUB_EVENT_NAME;
const head = process.env.GITHUB_HEAD_REF;
const base = process.env.GITHUB_BASE_REF;

if (eventName !== 'pull_request') {
  console.log('PR 대상 검사는 pull_request 이벤트에서 실행합니다.');
  process.exit(0);
}

const allowed =
  (base === 'dev' && ['onjunku', 'ummpa'].includes(head)) || (base === 'main' && head === 'dev');

if (!allowed) {
  console.error('개인 브랜치(onjunku/ummpa) → dev, dev → main 순서로 PR을 열어 주세요.');
  process.exit(1);
}

console.log(`PR 경로 확인: ${head} → ${base}`);
