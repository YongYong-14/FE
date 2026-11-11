import { NativeModules, Platform } from 'react-native';

import { apiConfig } from './config';
import { ApiError } from './errors';

/** SDK 인증이 끝난 뒤에만 백엔드 로그인 API에 전달할 카카오 토큰을 반환한다. */
export async function getKakaoLoginToken(): Promise<string> {
  // 웹 목 서버 등 SDK 없이 API 계약을 확인하는 개발 경로를 유지한다.
  if (__DEV__ && apiConfig.devKakaoAccessToken) return apiConfig.devKakaoAccessToken;

  if (Platform.OS !== 'android') throw new ApiError(0, 'KAKAO_SDK_UNAVAILABLE');
  if (!apiConfig.kakaoNativeAppKey) throw new ApiError(0, 'KAKAO_CONFIG_MISSING');

  const nativeSdk = NativeModules.RNKakaoLogins as { login?: unknown } | undefined;
  if (typeof nativeSdk?.login !== 'function') throw new ApiError(0, 'KAKAO_SDK_UNAVAILABLE');

  let accessToken: string;
  try {
    // 데모·웹에서는 네이티브 모듈을 로드하지 않는다.
    const { login } = await import('@react-native-seoul/kakao-login');
    const token = await login();
    accessToken = token.accessToken;
  } catch (cause) {
    const error = cause as { code?: unknown; message?: unknown } | null;
    const detail = `${String(error?.code ?? '')} ${String(error?.message ?? '')}`;
    // Android 브리지는 code=RNKakaoLogins와 SDK의 Cancelled 메시지를 전달한다.
    if (
      /\b(?:cancelled|canceled|user_cancelled|user_canceled|E_CANCELLED_OPERATION)\b/i.test(detail)
    ) {
      throw new ApiError(0, 'KAKAO_LOGIN_CANCELLED');
    }
    throw new ApiError(0, 'KAKAO_LOGIN_FAILED');
  }

  if (!accessToken?.trim()) throw new ApiError(0, 'KAKAO_TOKEN_INVALID');
  return accessToken;
}
