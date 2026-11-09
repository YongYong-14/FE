import type { Coordinate } from '@/shared/types/location';
import type { DataPeriod, ParkingLot, ParkingLotType, RiskZoneData } from '@/shared/types/map';
import type {
  AnalysisReport,
  AnalysisStatus,
  CrosswalkAnswer,
  ParkingAlert,
  ParkingRecord,
  ParkingSubmission,
  RecordPlace,
  ReportChart,
  ReportEvidence,
  ReportStat,
} from '@/shared/types/parking';
import {
  requiredAgreements,
  type AgreementType,
  type DeviceKind,
  type RegisteredVehicle,
} from '@/shared/types/session';
import {
  formatMeters,
  formatPercent,
  formatWon,
  kstSlotOf,
  periodRangeLabel,
  timeSlotLabel,
  weekdayLabel,
} from '@/shared/utils/format';
import { isOpenAt } from '@/shared/utils/hours';

import type {
  AgreementEvent,
  AssessmentDto,
  AssessmentSummaryDto,
  DetailAssessmentDto,
  EventDto,
  LatLng,
  ParkingEventDetailResponse,
  ParkingEventListItem,
  ParkingEventRequest,
  ParkingLotDto,
  RiskZonesResponse,
  StatsPeak,
  VehicleDto,
} from './types';

// 서버 응답 → 앱 내부 자료형. 화면 문구는 서버의 title·body·description을 쓰지 않고 앱이 정한다(명세 8절).

export const toCoordinate = (point: LatLng): Coordinate => ({
  latitude: point.lat,
  longitude: point.lng,
});

const toLatLng = (coordinate: Coordinate): LatLng => ({
  lat: coordinate.latitude,
  lng: coordinate.longitude,
});

// ── 계정·차량

/** 유형별 최신 이벤트가 현재 버전 AGREE가 아니면 미동의로 본다. */
export function missingAgreementsFrom(events: AgreementEvent[], version: string): AgreementType[] {
  return requiredAgreements.filter((type) => {
    const latest = events.find((event) => event.type === type);
    return !latest || latest.action !== 'AGREE' || latest.version !== version;
  });
}

const deviceTypes: Record<DeviceKind, string> = {
  'car-audio': 'CAR_AUDIO',
  earphone: 'EARPHONE',
  speaker: 'SPEAKER',
};

export const deviceTypeOf = (kind?: DeviceKind): string | null => (kind ? deviceTypes[kind] : null);

function kindOf(deviceType: string | null): DeviceKind | undefined {
  const entry = Object.entries(deviceTypes).find(([, value]) => value === deviceType);
  return entry ? (entry[0] as DeviceKind) : undefined;
}

export function toVehicle(dto: VehicleDto): RegisteredVehicle {
  return {
    id: dto.id,
    name: dto.name,
    bluetoothAddress: dto.bluetoothAddress,
    kind: kindOf(dto.deviceType),
  };
}

// ── 주차 판정

export function toParkingEventRequest(submission: ParkingSubmission): ParkingEventRequest {
  return {
    clientEventId: submission.clientEventId,
    vehicleId: submission.vehicleId,
    detectedAt: submission.detectedAt,
    confirmedAt: submission.confirmedAt,
    confirmationMethod: submission.confirmationMethod,
    originalLocation: submission.gps
      ? { ...toLatLng(submission.gps.coordinate), accuracyM: submission.gps.accuracyMeters }
      : null,
    lastKnownLocation: null,
    confirmedLocation: toLatLng(submission.confirmed),
    remeasureCount: submission.remeasureCount,
  };
}

type AssessmentLike = Pick<AssessmentSummaryDto, 'status' | 'level'>;

/** status·level 조합 → 앱 상태. PARTIAL은 '안전'이 아니라 판단 불가다(명세 4절). */
export function statusOf(assessment: AssessmentLike): AnalysisStatus {
  if (assessment.status === 'SUCCEEDED') {
    if (assessment.level === 1) return 'level-1';
    if (assessment.level === 2) return 'level-2';
    return 'no-risk-found';
  }
  if (assessment.status === 'PARTIAL') return 'insufficient-data';
  return 'failed';
}

/** FAILED이고 서버 판정이 1회뿐이면 같은 요청으로 한 번 더 판정할 수 있다. */
export const retryableOf = (assessment: Pick<AssessmentDto, 'status' | 'attemptCount'>) =>
  assessment.status === 'FAILED' && assessment.attemptCount < 2;

