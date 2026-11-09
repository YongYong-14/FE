import { clearTokens, loadTokens, saveTokens, type StoredTokens } from '@/storage/authTokens';

import { apiConfig } from './config';
import { ApiError } from './errors';

// 공통 요청 도구: ApiResponse 봉투 해석, Bearer 인증, 토큰 재발급(한 번에 하나만), 시간 초과.

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Query = Record<string, string | number | null | undefined>;

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Query;
  /** 기본 true. false면 Authorization 헤더를 붙이지 않는다. */
  auth?: boolean;
  signal?: AbortSignal;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** 액세스 토큰 수명(초). */
  expiresIn: number;
}

interface Envelope {
  success: boolean;
  data: unknown;
  error: { code?: string; message?: string } | null;
}

/** 만료 직전 토큰은 요청 전에 미리 재발급한다. */
const REFRESH_MARGIN_MS = 30_000;

let tokens: StoredTokens | null | undefined;
let loadingTokens: Promise<StoredTokens | null> | null = null;
let refreshing: Promise<StoredTokens> | null = null;
/** 로그인·로그아웃마다 증가. 이전 세션의 늦은 재발급 결과를 버린다. */
let epoch = 0;
const expiredListeners = new Set<() => void>();

function toStored(pair: TokenPair): StoredTokens {
  return {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    accessExpiresAt: Date.now() + pair.expiresIn * 1000,
  };
}

async function currentTokens(): Promise<StoredTokens | null> {
  if (tokens !== undefined) return tokens;
  if (!loadingTokens) {
    const startedIn = epoch;
    loadingTokens = loadTokens()
      .catch(() => null)
      .then((value) => {
        if (tokens === undefined && startedIn === epoch) tokens = value;
        return tokens ?? null;
      })
      .finally(() => {
        loadingTokens = null;
      });
  }
  return loadingTokens;
}

export const authSession = {
  /** 로그인·재발급 응답의 토큰 한 쌍을 저장한다. */
  async set(pair: TokenPair): Promise<void> {
    epoch += 1;
    const next = toStored(pair);
    tokens = next;
    refreshing = null;
    await saveTokens(next);
  },
  async clear(): Promise<void> {
    epoch += 1;
    tokens = null;
    refreshing = null;
    await clearTokens().catch(() => undefined);
  },
  async refreshToken(): Promise<string | null> {
    return (await currentTokens())?.refreshToken ?? null;
  },
  async hasSession(): Promise<boolean> {
    return (await currentTokens()) !== null;
  },
  onExpired(listener: () => void): () => void {
    expiredListeners.add(listener);
    return () => {
      expiredListeners.delete(listener);
    };
  },
};

async function expireSession(): Promise<void> {
  await authSession.clear();
  for (const listener of expiredListeners) listener();
}

function buildUrl(path: string, query?: Query): string {
  const search = Object.entries(query ?? {})
    .filter(
      (entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined,
    )
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${apiConfig.baseUrl ?? ''}${path}${search ? `?${search}` : ''}`;
}

function fallbackCode(status: number): string {
  if (status === 400) return 'INVALID_INPUT';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'INVALID_RESPONSE';
}

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === 'object' && value !== null && 'success' in value;
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(
        response.status,
        response.ok ? 'INVALID_RESPONSE' : fallbackCode(response.status),
      );
    }
  }
  if (isEnvelope(body)) {
    if (body.success && response.ok) return body.data as T;
    throw new ApiError(
      response.status,
      body.error?.code ?? fallbackCode(response.status),
      body.error?.message,
    );
  }
  throw new ApiError(
    response.status,
    response.ok ? 'INVALID_RESPONSE' : fallbackCode(response.status),
  );
}

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

async function send<T>(path: string, options: RequestOptions, accessToken?: string): Promise<T> {
  if (!apiConfig.baseUrl) throw new ApiError(0, 'NETWORK_ERROR', 'API 주소가 설정되지 않았어요.');
  if (options.signal?.aborted) throw abortError();

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, apiConfig.timeoutMs);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener('abort', forwardAbort);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    const response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    return await parse<T>(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw abortError();
    if (timedOut) throw new ApiError(0, 'TIMEOUT');
    throw new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : undefined);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}

/** 재발급은 동시에 하나만 실행하고, 기다리던 요청은 같은 결과를 쓴다(명세 2절). */
function refreshTokens(): Promise<StoredTokens> {
  if (refreshing) return refreshing;
  const startedIn = epoch;
  const task = (async () => {
    const current = await currentTokens();
    if (!current) throw new ApiError(401, 'NOT_SIGNED_IN');
    try {
      const pair = await send<TokenPair>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: current.refreshToken },
        auth: false,
      });
      // 재발급 중 로그아웃·새 로그인이 있었으면 이 결과로 세션을 되살리지 않는다.
      if (startedIn !== epoch) throw new ApiError(401, 'NOT_SIGNED_IN');
      const next = toStored(pair);
      tokens = next;
      await saveTokens(next);
      return next;
    } catch (error) {
      // TOKEN_REUSED·만료된 리프레시 등 401은 다시 로그인해야 한다. 네트워크 오류는 토큰을 유지한다.
      if (error instanceof ApiError && error.status === 401 && startedIn === epoch) {
        await expireSession();
      }
      throw error;
    }
  })();
  refreshing = task;
  const release = () => {
    if (refreshing === task) refreshing = null;
  };
  task.then(release, release);
  return task;
}

const retryableAuthCodes = ['TOKEN_EXPIRED', 'UNAUTHORIZED'];

/** 인증이 필요한 요청. 만료(401 TOKEN_EXPIRED)면 재발급 후 한 번만 다시 보낸다. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (options.auth === false) return send<T>(path, options);

  let current = await currentTokens();
  if (!current) throw new ApiError(401, 'NOT_SIGNED_IN');
  if (current.accessExpiresAt - Date.now() < REFRESH_MARGIN_MS) current = await refreshTokens();

  try {
    return await send<T>(path, options, current.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    if (!retryableAuthCodes.includes(error.code)) throw error;
    const renewed = await refreshTokens();
    try {
      return await send<T>(path, options, renewed.accessToken);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) await expireSession();
      throw retryError;
    }
  }
}
