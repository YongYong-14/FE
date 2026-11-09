import { Platform } from 'react-native';

import { demoGpsPlace } from '../fixtures/places';
import type {
  AccountService,
  AnalysisService,
  MapService,
  NotificationSettingsService,
  ParkingLotService,
  RecordService,
  SystemService,
  VehicleService,
} from '../contracts';
import { authSession } from './client';
import { apiConfig } from './config';
import * as endpoints from './endpoints';
import { ApiError, isAbortError, isApiError } from './errors';
import {
  buildAlert,
  buildReport,
  deviceTypeOf,
  missingAgreementsFrom,
  recordFromDetail,
  recordFromLatest,
  recordFromListItem,
  retryableOf,
  statusOf,
  toCoordinate,
  toParkingEventRequest,
  toParkingLot,
  toRiskZoneData,
  toVehicle,
} from './mappers';
import { requiredAgreements } from '@/shared/types/session';

// 내부 호출 규격(contracts.ts)의 서버 API 구현.

function deviceInfo(): string {
  const constants = Platform.constants as { Model?: string; Release?: string } | undefined;
  const info =
    Platform.OS === 'android'
      ? [constants?.Model, `Android ${constants?.Release ?? String(Platform.Version)}`]
          .filter(Boolean)
          .join(' / ')
      : `${Platform.OS} ${String(Platform.Version ?? '')}`.trim();
  return info.slice(0, 200);
}

export const apiAccountService: AccountService = {
  async signIn() {
    // 카카오 SDK 연결 전에는 개발용 토큰을 쓴다. SDK를 붙이면 SDK 로그인 결과의 액세스 토큰으로 바꾼다.
    const kakaoAccessToken = apiConfig.devKakaoAccessToken;
    if (!kakaoAccessToken) throw new ApiError(0, 'KAKAO_SDK_UNAVAILABLE');
    const response = await endpoints.loginWithKakao({ kakaoAccessToken, deviceInfo: deviceInfo() });
    await authSession.set(response);
    return {
      user: {
        id: response.user.id,
        nickname: response.user.nickname,
        profileImageUrl: response.user.profileImageUrl,
      },
      isNewUser: response.isNewUser,
      missingAgreements: response.agreements.missing.filter((type) =>
        requiredAgreements.includes(type),
      ),
    };
  },

  async restore() {
    if (!(await authSession.hasSession())) return null;
    try {
      const me = await endpoints.getMe();
      return {
        user: { id: me.id, nickname: me.nickname, email: me.email },
        hasVehicle: me.hasVehicle,
        missingAgreements: missingAgreementsFrom(me.agreements, apiConfig.agreementVersion),
      };
    } catch (error) {
      if (isApiError(error) && error.status === 401) return null;
      throw error;
    }
  },

  async agree(types) {
    // 같은 사용자의 동의는 순서대로 보낸다.
    for (const type of types) {
      await endpoints.recordAgreement({
        type,
        version: apiConfig.agreementVersion,
        action: 'AGREE',
      });
    }
  },

  async signOut() {
    const refreshToken = await authSession.refreshToken();
    try {
      if (refreshToken) await endpoints.logout(refreshToken);
    } catch {
      // 서버 폐기에 실패해도 기기 로그인은 끝낸다. 액세스 토큰은 만료(30분)까지만 유효하다.
    } finally {
      await authSession.clear();
    }
  },

  async withdraw() {
    await endpoints.deleteMe();
    await authSession.clear();
  },

  onSessionExpired(listener) {
    return authSession.onExpired(listener);
  },
};