export function zoneName(zoneType: string | null | undefined): string {
  if (zoneType === 'HYDRANT') return '소화전';
  if (zoneType === 'BUS_STOP') return '버스정류소';
  return '금지 시설';
}

const crosswalkEvidence = (answer: CrosswalkAnswer | null): ReportEvidence[] =>
  answer
    ? [{ label: '횡단보도 10m 이내 (직접 응답)', value: answer === 'yes' ? '예' : '아니요' }]
    : [];

const partialSummary: Record<string, string> = {
  OUT_OF_AREA: '용인시 밖이라 위험 여부를 판단하지 못했어요.',
  NOT_TARGET: '이 위치는 신고 예측 대상 지역이 아니라 판단하지 못했어요.',
  NO_ACTIVE_VERSION: '지금은 예측 모델을 쓸 수 없어 판단하지 못했어요.',
};

function peakChart(
  peak: StatsPeak | null | undefined,
  period: string | null,
): ReportChart | undefined {
  if (!peak || peak.slotCounts.length !== 8) return undefined;
  const max = Math.max(...peak.slotCounts);
  if (max <= 0) return undefined;
  return {
    title: '신고가 몰리는 시간',
    caption: `${weekdayLabel(peak.weekday)}요일 · ${period ? `${period} 신고` : '신고 데이터'}`,
    bars: peak.slotCounts.map((count) => count / max),
    peakIndex: peak.timeSlot,
    peakLabel: timeSlotLabel(peak.timeSlot),
  };
}

interface ReportContext {
  detectedAt: string;
  crosswalkAnswer: CrosswalkAnswer | null;
}

/** POST 응답·상세 응답의 assessment로 리포트를 만든다. */
export function buildReport(
  assessment: AssessmentDto | DetailAssessmentDto,
  context: ReportContext,
): AnalysisReport {
  const status = statusOf(assessment);
  const stats = assessment.stats;
  const period = periodRangeLabel(
    stats?.periodStart && stats.periodEnd
      ? { start: stats.periodStart, end: stats.periodEnd }
      : null,
  );
  const reason = assessment.reasons.find((item) => item.rank === 1) ?? assessment.reasons[0];
  const crosswalk = crosswalkEvidence(context.crosswalkAnswer);
  const reportStat: ReportStat[] =
    stats?.reportCount !== null && stats?.reportCount !== undefined
      ? [
          {
            label: `반경 ${stats.reportRadiusM ?? 50}m 신고${period ? ` (${period})` : ''}`,
            value: `${stats.reportCount.toLocaleString('ko-KR')}건`,
          },
        ]
      : [];
  const peak = stats && 'peak' in stats ? stats.peak : null;
  const base = { isExampleData: false, unavailable: [] as string[] };

  switch (status) {
    case 'level-1': {
      const zone = zoneName(assessment.primaryZoneType ?? reason?.zoneType);
      const evidence: ReportEvidence[] = [];
      if (reason?.distanceM !== null && reason?.distanceM !== undefined) {
        evidence.push({ label: `${zone}까지 거리`, value: formatMeters(reason.distanceM) });
      }
      if (reason?.thresholdM !== null && reason?.thresholdM !== undefined) {
        evidence.push({
          label: '주정차 금지 거리',
          value: `${formatMeters(reason.thresholdM)} 이내`,
        });
      }
      if (reason?.accuracyMarginM !== null && reason?.accuracyMarginM !== undefined) {
        evidence.push({ label: 'GPS 오차', value: `±${formatMeters(reason.accuracyMarginM)}` });
      }
      const fine =
        assessment.referenceFineAmount !== null
          ? [{ label: '예상 과태료 (최대)', value: formatWon(assessment.referenceFineAmount) }]
          : [];
      return {
        ...base,
        status,
        badge: `1단계 · ${zone} 주변`,
        headline: `${zone} 주변이에요`,
        evidence: [...evidence, ...crosswalk],
        stats: [...fine, ...reportStat],
        chart: peakChart(peak, period),
        zoneLabel:
          reason?.thresholdM !== null && reason?.thresholdM !== undefined
            ? `${zone} ${formatMeters(reason.thresholdM)} 이내`
            : '금지 구역',
        notes:
          assessment.primaryZoneType === 'HYDRANT'
            ? ['소화전 과태료는 안전표지(적색 노면표시)가 있는 곳 기준 최대 금액이에요.']
            : undefined,
      };
    }
    case 'level-2': {
      const slot = kstSlotOf(context.detectedAt);
      const evidence: ReportEvidence[] = [];
      if (stats?.topPercent !== null && stats?.topPercent !== undefined) {
        evidence.push({
          label: `${weekdayLabel(slot.weekday)}요일 ${timeSlotLabel(slot.timeSlot)} 신고 집중도`,
          value: `상위 ${formatPercent(stats.topPercent)}`,
        });
      }
      evidence.push({ label: '2단계 기준', value: '상위 10% 이내' });
      const fine =
        assessment.referenceFineAmount !== null
          ? [
              {
                label: '예상 과태료 (금지 구역이라면)',
                value: formatWon(assessment.referenceFineAmount),
              },
            ]
          : [];
      return {
        ...base,
        status,
        badge: '2단계 · 신고 다발 구역',
        headline: '신고가 잦은 곳이에요',
        evidence: [...evidence, ...crosswalk],
        stats: [...reportStat, ...fine],
        chart: peakChart(peak, period),
        zoneLabel: `신고 집중 칸 ${stats?.reportRadiusM ?? 50}m`,
      };
    }
    case 'no-risk-found':
      return {
        ...base,
        status,
        badge: '알림 대상 아님',
        headline: '알림 대상이 아니에요',
        summary:
          '금지 시설 근처나 신고 집중 칸으로 확인되지 않았어요. 안전하거나 합법적인 주차라는 뜻은 아니에요.',
        evidence: crosswalk,
        stats: reportStat,
        chart: peakChart(peak, period),
      };
    case 'insufficient-data':
      return {
        ...base,
        status,
        badge: '판단 불가',
        headline: '판단할 수 없어요',
        summary:
          partialSummary[assessment.predictionStatus ?? ''] ??
          '이 위치의 데이터가 충분하지 않아 위험 여부를 판단하지 못했어요.',
        evidence: crosswalk,
        stats: [],
        unavailable: ['신고 집중도', '시간대별 신고'],
      };
    case 'failed':
      return {
        ...base,
        status,
        badge: '분석 실패',
        headline: '분석을 마치지 못했어요',
        summary: retryableOf(assessment)
          ? '서버에서 판정하지 못했어요. 위치와 주차 시각은 그대로 두고 다시 분석할 수 있어요.'
          : '서버에서 판정하지 못했어요. 알림 없이 기록만 남겨 둬요.',
        evidence: crosswalk,
        stats: [],
      };
  }
}

