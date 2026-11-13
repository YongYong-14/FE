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
import {
  analysisService,
  describeError,
  isAbortError,
  isApiError,
  isNativeDeviceMode,
  locationService,
  recordService,
} from '@/services';
import type { Coordinate, SelectedPlace } from '@/shared/types/location';
import type { DataPeriod } from '@/shared/types/map';
import type {
  CrosswalkAnswer,
  GpsFix,
  ParkingRecord,
  ParkingSubmission,
} from '@/shared/types/parking';
import { missingAgreementsOf } from '@/shared/types/session';
import { distanceMeters } from '@/shared/utils/geo';
import { createUuid } from '@/shared/utils/uuid';
import { loadParkingProgressRaw, saveParkingProgressRaw } from '@/storage/parkingProgress';
import { storageGeneration } from '@/storage/keys';
import { useVehicleBluetooth } from '../hooks/useVehicleBluetooth';
import { nativeBluetooth } from '@/services/device/bluetooth';
import { listRecords, removeRecord, replaceRecords, upsertRecord } from '@/storage/records';

import {
  AUTO_CONFIRM_ACCURACY_M,
  gpsOf,
  MAX_ADJUST_DISTANCE_M,
  MAX_GPS_ACCURACY_M,
  MAX_REMEASURE_COUNT,
  parseProgress,
  type ParkingProgress,
  type ProgressOf,
} from '../types';
import { mergeRecordsForLevel, mergeRemoteRecords, upsertMerged } from '../utils/records';
import { createId, withCrosswalkEvidence } from '../utils/report';
import { pauseTimer, restoreTimer, resumeTimer, startTimer } from '../utils/timer';

interface CompletedRun {
  runId: string;
  recordId: string;
}

/** 서버 판정 요청이 저장되지 못한 이유. 같은 제출값으로 다시 보낼 수 있다. */
interface AnalysisError {
  kind: 'consent' | 'vehicle' | 'clock' | 'retry';
  message: string;
}

interface LatestInfo {
  recordId: string | null;
  coordinate: Coordinate | null;
  dataPeriod: DataPeriod | null;
}

type RecordDetailResult = 'loaded' | 'not-found' | 'unchanged';

interface ParkingContextValue {
  deviceError: string | null;
  progress: ParkingProgress | null;
  isRestoring: boolean;
  records: ParkingRecord[];
  recordsError: string | null;
  /** 최근 주차(GET /parking-events/latest)의 위치·신고 데이터 기간. */
  latest: LatestInfo | null;
  /** 방금 분석이 끝난 진행 건. 확인 화면이 결과 화면으로 이동할 때 사용한다. */
  lastCompleted: CompletedRun | null;
  /** 진행 중인 기존 기록 재분석의 기록 id. */
  reanalyzingRecordId: string | null;
  /** 분석은 끝났지만 기록 저장에 실패한 경우. 진행은 유지하고 다시 저장을 시도한다. */
  analysisSaveError: boolean;
  /** 서버가 판정 요청을 저장하지 못한 경우. */
  analysisError: AnalysisError | null;
  retryAnalysis: () => void;
  /** 앱 안 터치 시작·종료. 위치 선택 타이머의 정지·재개에 쓴다(어느 화면에서든). */
  notifyTouch: (active: boolean) => void;
  /** 지도 이동·중앙 좌표의 주소 확인 중 이전 위치가 확정되지 않도록 한다. */
  setLocationLookupPending: (pending: boolean) => void;
  /** 사후 설문이 재연결 이벤트를 처리한 뒤 비운다. */
  clearReconnectEvent: () => void;
  /** 재연결로 진행이 취소됐을 때 홈에 한 번 보여줄 안내. */
  cancelNotice: string | null;
  /** 등록 차량 재연결 이벤트(사후 설문 판단용). */
  reconnectEvent: { seq: number; at: string } | null;
  clearCancelNotice: () => void;
  startLocating: () => void;
  pauseLocationTimer: () => void;
  resumeLocationTimer: () => void;
  extendLocationTimer: () => void;
  /** 지도 중앙 위치 보정(pin) 또는 주소 목록 선택(list)으로 위치를 바꾼다. */
  adjustPlace: (place: SelectedPlace, source?: 'pin' | 'list') => void;
  confirmLocation: () => void;
  answerCrosswalk: (answer: CrosswalkAnswer) => void;
  dismissOutsideRegion: () => void;
  reanalyze: (recordId: string) => Promise<void>;
  refreshRecords: () => Promise<void>;
  /** 서버 상세로 기록을 채운다(서버 연결 시). */
  loadRecordDetail: (recordId: string) => Promise<RecordDetailResult>;
  /** 단계별 기록(GET /parking-events?level=). */
  listRecordsByLevel: (level: 1 | 2) => Promise<ParkingRecord[]>;
  /** 탈퇴용. 진행·예약 작업을 모두 무효화한다. */
  cancelAll: () => void;
}

