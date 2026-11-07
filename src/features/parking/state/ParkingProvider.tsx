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
import { AppState } from 'react-native';

import { useSession } from '@/features/auth';
import { analysisService, demoControl, locationService } from '@/services';
import type { SelectedPlace } from '@/shared/types/location';
import type { CrosswalkAnswer, ParkingRecord } from '@/shared/types/parking';
import { loadParkingProgressRaw, saveParkingProgressRaw } from '@/storage/parkingProgress';
import { listRecords, upsertRecord } from '@/storage/records';

import { parseProgress, type ParkingProgress } from '../types';
import { createFailedReport, createId } from '../utils/report';
import { pauseTimer, restoreTimer, resumeTimer, startTimer } from '../utils/timer';

interface CompletedRun {
  runId: string;
  recordId: string;
}

interface ParkingContextValue {
  progress: ParkingProgress | null;
  isRestoring: boolean;
  records: ParkingRecord[];
  recordsError: string | null;
  /** 방금 분석이 끝난 진행 건. 확인 화면이 결과 화면으로 이동할 때 사용한다. */
  lastCompleted: CompletedRun | null;
  /** 진행 중인 기존 기록 재분석의 기록 id. */
  reanalyzingRecordId: string | null;
  /** 재연결로 진행이 취소됐을 때 홈에 한 번 보여줄 안내. */
  cancelNotice: string | null;
  /** 등록 차량 재연결 이벤트(사후 설문 판단용). */
  reconnectEvent: { seq: number; at: string } | null;
  clearCancelNotice: () => void;

  simulateDisconnect: () => Promise<void>;
  simulateReconnect: () => Promise<void>;
  startLocating: () => void;
  pauseLocationTimer: () => void;
  resumeLocationTimer: () => void;
  extendLocationTimer: () => void;
  adjustPlace: (place: SelectedPlace) => void;
  confirmLocation: () => void;
  answerCrosswalk: (answer: CrosswalkAnswer) => void;
  dismissOutsideRegion: () => void;
  reanalyze: (recordId: string) => Promise<void>;
  refreshRecords: () => Promise<void>;
  /** 데모 초기화·탈퇴용. 진행·예약 작업을 모두 무효화한다. */
  cancelAll: () => void;
}

const ParkingContext = createContext<ParkingContextValue | null>(null);