/** 기록 목록 항목은 요약만 있으므로 상세를 받기 전까지 짧은 리포트를 쓴다. */
export function buildSummaryReport(
  item: ParkingEventListItem,
  crosswalkAnswer: CrosswalkAnswer | null,
): AnalysisReport {
  const { assessment } = item;
  return buildReport(
    {
      status: assessment.status,
      level: assessment.level,
      predictionStatus: assessment.predictionStatus,
      primaryZoneType: assessment.primaryZoneType,
      reasons:
        assessment.distanceM !== null
          ? [
              {
                rank: 1,
                type: 'FACILITY_RULE',
                zoneType: assessment.primaryZoneType,
                distanceM: assessment.distanceM,
                thresholdM: null,
                description: null,
              },
            ]
          : [],
      stats:
        assessment.topPercent !== null
          ? {
              reportCount: null,
              reportRadiusM: null,
              periodStart: null,
              periodEnd: null,
              predictedCount: null,
              topPercent: assessment.topPercent,
            }
          : null,
      referenceFineAmount: assessment.referenceFineAmount,
      // 목록에는 시도 횟수가 없다. 상세를 받으면 정확한 값으로 바뀐다.
      attemptCount: 2,
      notify: null,
      evaluatedAt: null,
    },
    { detectedAt: item.event.detectedAt, crosswalkAnswer },
  );
}