const ParkingContext = createContext<ParkingContextValue | null>(null);
const RECORDS_ERROR = '기록을 불러오지 못했어요.';

/** 확정 위치가 GPS 기준점에서 200m를 넘으면 서버가 거절한다(ADJUST_DISTANCE_EXCEEDED). */
function exceedsAdjustLimit(place: SelectedPlace, gps: GpsFix | null | undefined): boolean {
  return Boolean(gps && distanceMeters(gps.coordinate, place.coordinate) > MAX_ADJUST_DISTANCE_M);
}

const ADJUST_NOTICE = `지도를 움직여 처음 GPS 위치에서 ${MAX_ADJUST_DISTANCE_M}m 안의 주차 위치를 맞춰 주세요.`;

export function ParkingProvider({ children }: PropsWithChildren) {
  const { snapshot, updateDevice, requireAgreement } = useSession();
  const [progress, setProgressState] = useState<ParkingProgress | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [latest, setLatest] = useState<LatestInfo | null>(null);
  const [lastCompleted, setLastCompleted] = useState<CompletedRun | null>(null);
  const [reanalyzingRecordId, setReanalyzingRecordId] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [reconnectEvent, setReconnectEvent] = useState<{ seq: number; at: string } | null>(null);
  const [analysisError, setAnalysisError] = useState<AnalysisError | null>(null);
  const clearCancelNotice = useCallback(() => setCancelNotice(null), []);

  const progressRef = useRef<ParkingProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reanalysisRef = useRef<{ recordId: string; controller: AbortController } | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const [analysisSaveError, setAnalysisSaveError] = useState(false);
  const clearReconnectEvent = useCallback(() => setReconnectEvent(null), []);
  /** 탈퇴 시 증가하는 전체 무효화 세대. */
  const epoch = useRef(0);
  const restoringRef = useRef(true);
  const touchingRef = useRef(false);
  const lookupPendingRef = useRef(false);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  /** 같은 키 재사용 시 자기 자신을 다시 부르기 위한 참조. */
  const runAnalysisRef = useRef<(runId: string, options?: { keyRetried?: boolean }) => void>(
    () => undefined,
  );

  // ── 상태 쓰기: 메모리·화면·기기 저장을 같은 순서로 반영한다.
  const setProgress = useCallback((next: ParkingProgress | null) => {
    progressRef.current = next;
    setProgressState(next);
    const startedIn = epoch.current;
    const generation = storageGeneration();
    writeQueue.current = writeQueue.current
      .then(() =>
        startedIn === epoch.current ? saveParkingProgressRaw(next, generation) : undefined,
      )
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

  // ── 기록: 서버 연결 시 서버 목록이 기준이고, 기기 기록은 앱 정보를 이어 쓰는 캐시다.
  const refreshRecords = useCallback(async () => {
    const startedIn = epoch.current;
    try {
      const [remote, remoteLatest] = await Promise.all([
        recordService.list(),
        recordService.latest(),
      ]);
      if (startedIn !== epoch.current) return;
      const next = await replaceRecords(
        (cached) => mergeRemoteRecords(remote, cached),
        () => startedIn === epoch.current,
      );
      if (!next || startedIn !== epoch.current) return;
      setRecords(next);
      setLatest({
        recordId: remoteLatest.record?.id ?? null,
        coordinate: remoteLatest.coordinate,
        dataPeriod: remoteLatest.dataPeriod,
      });
      setRecordsError(null);
    } catch {
      if (startedIn === epoch.current) setRecordsError(RECORDS_ERROR);
    }
  }, []);

  const loadRecordDetail = useCallback(async (recordId: string): Promise<RecordDetailResult> => {
    const startedIn = epoch.current;
    const remote = await recordService.get(recordId);
    if (startedIn !== epoch.current) return 'unchanged';
    if (!remote) return 'not-found';
    const next = await replaceRecords(
      (cached) => upsertMerged(remote, cached),
      () => startedIn === epoch.current,
    );
    if (next && startedIn === epoch.current) setRecords(next);
    return 'loaded';
  }, []);

  const listRecordsByLevel = useCallback(async (level: 1 | 2) => {
    const remote = await recordService.list({ level });
    const cached = await listRecords().catch(() => [] as ParkingRecord[]);
    return mergeRecordsForLevel(remote, cached, level);
  }, []);

  // ── 위치 조회
  const runLocate = useCallback(
    (runId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void locationService
        .locate(
          controller.signal,
          progressRef.current?.remeasureCount
            ? undefined
            : { detectedAt: progressRef.current?.disconnectedAt ?? new Date().toISOString() },
        )
        .then((result) => {
          if (controller.signal.aborted) return;
          updateIf(runId, ['locating'], (current) => {
            const base = {
              runId,
              disconnectedAt: current.disconnectedAt,
              remeasureCount: current.remeasureCount,
            };
            if (result.kind === 'unavailable') {
              return {
                ...base,
                phase: 'selecting-location-manually',
                place: null,
                reason: result.reason,
              };
            }
            if (!result.place.isSupportedRegion) {
              return { ...base, phase: 'outside-region', place: result.place };
            }
            // 50m를 넘는 측위는 실패로 보고 서버에 GPS로 보내지 않는다. 위치는 직접 고른다.
            if (result.accuracyMeters > MAX_GPS_ACCURACY_M) {
              return {
                ...base,
                phase: 'selecting-location-manually',
                place: null,
                reason: `위치 정확도가 낮아요(±${result.accuracyMeters}m)`,
              };
            }
            return {
              ...base,
              phase: 'confirming-location',
              place: result.place,
              accuracyMeters: result.accuracyMeters,
              gps: { coordinate: result.place.coordinate, accuracyMeters: result.accuracyMeters },
              autoConfirm: result.accuracyMeters <= AUTO_CONFIRM_ACCURACY_M,
              pinAdjusted: false,
              timer: startTimer(Date.now()),
            };
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          updateIf(runId, ['locating'], (current) => ({
            runId,
            disconnectedAt: current.disconnectedAt,
            remeasureCount: current.remeasureCount,
            phase: 'selecting-location-manually',
            place: null,
            reason: '위치를 받지 못했어요',
          }));
        });
    },
    [updateIf],
  );

  /** 이전 버전에서 복원한 분석 중 진행에는 제출값이 없어 지금 만든다. */
  const ensureSubmission = useCallback(
    (current: ProgressOf<'analyzing'>): ParkingSubmission => {
      if (current.submission) return current.submission;
      const submission: ParkingSubmission = {
        clientEventId: createUuid(),
        vehicleId: snapshotRef.current.vehicle?.id ?? '',
        detectedAt: current.disconnectedAt,
        confirmedAt: new Date().toISOString(),
        confirmationMethod: 'CONFIRMED',
        gps: null,
        confirmed: current.place.coordinate,
        remeasureCount: Math.min(MAX_REMEASURE_COUNT, current.remeasureCount ?? 0),
      };
      setProgress({ ...current, submission });
      return submission;
    },
    [setProgress],
  );

  /** 서버가 위치를 거절하면(보정 200m 초과·GPS 없는 자동 확정) 위치 확인으로 되돌린다. */
  const returnToLocation = useCallback(
    (current: ProgressOf<'analyzing'>, submission: ParkingSubmission, notice: string) => {
      const base = {
        runId: current.runId,
        disconnectedAt: current.disconnectedAt,
        remeasureCount: current.remeasureCount,
      };
      setProgress(
        submission.gps
          ? {
              ...base,
              phase: 'confirming-location',
              place: current.place,
              accuracyMeters: submission.gps.accuracyMeters,
              gps: submission.gps,
              autoConfirm: false,
              pinAdjusted: submission.confirmationMethod === 'ADJUSTED',
              timer: startTimer(Date.now()),
              notice,
            }
          : {
              ...base,
              phase: 'selecting-location-manually',
              place: current.place,
              reason: '위치를 직접 확인해 주세요',
              notice,
            },
      );
    },
    [setProgress],
  );

  // ── 분석 → 기록 저장
  const runAnalysis = useCallback(
    (runId: string, options: { keyRetried?: boolean } = {}) => {
      const current = progressRef.current;
      if (!current || current.runId !== runId || current.phase !== 'analyzing') return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const startedIn = epoch.current;
      const submission = ensureSubmission(current);
      const { place, crosswalkAnswer, disconnectedAt } = current;
      setAnalysisError(null);

      const stillRunning = () =>
        startedIn === epoch.current &&
        progressRef.current?.runId === runId &&
        progressRef.current.phase === 'analyzing';

      void analysisService
        .analyze(
          { place, parkedAt: disconnectedAt, crosswalkAnswer, submission },
          controller.signal,
        )
        .then(async (outcome) => {
          if (controller.signal.aborted || !stillRunning()) return;
          const now = new Date().toISOString();
          const report = withCrosswalkEvidence(outcome.report, crosswalkAnswer);
          const record: ParkingRecord = {
            id: outcome.recordId,
            parkedAt: disconnectedAt,
            place: { ...place, address: outcome.address ?? place.address },
            crosswalkAnswer,
            status: report.status,
            report,
            serverReport: crosswalkAnswer === 'yes' ? outcome.report : undefined,
            updatedAt: now,
            submission,
            retryable: outcome.retryable,
            detailed: false,
            vehicleName: snapshotRef.current.vehicle?.name ?? null,
          };
          try {
            const next = await upsertRecord(record, stillRunning);
            if (!next) return;
            if (!stillRunning()) {
              // 저장 도중 재연결로 취소됐으면 방금 쓴 기록을 지운다.
              const cleaned = await removeRecord(record.id).catch(() => null);
              if (cleaned && startedIn === epoch.current) setRecords(cleaned);
              return;
            }
            setRecords(next);
          } catch {
            if (stillRunning()) setAnalysisSaveError(true);
            return;
          }
          setAnalysisSaveError(false);
          setLastCompleted({ runId, recordId: record.id });
          setProgress(null);
          setLatest((previous) => ({
            recordId: record.id,
            coordinate: submission.confirmed,
            dataPeriod: previous?.dataPeriod ?? null,
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error) || !stillRunning()) return;
          const latestProgress = progressRef.current;
          if (latestProgress?.phase !== 'analyzing') return;
          // 같은 키에 다른 내용이 저장돼 있으면 새 키로 한 번만 다시 보낸다(명세 6절).
          if (isApiError(error, 'IDEMPOTENCY_KEY_REUSED') && !options.keyRetried) {
            setProgress({
              ...latestProgress,
              submission: { ...submission, clientEventId: createUuid() },
            });
            runAnalysisRef.current(runId, { keyRetried: true });
            return;
          }
          if (isApiError(error, 'ADJUST_DISTANCE_EXCEEDED', 'AUTO_CONFIRM_NOT_ALLOWED')) {
            returnToLocation(latestProgress, submission, describeError(error));
            return;
          }
          if (isApiError(error, 'LOCATION_CONSENT_REQUIRED')) {
            setAnalysisError({ kind: 'consent', message: describeError(error) });
            void requireAgreement('LOCATION_SERVICE');
            return;
          }
          if (isApiError(error, 'VEHICLE_NOT_FOUND')) {
            setAnalysisError({ kind: 'vehicle', message: describeError(error) });
            return;
          }
          if (isApiError(error, 'INVALID_TIME', 'INVALID_TIME_ORDER')) {
            setAnalysisError({ kind: 'clock', message: describeError(error) });
            return;
          }
          setAnalysisError({
            kind: 'retry',
            message: describeError(error, '서버에 결과를 저장하지 못했어요. 다시 시도해 주세요.'),
          });
        });
    },
    [ensureSubmission, requireAgreement, returnToLocation, setProgress],
  );
  useEffect(() => {
    runAnalysisRef.current = runAnalysis;
  }, [runAnalysis]);

  // ── 최초 복원
  useEffect(() => {
    let active = true;
    void Promise.all([
      loadParkingProgressRaw().catch(() => null),
      listRecords().catch(() => null),
      isNativeDeviceMode ? nativeBluetooth.snapshot().catch(() => null) : Promise.resolve(null),
    ]).then(([raw, savedRecords, bluetooth]) => {
      if (!active) return;
      restoringRef.current = false;
      if (savedRecords) {
        setRecords(savedRecords);
        setLatest(
          (previous) =>
            previous ?? {
              recordId: savedRecords[0]?.id ?? null,
              coordinate: savedRecords[0]?.place.coordinate ?? null,
              dataPeriod: null,
            },
        );
      } else setRecordsError(RECORDS_ERROR);
      let restored = parseProgress(raw);
      if (
        restored &&
        bluetooth &&
        (bluetooth.connected === true ||
          (bluetooth.lastConnectedAt ?? 0) > Date.parse(restored.disconnectedAt))
      ) {
        restored = null;
        setProgress(null);
        setCancelNotice('차량이 다시 연결되어 주차 확인을 취소했어요.');
      }
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
  }, [runLocate, runAnalysis, setProgress]);

  // ── 서버 연결 시: 로그인한 계정이 바뀌면 서버 기록으로 다시 맞춘다.
  const userId = snapshot.user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    // 목록 갱신은 비동기로 시작한다(효과 안에서 상태를 바로 바꾸지 않음).
    void Promise.resolve().then(refreshRecords);
  }, [userId, refreshRecords]);

  // ── 15초 만료: 화면이 아니라 상위 상태가 한 번만 처리한다(15m 이내 GPS만 자동 확정).
  const expire = useCallback(
    (runId: string) => {
      if (lookupPendingRef.current) return;
      updateIf(runId, ['confirming-location'], (current) => {
        if (current.phase !== 'confirming-location') return current;
        if (current.autoConfirm === false) return current;
        if (current.timer.mode !== 'running' || current.timer.deadline > Date.now()) return current;
        const gps = gpsOf(current);
        if (exceedsAdjustLimit(current.place, gps)) {
          return { ...current, autoConfirm: false, notice: ADJUST_NOTICE };
        }
        return {
          runId,
          disconnectedAt: current.disconnectedAt,
          remeasureCount: current.remeasureCount,
          phase: 'awaiting-crosswalk-answer',
          place: current.place,
          gps,
          confirmedAt: new Date().toISOString(),
          confirmationMethod: 'AUTO',
        };
      });
    },
    [updateIf],
  );

  useEffect(() => {
    if (progress?.phase !== 'confirming-location' || progress.timer.mode !== 'running') return;
    if (progress.autoConfirm === false) return;
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
    lookupPendingRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    reanalysisRef.current?.controller.abort();
    reanalysisRef.current = null;
    setReanalyzingRecordId(null);
    setAnalysisSaveError(false);
    setAnalysisError(null);
    setProgress(null);
  }, [setProgress]);

  const handleDisconnect = useCallback(
    async (at: string, lastConnectedAt = 0) => {
      if (!snapshotRef.current.vehicle || restoringRef.current) return;
      const previous = progressRef.current;
      if (previous && lastConnectedAt > Date.parse(previous.disconnectedAt)) {
        cancelProgress();
        setCancelNotice('차량이 다시 연결되어 이전 주차 확인을 취소했어요.');
      }
      const startedIn = epoch.current;
      await updateDevice({ vehicleConnected: false });
      if (progressRef.current || startedIn !== epoch.current) return;
      setLastCompleted(null);
      setProgress({
        runId: createId('run'),
        disconnectedAt: at,
        phase: 'suspected',
        remeasureCount: 0,
      });
      await writeQueue.current;
    },
    [updateDevice, setProgress, cancelProgress],
  );

  const handleReconnect = useCallback(
    async (at: string, stateOnly = false) => {
      // 완료 전 재연결: 진행·예약·늦은 응답을 정리하고 새 기록을 남기지 않는다.
      const hadProgress = Boolean(progressRef.current || reanalysisRef.current);
      if (stateOnly && !hadProgress) return;
      cancelProgress();
      if (hadProgress) setCancelNotice('차량이 다시 연결되어 주차 확인을 취소했어요.');
      await updateDevice({ vehicleConnected: true });
      if (!stateOnly)
        setReconnectEvent((previous) => ({
          seq: (previous?.seq ?? 0) + 1,
          at,
        }));
      await writeQueue.current;
    },
    [cancelProgress, updateDevice],
  );

  const deviceError = useVehicleBluetooth({
    ready: !isRestoring,
    onDisconnect: handleDisconnect,
    onReconnect: handleReconnect,
  });

  const startLocating = useCallback(() => {
    const current = progressRef.current;
    if (
      !current ||
      current.phase === 'awaiting-crosswalk-answer' ||
      current.phase === 'analyzing'
    ) {
      return;
    }
    // 재측정은 이전 타이머·만료를 무효화하고 재측정 횟수를 센다.
    const remeasured = current.phase !== 'suspected' && current.phase !== 'locating';
    setProgress({
      runId: current.runId,
      disconnectedAt: current.disconnectedAt,
      phase: 'locating',
      remeasureCount: Math.min(
        MAX_REMEASURE_COUNT,
        (current.remeasureCount ?? 0) + (remeasured ? 1 : 0),
      ),
    });
    runLocate(current.runId);
  }, [runLocate, setProgress]);

  const pauseLocationTimer = useCallback(() => {
    const current = progressRef.current;
    if (current?.phase !== 'confirming-location' || current.timer.mode === 'paused') return;
    setProgress({ ...current, timer: pauseTimer(current.timer, Date.now()) });
  }, [setProgress]);

  const resumeLocationTimer = useCallback(() => {
    if (lookupPendingRef.current) return;
    const current = progressRef.current;
    if (current?.phase !== 'confirming-location' || current.timer.mode === 'running') return;
    setProgress({ ...current, timer: resumeTimer(current.timer, Date.now()) });
  }, [setProgress]);

  const setLocationLookupPending = useCallback(
    (pending: boolean) => {
      lookupPendingRef.current = pending;
      if (pending) pauseLocationTimer();
      else {
        if (!touchingRef.current) resumeLocationTimer();
        const current = progressRef.current;
        if (current) expire(current.runId);
      }
    },
    [pauseLocationTimer, resumeLocationTimer, expire],
  );

  const extendLocationTimer = useCallback(() => {
    const current = progressRef.current;
    if (current?.phase !== 'confirming-location') return;
    // 15초로 되돌린다. 터치 중이면 손을 뗀 뒤부터 줄어든다(보조 기술로 누른 경우는 바로 진행).
    const now = Date.now();
    setProgress({
      ...current,
      timer: touchingRef.current ? pauseTimer(startTimer(now), now) : startTimer(now),
    });
  }, [setProgress]);

  const notifyTouch = useCallback(
    (active: boolean) => {
      touchingRef.current = active;
      if (active) pauseLocationTimer();
      else resumeLocationTimer();
    },
    [pauseLocationTimer, resumeLocationTimer],
  );

  const retryAnalysis = useCallback(() => {
    const current = progressRef.current;
    if (current?.phase !== 'analyzing') return;
    // 차량을 다시 등록했다면 아직 저장되지 않은 요청이므로 새 차량으로 보낸다.
    const vehicleId = snapshotRef.current.vehicle?.id;
    if (analysisError?.kind === 'vehicle' && current.submission && vehicleId) {
      setProgress({ ...current, submission: { ...current.submission, vehicleId } });
    }
    setAnalysisSaveError(false);
    setAnalysisError(null);
    runAnalysis(current.runId);
  }, [analysisError, runAnalysis, setProgress]);

  // 위치 동의 요구로 멈춘 판정은 동의를 마치면 같은 요청으로 이어서 보낸다.
  const agreementsMissing = missingAgreementsOf(snapshot).length;
  useEffect(() => {
    if (analysisError?.kind !== 'consent' || agreementsMissing > 0 || !snapshot.user) return;
    retryAnalysis();
  }, [analysisError, agreementsMissing, snapshot.user, retryAnalysis]);

  const adjustPlace = useCallback(
    (place: SelectedPlace, source: 'pin' | 'list' = 'list') => {
      const current = progressRef.current;
      if (
        current?.phase === 'confirming-location' ||
        current?.phase === 'selecting-location-manually'
      ) {
        if (!place.isSupportedRegion) {
          setProgress({ ...current, phase: 'outside-region', place });
          return;
        }
        setProgress({ ...current, place, pinAdjusted: source === 'pin', notice: undefined });
      }
    },
    [setProgress],
  );

  const confirmLocation = useCallback(() => {
    if (lookupPendingRef.current) return;
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
    const gps = current.phase === 'confirming-location' ? gpsOf(current) : null;
    if (exceedsAdjustLimit(place, gps)) {
      setProgress({ ...current, notice: ADJUST_NOTICE });
      return;
    }
    updateIf(current.runId, ['confirming-location', 'selecting-location-manually'], () => ({
      runId: current.runId,
      disconnectedAt: current.disconnectedAt,
      remeasureCount: current.remeasureCount,
      phase: 'awaiting-crosswalk-answer',
      place,
      gps,
      confirmedAt: new Date().toISOString(),
      confirmationMethod: current.pinAdjusted ? 'ADJUSTED' : 'CONFIRMED',
    }));
  }, [setProgress, updateIf]);

  const answerCrosswalk = useCallback(
    (answer: CrosswalkAnswer) => {
      const current = progressRef.current;
      if (current?.phase !== 'awaiting-crosswalk-answer') return;
      const gps = current.gps ?? null;
      const method = current.confirmationMethod ?? 'CONFIRMED';
      // 횡단보도 응답은 앱 안에서만 쓰고 서버 요청에 넣지 않는다(명세 8절).
      const submission: ParkingSubmission = {
        clientEventId: createUuid(),
        vehicleId: snapshotRef.current.vehicle?.id ?? '',
        detectedAt: current.disconnectedAt,
        confirmedAt: current.confirmedAt ?? new Date().toISOString(),
        confirmationMethod: method === 'AUTO' && !gps ? 'CONFIRMED' : method,
        gps,
        confirmed: current.place.coordinate,
        remeasureCount: Math.min(MAX_REMEASURE_COUNT, current.remeasureCount ?? 0),
      };
      const changed = updateIf(current.runId, ['awaiting-crosswalk-answer'], () => ({
        runId: current.runId,
        disconnectedAt: current.disconnectedAt,
        remeasureCount: current.remeasureCount,
        phase: 'analyzing',
        place: current.place,
        crosswalkAnswer: answer,
        submission,
      }));
      if (changed) runAnalysis(current.runId);
    },
    [updateIf, runAnalysis],
  );

  const dismissOutsideRegion = useCallback(() => {
    if (progressRef.current?.phase === 'outside-region') cancelProgress();
  }, [cancelProgress]);

  const reanalyze = useCallback(async (recordId: string) => {
    // 첫 await 전에 잠가 연속 탭으로 재분석이 두 번 시작되지 않게 한다.
    if (reanalysisRef.current) return;
    const controller = new AbortController();
    reanalysisRef.current = { recordId, controller };
    setReanalyzingRecordId(recordId);
    const startedIn = epoch.current;
    const valid = () => !controller.signal.aborted && startedIn === epoch.current;
    try {
      const record = (await listRecords()).find((item) => item.id === recordId);
      if (!record) throw new Error('기록을 찾지 못했어요.');
      const submission = record.submission;
      if (!submission) throw new Error('다시 분석할 수 없는 기록이에요.');
      if (!valid()) return;
      const outcome = await analysisService.analyze(
        {
          place: record.place,
          parkedAt: record.parkedAt,
          crosswalkAnswer: record.crosswalkAnswer,
          submission,
        },
        controller.signal,
      );
      // 취소된 재시도는 원래 기록을 그대로 둔다.
      if (!valid()) return;
      const report = withCrosswalkEvidence(outcome.report, record.crosswalkAnswer);
      const next = await upsertRecord(
        {
          ...record,
          id: outcome.recordId,
          status: report.status,
          report,
          serverReport: record.crosswalkAnswer === 'yes' ? outcome.report : undefined,
          retryable: outcome.retryable,
          submission,
          detailed: false,
          updatedAt: new Date().toISOString(),
        },
        valid,
      );
      if (next && valid()) setRecords(next);
    } catch (error) {
      if (isAbortError(error) || !valid()) return;
      throw error;
    } finally {
      if (reanalysisRef.current?.controller === controller) {
        reanalysisRef.current = null;
        setReanalyzingRecordId(null);
      }
    }
  }, []);

  const cancelAll = useCallback(() => {
    lookupPendingRef.current = false;
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
    setAnalysisSaveError(false);
    setAnalysisError(null);
    touchingRef.current = false;
    setRecords([]);
    setLatest(null);
    setRecordsError(null);
  }, []);

  const value = useMemo<ParkingContextValue>(
    () => ({
      deviceError,
      progress,
      isRestoring,
      records,
      recordsError,
      latest,
      lastCompleted,
      reanalyzingRecordId,
      cancelNotice,
      reconnectEvent,
      analysisSaveError,
      analysisError,
      retryAnalysis,
      notifyTouch,
      setLocationLookupPending,
      clearReconnectEvent,
      clearCancelNotice,
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
      loadRecordDetail,
      listRecordsByLevel,
      cancelAll,
    }),
    [
      deviceError,
      progress,
      isRestoring,
      records,
      recordsError,
      latest,
      lastCompleted,
      reanalyzingRecordId,
      cancelNotice,
      reconnectEvent,
      analysisSaveError,
      analysisError,
      retryAnalysis,
      notifyTouch,
      setLocationLookupPending,
      clearReconnectEvent,
      clearCancelNotice,
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
      loadRecordDetail,
      listRecordsByLevel,
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
