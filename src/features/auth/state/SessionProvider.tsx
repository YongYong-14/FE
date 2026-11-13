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

import { accountService, vehicleService } from '@/services';
import {
  createInitialSession,
  missingAgreementsOf,
  type AgreementType,
  type DeviceState,
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
  /** 로그인 만료 등 로그인 화면에 한 번 보여줄 안내. */
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  signIn: () => Promise<void>;
  /** 남은 필수 약관에 모두 동의한다(POST /me/agreements). */
  agree: () => Promise<void>;
  /** 서버가 동의를 요구하면(403 LOCATION_CONSENT_REQUIRED) 동의 화면으로 보낸다. */
  requireAgreement: (type: AgreementType) => Promise<void>;
  completeOnboarding: (device?: Partial<DeviceState>) => Promise<void>;
  registerVehicle: (vehicle: RegisteredVehicle) => Promise<void>;
  /** 서버 등록 없이 개발 중 차량 등록 화면만 건너뛴다. */
  skipVehicleRegistration: () => Promise<void>;
  /** 서버의 활성 차량으로 맞춘다(GET /vehicle). */
  syncVehicle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** 서버 계정을 삭제한다(DELETE /me). 기기 정리는 호출부가 이어서 수행한다. */
  withdraw: () => Promise<void>;
  setSurveyEnabled: (enabled: boolean) => Promise<void>;
  updateDevice: (patch: Partial<DeviceState>) => Promise<void>;
  /** 초기화·탈퇴 후 첫 실행 상태로 되돌린다. 저장소 정리는 호출부가 함께 수행한다. */
  resetSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const LOAD_ERROR = '저장된 정보를 읽지 못했어요. 데이터를 지우지 않고 다시 시도할 수 있어요.';
const EXPIRED_NOTICE = '로그인이 만료됐어요. 다시 로그인해 주세요.';

export function SessionProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState(createInitialSession);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const current = useRef(snapshot);
  const writes = useRef<Promise<void>>(Promise.resolve());
  /** 초기화 시점마다 증가. 이전 세대의 늦은 쓰기를 버린다. */
  const generation = useRef(0);

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

  /** 서버 연결 시: 저장된 토큰으로 내 정보·약관·차량을 다시 맞춘다. 오프라인이면 저장값을 유지한다. */
  const restoreRemote = useCallback(async () => {
    const startedIn = generation.current;
    const startingUserId = current.current.user?.id;
    const canRestore = () =>
      startedIn === generation.current && current.current.user?.id === startingUserId;
    try {
      const profile = await accountService.restore();
      if (!canRestore()) return;
      if (!profile) {
        await commit((previous) => (canRestore() ? { ...previous, user: null } : previous));
        return;
      }
      let vehicle: RegisteredVehicle | null | undefined;
      try {
        vehicle = await vehicleService.getVehicle();
      } catch {
        vehicle = undefined;
      }
      if (!canRestore()) return;
      await commit((previous) =>
        canRestore()
          ? {
              ...previous,
              user: { ...previous.user, ...profile.user },
              missingAgreements: profile.missingAgreements,
              ownerId: profile.user.id,
              onboardingCompleted:
                previous.onboardingCompleted || (!startingUserId && Boolean(vehicle)),
              vehicle:
                vehicle === undefined ? previous.vehicle : mergeVehicle(vehicle, previous.vehicle),
            }
          : previous,
      );
    } catch {
      // 네트워크 오류: 저장된 로그인으로 계속 쓰고, 다음 요청에서 다시 확인한다.
    }
  }, [commit]);

  const load = useCallback(async () => {
    const restored = await loadSession();
    current.current = restored;
    setSnapshot(restored);
    void restoreRemote();
  }, [restoreRemote]);

  const retryLoad = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await load();
    } catch {
      setLoadError(LOAD_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, [load]);

  useEffect(() => {
    let active = true;
    void loadSession()
      .then((restored) => {
        if (!active) return;
        current.current = restored;
        setSnapshot(restored);
        void restoreRemote();
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
  }, [restoreRemote]);

  // 토큰 재발급이 실패하면(TOKEN_REUSED 등) 로그인 화면으로 보낸다.
  useEffect(
    () =>
      accountService.onSessionExpired(() => {
        setSessionNotice(EXPIRED_NOTICE);
        void commit((previous) => ({ ...previous, user: null }));
      }),
    [commit],
  );

  const signIn = useCallback(async () => {
    const startedIn = generation.current;
    const result = await accountService.signIn();
    if (startedIn !== generation.current) return;
    let vehicle: RegisteredVehicle | null | undefined;
    try {
      vehicle = await vehicleService.getVehicle();
    } catch {
      vehicle = undefined;
    }
    if (startedIn !== generation.current) return;
    setSessionNotice(null);
    await commit((previous) => {
      const sameOwner = previous.ownerId === result.user.id;
      return {
        ...previous,
        user: result.user,
        missingAgreements: result.missingAgreements,
        ownerId: result.user.id,
        onboardingCompleted: sameOwner ? previous.onboardingCompleted : false,
        vehicleRegistrationMocked: false,
        vehicle:
          vehicle !== undefined
            ? mergeVehicle(vehicle, sameOwner ? previous.vehicle : null)
            : sameOwner
              ? previous.vehicle
              : null,
      };
    });
  }, [commit]);

  const agree = useCallback(async () => {
    const types = missingAgreementsOf(current.current);
    if (types.length > 0) await accountService.agree(types);
    await commit((previous) => ({ ...previous, missingAgreements: [] }));
  }, [commit]);

  const requireAgreement = useCallback(
    (type: AgreementType) =>
      commit((previous) => {
        const missing = missingAgreementsOf(previous);
        return missing.includes(type)
          ? previous
          : { ...previous, missingAgreements: [...missing, type] };
      }),
    [commit],
  );

  const syncVehicle = useCallback(async () => {
    if (!current.current.user) return;
    const startedIn = generation.current;
    const vehicle = await vehicleService.getVehicle();
    if (startedIn !== generation.current) return;
    await commit((previous) => ({ ...previous, vehicle: mergeVehicle(vehicle, previous.vehicle) }));
  }, [commit]);

  const signOut = useCallback(async () => {
    await accountService.signOut();
    await commit((previous) => ({
      ...previous,
      user: null,
      missingAgreements: [],
      vehicleRegistrationMocked: false,
    }));
  }, [commit]);

  const withdraw = useCallback(() => accountService.withdraw(), []);

  const resetSession = useCallback(async () => {
    generation.current += 1;
    await writes.current;
    const initial = createInitialSession();
    current.current = initial;
    setSnapshot(initial);
  }, []);

  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);
  const updateDevice = useCallback(
    (patch: Partial<DeviceState>) =>
      commit((previous) => ({ ...previous, device: { ...previous.device, ...patch } })),
    [commit],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      snapshot,
      isLoading,
      isSaving: pendingWrites > 0,
      loadError,
      retryLoad,
      sessionNotice,
      clearSessionNotice,
      signIn,
      agree,
      requireAgreement,
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
          vehicleRegistrationMocked: false,
          ownerId: previous.user?.id ?? previous.ownerId ?? null,
          device: {
            ...previous.device,
            vehicleConnected: false,
            vehicleConnectionKnown: false,
          },
        })),
      skipVehicleRegistration: async () => {
        if (!__DEV__) throw new Error('개발 빌드에서만 사용할 수 있어요.');
        await commit((previous) => ({ ...previous, vehicleRegistrationMocked: true }));
      },
      syncVehicle,
      signOut,
      withdraw,
      setSurveyEnabled: (surveyEnabled) => commit((previous) => ({ ...previous, surveyEnabled })),
      updateDevice,
      resetSession,
    }),
    [
      snapshot,
      isLoading,
      pendingWrites,
      loadError,
      retryLoad,
      sessionNotice,
      clearSessionNotice,
      signIn,
      agree,
      requireAgreement,
      commit,
      syncVehicle,
      signOut,
      withdraw,
      resetSession,
      updateDevice,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** 서버 차량에는 기기 종류가 없을 수 있어 기존 표시값을 이어 쓴다. */
function mergeVehicle(
  next: RegisteredVehicle | null,
  previous: RegisteredVehicle | null,
): RegisteredVehicle | null {
  if (!next) return null;
  return previous && previous.id === next.id
    ? { ...previous, ...next, kind: next.kind ?? previous.kind }
    : next;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider가 필요합니다.');
  return context;
}
