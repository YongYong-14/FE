import type { AnalysisStatus, ParkingPhase } from '@/shared/types/parking';

// 시연용 다음 응답·이벤트 설정. 화면과 분리된 모의 동작이며 실제 연동 시 제거한다.
// "한 번 실패" 값은 한 번 사용하면 정상으로 돌아간다(실패 후 재시도 확인용).

export interface DemoScenario {
  login: 'success' | 'fail-once';
  vehicleList: 'normal' | 'empty' | 'fail-once';
  vehicleRegister: 'success' | 'fail-once';
  locate: 'yongin' | 'outside' | 'unavailable';
  analysis: AnalysisStatus | 'error-once';
  /** 주변 주차장 조회 결과. far-only는 500m 안에는 없고 1km 안에만 있다. */
  parkingLots: 'normal' | 'far-only' | 'none';
  /** 장소 검색 실패 1회. */
  placeSearch: 'normal' | 'fail-once';
  /** 이 단계에 도달하면 등록 차량 재연결 이벤트를 발생시킨다. */
  reconnectAt: ParkingPhase | null;
}

export const defaultScenario: DemoScenario = {
  login: 'success',
  vehicleList: 'normal',
  vehicleRegister: 'success',
  locate: 'yongin',
  analysis: 'level-2',
  parkingLots: 'normal',
  placeSearch: 'normal',
  reconnectAt: null,
};

let scenario: DemoScenario = { ...defaultScenario };
const listeners = new Set<(value: DemoScenario) => void>();

function emit() {
  for (const listener of listeners) listener(scenario);
}

export const demoControl = {
  get(): DemoScenario {
    return scenario;
  },
  set(patch: Partial<DemoScenario>) {
    scenario = { ...scenario, ...patch };
    emit();
  },
  reset() {
    scenario = { ...defaultScenario };
    emit();
  },
  subscribe(listener: (value: DemoScenario) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** 일회성 값을 소비하고 정상값으로 되돌린다. */
  consume<K extends keyof DemoScenario>(key: K, resetTo: DemoScenario[K]): DemoScenario[K] {
    const value = scenario[key];
    if (value !== resetTo && String(value).endsWith('-once')) {
      scenario = { ...scenario, [key]: resetTo };
      emit();
    }
    return value;
  },
};

export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });
}