export function ParkingProvider({ children }: PropsWithChildren) {
  const { snapshot, updateDevice } = useSession();
  const [progress, setProgressState] = useState<ParkingProgress | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [lastCompleted, setLastCompleted] = useState<CompletedRun | null>(null);
  const [reanalyzingRecordId, setReanalyzingRecordId] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [reconnectEvent, setReconnectEvent] = useState<{ seq: number; at: string } | null>(null);
  const clearCancelNotice = useCallback(() => setCancelNotice(null), []);

  const progressRef = useRef<ParkingProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reanalysisRef = useRef<{ recordId: string; controller: AbortController } | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  /** 초기화·재연결 등 전체 무효화 세대. */
  const epoch = useRef(0);

  // ── 상태 쓰기: 메모리·화면·기기 저장을 같은 순서로 반영한다.
  const setProgress = useCallback((next: ParkingProgress | null) => {
    progressRef.current = next;
    setProgressState(next);
    const startedIn = epoch.current;
    writeQueue.current = writeQueue.current
      .then(() => (startedIn === epoch.current ? saveParkingProgressRaw(next) : undefined))
      .catch(() => undefined);
  }, []);

  /** 현재 진행 건이 같은 runId·단계일 때만 갱신한다(늦은 응답·중복 처리 방지). */
  const updateIf = useCallback(
    (
      runId: string,
      phases: ParkingProgress['phase'][],
      build: (current: ParkingProgress) => ParkingProgress | null,
    ) => {
      const current = progressRef.current;
      if (!current || current.runId !== runId || !phases.includes(current.phase)) return false;
      setProgress(build(current));
      return true;
    },
    [setProgress],
  );

  const refreshRecords = useCallback(async () => {
    try {
      setRecords(await listRecords());
      setRecordsError(null);
    } catch {
      setRecordsError('기록을 불러오지 못했어요.');
    }
  }, []);

  // ── 위치 조회
  const runLocate = useCallback(
    (runId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void locationService
        .locate(controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          updateIf(runId, ['locating'], (current) => {
            if (result.kind === 'unavailable') {
              return {
                runId,
                disconnectedAt: current.disconnectedAt,
                phase: 'selecting-location-manually',
                place: null,
                reason: result.reason,
              };
            }
            if (!result.place.isSupportedRegion) {
              return {
                runId,
                disconnectedAt: current.disconnectedAt,
                phase: 'outside-region',
                place: result.place,
              };
            }
            return {
              runId,
              disconnectedAt: current.disconnectedAt,
              phase: 'confirming-location',
              place: result.place,
              accuracyMeters: result.accuracyMeters,
              timer: startTimer(Date.now()),
            };
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          updateIf(runId, ['locating'], (current) => ({
            runId,
            disconnectedAt: current.disconnectedAt,
            phase: 'selecting-location-manually',
            place: null,
            reason: '위치를 받지 못했어요',
          }));
        });
    },
    [updateIf],
  );

  // ── 분석 → 기록 저장
  const runAnalysis = useCallback(
    (runId: string) => {
      const current = progressRef.current;
      if (!current || current.runId !== runId || current.phase !== 'analyzing') return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const startedIn = epoch.current;
      const { place, crosswalkAnswer, disconnectedAt } = current;

      void analysisService
        .analyze({ place, parkedAt: disconnectedAt, crosswalkAnswer }, controller.signal)
        .catch(() => (controller.signal.aborted ? null : createFailedReport(crosswalkAnswer)))
        .then(async (report) => {
          if (!report || controller.signal.aborted || startedIn !== epoch.current) return;
          const latest = progressRef.current;
          if (!latest || latest.runId !== runId || latest.phase !== 'analyzing') return;
          const now = new Date().toISOString();
          const record: ParkingRecord = {
            id: createId('rec'),
            parkedAt: disconnectedAt,
            place,
            crosswalkAnswer,
            status: report.status,
            report,
            updatedAt: now,
          };
          try {
            const next = await upsertRecord(record);
            if (startedIn !== epoch.current) return;
            setRecords(next);
          } catch {
            setRecordsError('기록을 저장하지 못했어요.');
          }
          if (progressRef.current?.runId !== runId) return;
          setLastCompleted({ runId, recordId: record.id });
          setProgress(null);
        });
    },
    [setProgress],
  );

  // ── 최초 복원
  useEffect(() => {
    let active = true;
    void Promise.all([
      loadParkingProgressRaw().catch(() => null),
      listRecords().catch(() => null),
    ]).then(([raw, savedRecords]) => {
      if (!active) return;
      if (savedRecords) setRecords(savedRecords);
      else setRecordsError('기록을 불러오지 못했어요.');
      let restored = parseProgress(raw);
      if (restored?.phase === 'confirming-location') {
        restored = { ...restored, timer: restoreTimer(restored.timer, Date.now()) };
      }
      progressRef.current = restored;
      setProgressState(restored);
      setIsRestoring(false);
      if (restored?.phase === 'locating') runLocate(restored.runId);
      if (restored?.phase === 'analyzing') runAnalysis(restored.runId);
    });
    return () => {
      active = false;
    };
  }, [runLocate, runAnalysis]);

  // ── 15초 만료: 화면이 아니라 상위 상태가 한 번만 처리한다.
  const expire = useCallback(
    (runId: string) => {
      updateIf(runId, ['confirming-location'], (current) => {
        if (current.phase !== 'confirming-location') return current;
        if (current.timer.mode !== 'running' || current.timer.deadline > Date.now()) return current;
        return {
          runId,
          disconnectedAt: current.disconnectedAt,
          phase: 'awaiting-crosswalk-answer',
          place: current.place,
        };
      });
    },
    [updateIf],
  );

  useEffect(() => {
    if (progress?.phase !== 'confirming-location' || progress.timer.mode !== 'running') return;
    const delay = Math.max(0, progress.timer.deadline - Date.now());
    const timeout = setTimeout(() => expire(progress.runId), delay + 20);
    return () => clearTimeout(timeout);
  }, [progress, expire]);

  // ── 앱 상태: 백그라운드에서는 터치 정지를 유지하지 않고, 복귀 시 만료를 확인한다.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const current = progressRef.current;
      if (current?.phase !== 'confirming-location') return;
      if (state !== 'active' && current.timer.mode === 'paused') {
        setProgress({ ...current, timer: resumeTimer(current.timer, Date.now()) });
      }
      if (state === 'active') expire(current.runId);
    });
    return () => subscription.remove();
  }, [expire, setProgress]);

  // ── 공개 동작
  const cancelProgress = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    reanalysisRef.current?.controller.abort();
    reanalysisRef.current = null;
    setReanalyzingRecordId(null);
    setProgress(null);
  }, [setProgress]);

  const simulateDisconnect = useCallback(async () => {
    if (!snapshot.vehicle) return;
    await updateDevice({ vehicleConnected: false });
    if (progressRef.current) return;
    setLastCompleted(null);
    setProgress({
      runId: createId('run'),
      disconnectedAt: new Date().toISOString(),
      phase: 'suspected',
    });
  }, [snapshot.vehicle, updateDevice, setProgress]);

  const simulateReconnect = useCallback(async () => {
    // 완료 전 재연결: 진행·예약·늦은 응답을 정리하고 새 기록을 남기지 않는다.
    const hadProgress = Boolean(progressRef.current || reanalysisRef.current);
    cancelProgress();
    if (hadProgress) setCancelNotice('차량이 다시 연결되어 주차 확인을 취소했어요.');
    await updateDevice({ vehicleConnected: true });
    setReconnectEvent((previous) => ({
      seq: (previous?.seq ?? 0) + 1,
      at: new Date().toISOString(),
    }));
  }, [cancelProgress, updateDevice]);

  const startLocating = useCallback(() => {
    const current = progressRef.current;
    if (
      !current ||
      current.phase === 'awaiting-crosswalk-answer' ||
      current.phase === 'analyzing'
    ) {
      return;
    }
    // 재측정은 이전 타이머·만료를 무효화한다.
    setProgress({
      runId: current.runId,
      disconnectedAt: current.disconnectedAt,
      phase: 'locating',
    });
    runLocate(current.runId);
  }, [runLocate, setProgress]);

  const pauseLocationTimer = useCallback(() => {
    const current = progressRef.current;
    if (current?.phase !== 'confirming-location' || current.timer.mode === 'paused') return;
    setProgress({ ...current, timer: pauseTimer(current.timer, Date.now()) });
  }, [setProgress]);

  const resumeLocationTimer = useCallback(() => {
    const current = progressRef.current;
    if (current?.phase !== 'confirming-location' || current.timer.mode === 'running') return;
    setProgress({ ...current, timer: resumeTimer(current.timer, Date.now()) });
  }, [setProgress]);

  const extendLocationTimer = useCallback(() => {
    const current = progressRef.current;
    if (current?.phase !== 'confirming-location') return;
    // 손을 뗀 뒤부터 감소하도록 정지 상태로 15초를 채운다.
    setProgress({
      ...current,
      timer: pauseTimer(startTimer(Date.now()), Date.now()),
    });
  }, [setProgress]);

  const adjustPlace = useCallback(
    (place: SelectedPlace) => {
      const current = progressRef.current;
      if (
        current?.phase === 'confirming-location' ||
        current?.phase === 'selecting-location-manually'
      ) {
        setProgress({ ...current, place });
      }
    },
    [setProgress],
  );

  const confirmLocation = useCallback(() => {
    const current = progressRef.current;
    if (!current) return;
    if (
      current.phase !== 'confirming-location' &&
      current.phase !== 'selecting-location-manually'
    ) {
      return;
    }
    if (!current.place?.isSupportedRegion) return;
    const place = current.place;
    updateIf(current.runId, ['confirming-location', 'selecting-location-manually'], () => ({
      runId: current.runId,
      disconnectedAt: current.disconnectedAt,
      phase: 'awaiting-crosswalk-answer',
      place,
    }));
  }, [updateIf]);

  const answerCrosswalk = useCallback(
    (answer: CrosswalkAnswer) => {
      const current = progressRef.current;
      if (current?.phase !== 'awaiting-crosswalk-answer') return;
      const changed = updateIf(current.runId, ['awaiting-crosswalk-answer'], () => ({
        runId: current.runId,
        disconnectedAt: current.disconnectedAt,
        phase: 'analyzing',
        place: current.place,
        crosswalkAnswer: answer,
      }));
      if (changed) runAnalysis(current.runId);
    },
    [updateIf, runAnalysis],
  );

  const dismissOutsideRegion = useCallback(() => {
    if (progressRef.current?.phase === 'outside-region') cancelProgress();
  }, [cancelProgress]);

  const reanalyze = useCallback(async (recordId: string) => {
    if (reanalysisRef.current) return;
    const record = (await listRecords()).find((item) => item.id === recordId);
    if (!record) throw new Error('기록을 찾지 못했어요.');
    const controller = new AbortController();
    reanalysisRef.current = { recordId, controller };
    setReanalyzingRecordId(recordId);
    const startedIn = epoch.current;
    try {
      const report = await analysisService
        .analyze(
          {
            place: record.place,
            parkedAt: record.parkedAt,
            crosswalkAnswer: record.crosswalkAnswer,
          },
          controller.signal,
        )
        .catch(() =>
          controller.signal.aborted ? null : createFailedReport(record.crosswalkAnswer),
        );
      // 취소된 재시도는 원래 기록을 그대로 둔다.
      if (!report || controller.signal.aborted || startedIn !== epoch.current) return;
      const next = await upsertRecord({
        ...record,
        status: report.status,
        report,
        updatedAt: new Date().toISOString(),
      });
      setRecords(next);
    } finally {
      if (reanalysisRef.current?.controller === controller) {
        reanalysisRef.current = null;
        setReanalyzingRecordId(null);
      }
    }
  }, []);

  const cancelAll = useCallback(() => {
    epoch.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    reanalysisRef.current?.controller.abort();
    reanalysisRef.current = null;
    progressRef.current = null;
    setProgressState(null);
    setReanalyzingRecordId(null);
    setLastCompleted(null);
    setCancelNotice(null);
    setReconnectEvent(null);
    setRecords([]);
    setRecordsError(null);
  }, []);

  // ── 시연: 예약한 단계에 도달하면 등록 차량 재연결을 발생시킨다.
  const phase = progress?.phase;
  useEffect(() => {
    if (!phase || demoControl.get().reconnectAt !== phase) return;
    const timeout = setTimeout(() => {
      if (progressRef.current?.phase !== phase) return;
      demoControl.set({ reconnectAt: null });
      void simulateReconnect();
    }, 1500);
    return () => clearTimeout(timeout);
  }, [phase, simulateReconnect]);

  const value = useMemo<ParkingContextValue>(
    () => ({
      progress,
      isRestoring,
      records,
      recordsError,
      lastCompleted,
      reanalyzingRecordId,
      cancelNotice,
      reconnectEvent,
      clearCancelNotice,
      simulateDisconnect,
      simulateReconnect,
      startLocating,
      pauseLocationTimer,
      resumeLocationTimer,
      extendLocationTimer,
      adjustPlace,
      confirmLocation,
      answerCrosswalk,
      dismissOutsideRegion,
      reanalyze,
      refreshRecords,
      cancelAll,
    }),
    [
      cancelNotice,
      reconnectEvent,
      clearCancelNotice,
      progress,
      isRestoring,
      records,
      recordsError,
      lastCompleted,
      reanalyzingRecordId,
      simulateDisconnect,
      simulateReconnect,
      startLocating,
      pauseLocationTimer,
      resumeLocationTimer,
      extendLocationTimer,
      adjustPlace,
      confirmLocation,
      answerCrosswalk,
      dismissOutsideRegion,
      reanalyze,
      refreshRecords,
      cancelAll,
    ],
  );

  return <ParkingContext.Provider value={value}>{children}</ParkingContext.Provider>;
}

export function useParking() {
  const context = useContext(ParkingContext);
  if (!context) throw new Error('ParkingProvider가 필요합니다.');
  return context;
}