export const apiVehicleService: VehicleService = {
  async getVehicle() {
    const { vehicle } = await endpoints.getVehicle();
    return vehicle ? toVehicle(vehicle) : null;
  },

  async register(device) {
    const body = {
      name: device.name,
      bluetoothAddress: device.address.toUpperCase(),
      deviceType: deviceTypeOf(device.kind),
    };
    try {
      const { vehicle } = await endpoints.putVehicle(body);
      if (!vehicle) throw new ApiError(500, 'INVALID_RESPONSE');
      return toVehicle(vehicle);
    } catch (error) {
      // 동시 변경으로 충돌하면 다시 조회한 뒤 한 번만 재시도한다(명세 3절).
      if (!isApiError(error, 'VEHICLE_CONFLICT')) throw error;
      await endpoints.getVehicle();
      const { vehicle } = await endpoints.putVehicle(body);
      if (!vehicle) throw new ApiError(500, 'INVALID_RESPONSE');
      return toVehicle(vehicle);
    }
  },
};

export const apiNotificationSettingsService: NotificationSettingsService = {
  get: () => endpoints.getNotificationSettings(),
  update: (patch) => endpoints.patchNotificationSettings(patch),
};

export const apiAnalysisService: AnalysisService = {
  async analyze(input, signal) {
    const body = toParkingEventRequest(input.submission);
    let response = await endpoints.createParkingEvent(body, signal);
    // 판정 자체가 실패(FAILED, 1회)했으면 같은 clientEventId로 한 번 더 보낸다(명세 4절).
    if (retryableOf(response.assessment)) {
      try {
        response = await endpoints.createParkingEvent(body, signal);
      } catch (error) {
        if (isAbortError(error)) throw error;
      }
    }
    const { assessment } = response;
    const report = buildReport(assessment, {
      detectedAt: input.submission.detectedAt,
      crosswalkAnswer: input.crosswalkAnswer,
    });
    return {
      recordId: response.parkingEventId,
      status: statusOf(assessment),
      report,
      address: response.address,
      retryable: retryableOf(assessment),
      alert: buildAlert(response.parkingEventId, assessment, report),
    };
  },

  async reportDelivery(recordId, result) {
    try {
      await endpoints.reportParkingEventDelivery(
        recordId,
        'deliveredAt' in result
          ? { deliveredAt: result.deliveredAt, failure: null }
          : { deliveredAt: null, failure: result.failure },
      );
    } catch (error) {
      // 알림 대상이 아닌 이벤트면 무시한다(명세 6절).
      if (!isApiError(error, 'DELIVERY_NOT_EXPECTED')) throw error;
    }
  },
};

export const apiRecordService: RecordService = {
  async list(options) {
    const { items } = await endpoints.listParkingEvents({
      level: options?.level ?? 'ALL',
      limit: 100,
    });
    return items.map(recordFromListItem);
  },

  async get(recordId) {
    try {
      return recordFromDetail(await endpoints.getParkingEvent(recordId));
    } catch (error) {
      if (isApiError(error, 'PARKING_EVENT_NOT_FOUND', 'NOT_FOUND', 'INVALID_INPUT')) return null;
      throw error;
    }
  },

  async latest() {
    const response = await endpoints.getLatestParkingEvent();
    const { event, assessment } = response;
    return {
      record: event && assessment ? recordFromLatest(event, assessment) : null,
      coordinate: event?.confirmedLocation ? toCoordinate(event.confirmedLocation) : null,
      dataPeriod: response.dataPeriod,
    };
  },
};

export const apiMapService: MapService = {
  // 기기 GPS 연동 전에는 데모 현재 위치를 지도 기준점으로 쓴다.
  currentLocation: () => demoGpsPlace.coordinate,
  async riskZones(bounds, at) {
    return toRiskZoneData(await endpoints.getRiskZones({ ...bounds, at }));
  },
};

export const apiParkingLotService: ParkingLotService = {
  async search(origin, radiusMeters) {
    const response = await endpoints.getNearbyParkingLots({
      lat: origin.latitude,
      lng: origin.longitude,
      radius: radiusMeters,
    });
    const now = new Date();
    return {
      radiusMeters: response.radiusM,
      expanded: response.expanded,
      lots: response.items.map((item) => toParkingLot(item, now)),
      isExampleData: false,
    };
  },
};

export const apiSystemService: SystemService = {
  mode: 'api',
  baseUrl: apiConfig.baseUrl,
  async health() {
    const { status } = await endpoints.getHealth();
    return { ok: status === 'UP', status };
  },
};
