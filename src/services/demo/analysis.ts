import type { AnalysisService } from '../contracts';
import { buildDemoReport } from '../fixtures/reports';
import { demoControl, wait } from './scenario';

// 데모 판정. "요청 오류 1회"는 실패 결과로 저장해 다시 분석하기를 확인할 수 있게 한다.
export const demoAnalysisService: AnalysisService = {
  async analyze(input, signal) {
    await wait(1800, signal);
    const mode = demoControl.consume('analysis', 'level-2');
    const status = mode === 'error-once' ? 'failed' : mode;
    return {
      recordId: `rec-${input.submission.clientEventId}`,
      status,
      report: buildDemoReport(status, input.crosswalkAnswer),
      address: null,
      retryable: status === 'insufficient-data' || status === 'failed',
      // 데모는 앱 알림을 띄우지 않는다.
      alert: null,
    };
  },
  async reportDelivery() {
    // 데모는 서버 보고가 없다.
  },
};
