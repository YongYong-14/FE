import { useState } from 'react';

const DEFAULT_ERROR = '처리하지 못했어요. 다시 시도해 주세요.';

/** 비동기 동작의 진행·오류 상태. describe로 오류별 문구를 정할 수 있다. */
export function useAsyncAction(describe?: (error: unknown) => string) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    if (isRunning) return;
    setIsRunning(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(describe ? describe(cause) : DEFAULT_ERROR);
    } finally {
      setIsRunning(false);
    }
  }

  return { run, isRunning, error };
}
