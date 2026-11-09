// 서버 오류는 code로만 분기한다. message는 로그용이며 화면 문구는 앱이 정한다(명세 1·6절).

/** 서버 오류 코드와 앱 내부 오류 코드. */
export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'KAKAO_TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REUSED'
  | 'LOCATION_CONSENT_REQUIRED'
  | 'VEHICLE_NOT_FOUND'
  | 'PARKING_EVENT_NOT_FOUND'
  | 'VEHICLE_CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'DELIVERY_NOT_EXPECTED'
  | 'INVALID_BLUETOOTH_ADDRESS'
  | 'INVALID_TIME_ORDER'
  | 'INVALID_TIME'
  | 'AUTO_CONFIRM_NOT_ALLOWED'
  | 'ADJUST_DISTANCE_EXCEEDED'
  // 앱 내부
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'NOT_SIGNED_IN'
  | 'KAKAO_SDK_UNAVAILABLE';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | (string & {});

  constructor(status: number, code: ApiErrorCode | (string & {}), message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isApiError(error: unknown, ...codes: ApiErrorCode[]): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  return codes.length === 0 || codes.includes(error.code as ApiErrorCode);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'aborted');
}

const messages: Partial<Record<ApiErrorCode, string>> = {
  NETWORK_ERROR: '서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.',
  TIMEOUT: '서버 응답이 늦어요. 잠시 후 다시 시도해 주세요.',
  INVALID_RESPONSE: '서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.',
  INTERNAL_SERVER_ERROR: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  SERVICE_UNAVAILABLE: '지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요.',
  UNAUTHORIZED: '로그인이 필요해요. 다시 로그인해 주세요.',
  TOKEN_REUSED: '보안을 위해 로그아웃됐어요. 다시 로그인해 주세요.',
  NOT_SIGNED_IN: '로그인이 필요해요. 다시 로그인해 주세요.',
  KAKAO_TOKEN_INVALID: '카카오 로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.',
  KAKAO_SDK_UNAVAILABLE:
    '카카오 SDK가 아직 연결되지 않았어요. 개발용 카카오 토큰(EXPO_PUBLIC_KAKAO_ACCESS_TOKEN)을 설정해 주세요.',
  LOCATION_CONSENT_REQUIRED: '위치기반서비스 이용약관에 동의해야 이용할 수 있어요.',
  VEHICLE_NOT_FOUND: '등록된 차량을 찾지 못했어요. 차량을 다시 등록해 주세요.',
  PARKING_EVENT_NOT_FOUND: '주차 기록을 찾지 못했어요.',
  VEHICLE_CONFLICT: '차량 정보가 방금 바뀌었어요. 다시 시도해 주세요.',
  INVALID_BLUETOOTH_ADDRESS: '블루투스 주소 형식이 올바르지 않아요. 다른 기기를 골라 주세요.',
  INVALID_TIME: '휴대폰 시간이 맞지 않아요. 시간을 확인한 뒤 다시 시도해 주세요.',
  ADJUST_DISTANCE_EXCEEDED: '처음 위치에서 200m 안으로 핀을 옮겨 주세요.',
  AUTO_CONFIRM_NOT_ALLOWED: 'GPS 없이 자동 확정할 수 없어요. 위치를 직접 확인해 주세요.',
};

/** 화면에 보여줄 문구. 알 수 없는 오류는 fallback을 쓴다. */
export function describeError(error: unknown, fallback = '처리하지 못했어요. 다시 시도해 주세요.') {
  if (error instanceof ApiError) return messages[error.code as ApiErrorCode] ?? fallback;
  return fallback;
}
