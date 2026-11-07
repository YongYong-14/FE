import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { accountService } from '@/services';
import {
  createInitialSession,
  type RegisteredVehicle,
  type SessionSnapshot,
} from '@/shared/types/session';
import { loadSession, saveSession } from '@/storage/session';

interface SessionContextValue {
  snapshot: SessionSnapshot;
  isLoading: boolean;
  isSaving: boolean;
  loadError: string | null;
  retryLoad: () => Promise<void>;
  signIn: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  registerVehicle: (vehicle: RegisteredVehicle) => Promise<void>;
  signOut: () => Promise<void>;
  setSurveyEnabled: (enabled: boolean) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState(createInitialSession);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const current = useRef(snapshot);
  const writes = useRef<Promise<void>>(Promise.resolve());

  const retryLoad = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const restored = await loadSession();
      current.current = restored;
      setSnapshot(restored);
    } catch {
      setLoadError('저장된 정보를 읽지 못했어요. 데이터를 지우지 않고 다시 시도할 수 있어요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadSession()
      .then((restored) => {
        if (!active) return;
        current.current = restored;
        setSnapshot(restored);
      })
      .catch(() => {
        if (active)
          setLoadError('저장된 정보를 읽지 못했어요. 데이터를 지우지 않고 다시 시도할 수 있어요.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const commit = useCallback(async (update: (previous: SessionSnapshot) => SessionSnapshot) => {
    setPendingWrites((count) => count + 1);
    const task = writes.current.then(async () => {
      const next = update(current.current);
      await saveSession(next);
      current.current = next;
      setSnapshot(next);
    });
    writes.current = task.catch(() => undefined);
    try {
      await task;
    } finally {
      setPendingWrites((count) => count - 1);
    }
  }, []);

  return (
    <SessionContext.Provider
      value={{
        snapshot,
        isLoading,
        isSaving: pendingWrites > 0,
        loadError,
        retryLoad,
        signIn: async () => {
          const user = await accountService.signIn();
          await commit((previous) => ({ ...previous, user }));
        },
        completeOnboarding: () =>
          commit((previous) => ({ ...previous, onboardingCompleted: true })),
        registerVehicle: (vehicle) => commit((previous) => ({ ...previous, vehicle })),
        signOut: () => commit((previous) => ({ ...previous, user: null })),
        setSurveyEnabled: (surveyEnabled) => commit((previous) => ({ ...previous, surveyEnabled })),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider가 필요합니다.');
  return context;
}
