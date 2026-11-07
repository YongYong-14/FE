import type { AnalysisService } from '../contracts';
import { buildDemoReport } from '../fixtures/reports';
import { demoControl, wait } from './scenario';

export const demoAnalysisService: AnalysisService = {
  async analyze(input, signal) {
    await wait(1800, signal);
    const mode = demoControl.consume('analysis', 'level-2');
    if (mode === 'error-once') throw new Error('분석 요청에 실패했어요.');
    return buildDemoReport(mode, input.crosswalkAnswer);
  },
};
