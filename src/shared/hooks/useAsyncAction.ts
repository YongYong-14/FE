import { useState } from 'react';

export function useAsyncAction() {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    if (isRunning) return;
    setIsRunning(true);
    setError(null);
    try {
      await action();
    } catch {
      setError('처리하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setIsRunning(false);
    }
  }

  return { run, isRunning, error };
}
