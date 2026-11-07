import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { accountService } from '@/services';
import {
  createInitialSession,
  type DemoDeviceState,
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
  completeOnboarding: (device?: Partial<DemoDeviceState>) => Promise<void>;
  registerVehicle: (vehicle: RegisteredVehicle) => Promise<void>;
  signOut: () => Promise<void>;
  setSurveyEnabled: (enabled: boolean) => Promise<void>;
  updateDevice: (patch: Partial<DemoDeviceState>) => Promise<void>;
  /** 초기화·탈퇴 후 첫 실행 상태로 되돌린다. 저장소 정리는 호출부가 함께 수행한다. */
  resetSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const LOAD_ERROR = '저장된 정보를 읽지 못했어요. 데이터를 지우지 않고 다시 시도할 수 있어요.';

export function SessionProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState(createInitialSession);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const current = useRef(snapshot);
  const writes = useRef<Promise<void>>(Promise.resolve());
  /** 초기화 시점마다 증가. 이전 세대의 늦은 쓰기를 버린다. */
  const generation = useRef(0);

  const retryLoad = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const restored = await loadSession();
      current.current = restored;
      setSnapshot(restored);
    } catch {
      setLoadError(LOAD_ERROR);
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
        if (active) setLoadError(LOAD_ERROR);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const commit = useCallback(async (update: (previous: SessionSnapshot) => SessionSnapshot) => {
    const startedIn = generation.current;
    setPendingWrites((count) => count + 1);
    const task = writes.current.then(async () => {
      if (startedIn !== generation.current) return;
      const next = update(current.current);
      await saveSession(next);
      if (startedIn !== generation.current) return;
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

  const signIn = useCallback(async () => {
    const startedIn = generation.current;
    const user = await accountService.signIn();
    if (startedIn !== generation.current) return;
    await commit((previous) => ({ ...previous, user }));
  }, [commit]);

  const resetSession = useCallback(async () => {
    generation.current += 1;
    await writes.current;
    const initial = createInitialSession();
    current.current = initial;
    setSnapshot(initial);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      snapshot,
      isLoading,
      isSaving: pendingWrites > 0,
      loadError,
      retryLoad,
      signIn,
      completeOnboarding: (device) =>
        commit((previous) => ({
          ...previous,
          onboardingCompleted: true,
          device: { ...previous.device, ...device },
        })),
      registerVehicle: (vehicle) =>
        commit((previous) => ({
          ...previous,
          vehicle,
          device: { ...previous.device, vehicleConnected: true },
        })),
      signOut: () => commit((previous) => ({ ...previous, user: null })),
      setSurveyEnabled: (surveyEnabled) => commit((previous) => ({ ...previous, surveyEnabled })),
      updateDevice: (patch) =>
        commit((previous) => ({ ...previous, device: { ...previous.device, ...patch } })),
      resetSession,
    }),
    [snapshot, isLoading, pendingWrites, loadError, retryLoad, signIn, commit, resetSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider가 필요합니다.');
  return context;
}
