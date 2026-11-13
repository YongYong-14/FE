// 서버 연결 설정. 주소가 없으면 설정 오류를 표시한다.
// 값은 빌드 시점에 번들에 들어가므로 비밀 키를 넣지 않는다.

const API_PREFIX = '/api/v1';

function normalizeBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const withoutSlash = value.replace(/\/+$/, '');
  return withoutSlash.endsWith(API_PREFIX) ? withoutSlash : `${withoutSlash}${API_PREFIX}`;
}

const baseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

export const apiConfig = {
  baseUrl,
  timeoutMs: 15_000,
  /** 약관 3종이 같은 버전을 쓴다(명세 v0.11). 서버 허용 버전과 맞춘다. */
  agreementVersion: process.env.EXPO_PUBLIC_AGREEMENT_VERSION?.trim() || '2026-11-06-v1',
  /** Android SDK 설정에 쓰는 앱 키. 사용자 액세스 토큰과 다르다. */
  kakaoNativeAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY?.trim() || null,
  /** 카카오 로컬 검색(상호·주소)에 쓰는 REST API 키. 없으면 Android 주소 검색을 쓴다. */
  kakaoRestApiKey: process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY?.trim() || null,
} as const;
