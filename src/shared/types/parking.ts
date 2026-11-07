import type { SelectedPlace } from './location';

export type AnalysisStatus =
  'level-1' | 'level-2' | 'no-risk-found' | 'insufficient-data' | 'failed';

export type ParkingPhase =
  | 'locating'
  | 'confirming-location'
  | 'selecting-location-manually'
  | 'awaiting-crosswalk-answer'
  | 'analyzing'
  | 'completed'
  | 'cancelled';

export interface ParkingRecordSummary {
  id: string;
  parkedAt: string;
  place: SelectedPlace;
  crosswalkAnswer: 'yes' | 'no';
  status: AnalysisStatus;
}