/** 서버 결정이 SEND일 때만 앱 알림을 만든다. 표시 직전에 유효기간을 다시 확인한다. */
export function buildAlert(
  recordId: string,
  assessment: AssessmentDto,
  report: AnalysisReport,
): ParkingAlert | null {
  if (assessment.notify?.decision !== 'SEND') return null;
  if (report.status === 'level-1') {
    const zone = zoneName(assessment.primaryZoneType);
    const distance = report.evidence.find((item) => item.label.endsWith('까지 거리'));
    return {
      recordId,
      level: 1,
      title: `여기는 ${zone} 주변이에요`,
      body: distance
        ? `${zone}까지 ${distance.value}예요. 주정차 금지 구역일 수 있어요.`
        : '주정차 금지 구역일 수 있어요.',
      expiresAt: assessment.notify.expiresAt,
    };
  }
  if (report.status === 'level-2') {
    const concentration = report.evidence[0];
    return {
      recordId,
      level: 2,
      title: '여기는 신고가 잦은 곳이에요',
      body: concentration
        ? `${concentration.label.replace(' 신고 집중도', '')} 기준 신고 ${concentration.value}`
        : '같은 요일·시간대에 신고가 많이 몰리는 곳이에요.',
      expiresAt: assessment.notify.expiresAt,
    };
  }
  return null;
}

export function recordPlaceOf(
  id: string,
  address: string | null,
  coordinate: Coordinate | null,
  fallback?: RecordPlace,
): RecordPlace {
  return {
    id: fallback?.id ?? id,
    name: fallback?.name ?? '주차 위치',
    address: address ?? fallback?.address ?? '주소 확인 중',
    coordinate: coordinate ?? fallback?.coordinate ?? null,
    isSupportedRegion: fallback?.isSupportedRegion ?? true,
  };
}

/** 목록 항목 → 기록(요약). 기기에 남은 앱 정보와의 병합은 주차 기능이 담당한다. */
export function recordFromListItem(item: ParkingEventListItem): ParkingRecord {
  return {
    id: item.event.id,
    parkedAt: item.event.detectedAt,
    place: recordPlaceOf(item.event.id, item.event.address, null),
    crosswalkAnswer: null,
    status: statusOf(item.assessment),
    report: buildSummaryReport(item, null),
    updatedAt: item.event.detectedAt,
    retryable: false,
    detailed: false,
  };
}

/** 상세 응답 → 기록(완성된 리포트). */
export function recordFromDetail(detail: ParkingEventDetailResponse): ParkingRecord {
  const { event, assessment } = detail;
  return {
    id: event.id,
    parkedAt: event.detectedAt,
    place: recordPlaceOf(
      event.id,
      event.address,
      event.confirmedLocation ? toCoordinate(event.confirmedLocation) : null,
    ),
    crosswalkAnswer: null,
    status: statusOf(assessment),
    report: buildReport(assessment, { detectedAt: event.detectedAt, crosswalkAnswer: null }),
    updatedAt: assessment.evaluatedAt ?? event.detectedAt,
    retryable: retryableOf(assessment),
    detailed: true,
    vehicleName: event.vehicleName,
  };
}

/** 최근 주차 응답 → 기록(요약). */
export function recordFromLatest(event: EventDto, assessment: AssessmentSummaryDto): ParkingRecord {
  return recordFromListItem({
    event: { id: event.id, detectedAt: event.detectedAt, address: event.address },
    assessment: {
      ...assessment,
      primaryZoneType: null,
      distanceM: null,
      referenceFineAmount: null,
      topPercent: null,
    },
  });
}

// ── 주변 주차장·지도

const lotTypes: Record<string, ParkingLotType> = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  ATTACHED: 'attached',
};

export function toParkingLot(dto: ParkingLotDto, now: Date = new Date()): ParkingLot {
  return {
    id: dto.id,
    name: dto.name,
    type: lotTypes[dto.parkingType ?? ''] ?? 'public',
    address: dto.address ?? '주소 정보 없음',
    distanceMeters: dto.distanceM,
    feeType: dto.feeType,
    fee: dto.feeInfo,
    hours: dto.operatingHours,
    isOpen: isOpenAt(dto.operatingHours, now),
    capacity: dto.capacity,
    coordinate: toCoordinate(dto.location),
  };
}

export function toRiskZoneData(dto: RiskZonesResponse): RiskZoneData {
  return {
    facilityZones: dto.facilityZones.map((zone) => ({
      zoneType: zone.zoneType,
      coordinate: toCoordinate(zone.location),
      radiusMeters: zone.radiusM,
    })),
    cells: dto.cells.map((cell) => ({
      coordinate: toCoordinate(cell.location),
      sizeMeters: cell.sizeM,
      topPercent: cell.topPercent,
      reportCount: cell.reportCount,
    })),
    dataPeriod: dto.dataPeriod as DataPeriod | null,
    slot: dto.slot,
    isExampleData: false,
  };
}
