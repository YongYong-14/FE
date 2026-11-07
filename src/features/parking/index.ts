// 주차 기능 공개 진입점. 다른 기능은 이 파일만 참조한다.
export { ParkingDemoPanel } from './components/ParkingDemoPanel';
export { ParkingGlyph, ReportView, statusTone } from './components/ReportView';
export { AnalysisResultScreen as ReportScreen } from './screens/AnalysisResultScreen';
export { ParkingProvider, useParking } from './state/ParkingProvider';
export type { ParkingProgress } from './types';
export { formatParkedAt, formatParkedShort } from './utils/report';
