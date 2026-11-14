import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Pressable, StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth';
import {
  formatParkedAgo,
  ParkingGlyph,
  statusTone,
  useParking,
  type ParkingProgress,
} from '@/features/parking';
import { AppText } from '@/shared/components/AppText';
import { Badge, type BadgeTone } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { CoordinateMap } from '@/shared/map/CoordinateMap';
import { LocationDot } from '@/shared/map/MapMarkers';
import { useDeviceLocation } from '@/shared/hooks/useDeviceLocation';
import { BottomBanner, Notice } from '@/shared/components/Notice';
import { Card } from '@/shared/components/Surface';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { hasDetectionPermissions } from '@/shared/types/session';
import { nativeBluetooth } from '@/services/device/bluetooth';
import { HomeMapSheet } from '../components/HomeMapSheet';

function progressCopy(progress: ParkingProgress): {
  title: string;
  description: string;
  action: string;
} {
  switch (progress.phase) {
    case 'suspected':
      return {
        title: '방금 주차하신 것 같아요',
        description: '등록 차량 연결이 끊겼어요. 주차 위치를 확인해 주세요.',
        action: '주차 위치 확인하기',
      };
    case 'awaiting-crosswalk-answer':
      return {
        title: '질문 하나만 남았어요',
        description: '횡단보도 질문에 답하면 분석을 시작해요.',
        action: '주차 위치 확인 이어가기',
      };
    case 'analyzing':
      return {
        title: '주차 위험을 분석하고 있어요',
        description: '분석이 끝나면 결과를 보여드려요.',
        action: '진행 상황 보기',
      };
    case 'outside-region':
      return {
        title: '지원 지역 밖이에요',
        description: '용인시에서만 이용할 수 있어요.',
        action: '확인하기',
      };
    default:
      return {
        title: '주차 위치를 확인하는 중이에요',
        description: '확인하던 위치와 남은 시간은 그대로 유지돼요.',
        action: '주차 위치 확인 이어가기',
      };
  }
}

export function HomeScreen() {
  const router = useRouter();
  const { snapshot, syncVehicle } = useSession();
  const {
    progress,
    records,
    recordsError,
    refreshRecords,
    cancelNotice,
    clearCancelNotice,
    latest: latestInfo,
    deviceError,
  } = useParking();
  const { device, vehicle } = snapshot;
  // 최근 주차는 서버의 GET /parking-events/latest가 기준이다.
  const latest =
    (latestInfo?.recordId ? records.find((record) => record.id === latestInfo.recordId) : null) ??
    records[0];
  const permitted = hasDetectionPermissions(device);
  const autoOpenedRun = useRef<string | null>(null);
  const detectedRunId = progress?.phase === 'suspected' ? progress.runId : null;

  // 홈이 실제로 보일 때 새 연결 해제 건을 바로 연다. 뒤로 돌아온 진행 건은 강제로 열지 않는다.
  useFocusEffect(
    useCallback(() => {
      const openDetectedParking = () => {
        if (
          AppState.currentState !== 'active' ||
          !detectedRunId ||
          autoOpenedRun.current === detectedRunId
        )
          return;
        autoOpenedRun.current = detectedRunId;
        router.push('/parking/confirm');
      };
      openDetectedParking();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') openDetectedParking();
      });
      return () => subscription.remove();
    }, [detectedRunId, router]),
  );

  // 홈에 올 때마다 서버의 최근 주차·등록 차량을 다시 확인한다(04 홈).
  useFocusEffect(
    useCallback(() => {
      void refreshRecords();
      void syncVehicle().catch(() => undefined);
    }, [refreshRecords, syncVehicle]),
  );

  useEffect(() => {
    if (!cancelNotice) return;
    const timeout = setTimeout(clearCancelNotice, 6000);
    return () => clearTimeout(timeout);
  }, [cancelNotice, clearCancelNotice]);

  const connection: { label: string; tone: BadgeTone } = !device.bluetoothEnabled
    ? { label: '블루투스 꺼짐', tone: 'neutral' }
    : deviceError
      ? { label: '연결 확인 실패', tone: 'warning' }
      : device.vehicleConnectionKnown !== true
        ? { label: '감지 준비 중', tone: 'neutral' }
        : device.vehicleConnected
          ? { label: '연결됨', tone: 'primary' }
          : { label: '연결 해제됨', tone: 'warning' };

  const latestCoordinate = latestInfo?.coordinate ?? latest?.place.coordinate ?? null;
  const gps = useDeviceLocation();
  const [recenterKey, setRecenterKey] = useState(0);

  const moveToCurrent = async () => {
    if (await gps.refresh()) setRecenterKey((previous) => previous + 1);
  };

  return (
    <HomeMapSheet
      locating={gps.loading}
      locationError={gps.error}
      onLocate={() => void moveToCurrent()}
      map={
        <CoordinateMap coordinate={gps.coordinate} marker="none" recenterKey={recenterKey}>
          {(projector) => {
            const parked = latestCoordinate ? projector.toScreen(latestCoordinate) : null;
            const current = gps.coordinate ? projector.toScreen(gps.coordinate) : null;
            return (
              <>
                {parked ? (
                  <View
                    pointerEvents="none"
                    style={[styles.parkedCar, { left: parked.x - 18, top: parked.y - 18 }]}
                  >
                    <Icon name="car" size={18} color={colors.inverse} />
                  </View>
                ) : null}
                {current ? <LocationDot point={{ left: current.x, top: current.y }} /> : null}
              </>
            );
          }}
        </CoordinateMap>
      }
    >
      {deviceError ? <Notice title="기기 연결을 확인해 주세요" description={deviceError} /> : null}
      {cancelNotice ? (
        <Pressable onPress={clearCancelNotice} accessibilityHint="안내 닫기">
          <Notice
            tone="info"
            title={cancelNotice}
            description="새 결과나 기록은 남기지 않았어요."
          />
        </Pressable>
      ) : null}

      <View style={styles.vehicleRow}>
        <View style={styles.vehicleTile}>
          <Image
            source={require('../../../../assets/images/vehicle-sedan.png')}
            style={styles.vehicleImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <View style={styles.flex}>
          <AppText variant="caption" tone="secondary">
            등록한 차량
          </AppText>
          <AppText variant="subtitle" weight="bold" numberOfLines={1}>
            {vehicle?.name ?? '등록된 차량 없음'}
          </AppText>
        </View>
        <Badge label={connection.label} tone={connection.tone} />
      </View>

      {progress && progress.phase !== 'suspected' ? (
        <ProgressCard progress={progress} onOpen={() => router.push('/parking/confirm')} />
      ) : null}

      <Card tone="muted" style={styles.recent}>
        <View style={styles.recentHead}>
          <AppText variant="caption" weight="bold" tone="secondary">
            최근 주차
          </AppText>
          {latest ? (
            <Badge label={latest.report.badge} tone={statusTone[latest.status]} dot size="sm" />
          ) : null}
        </View>
        {latest ? (
          <>
            <AppText variant="subtitle" weight="bold">
              {latest.place.address}
            </AppText>
            <View style={styles.recentFoot}>
              <AppText variant="caption" tone="secondary" style={styles.flex}>
                {formatParkedAgo(latest.parkedAt)}
              </AppText>
              <Button
                label="자세히 보기"
                variant="link"
                size="sm"
                onPress={() =>
                  router.push({
                    pathname: '/parking/result',
                    params: { recordId: latest.id },
                  })
                }
                style={styles.linkButton}
              />
            </View>
          </>
        ) : recordsError ? (
          <View style={styles.recentFoot}>
            <AppText variant="label" tone="body" style={styles.flex}>
              기록을 불러오지 못했어요.
            </AppText>
            <Button
              label="다시 시도"
              variant="link"
              size="sm"
              onPress={() => void refreshRecords()}
            />
          </View>
        ) : (
          <AppText variant="label" tone="body">
            아직 주차 기록이 없어요. 등록 차량 연결이 끊기면 주차 위치를 확인해요.
          </AppText>
        )}
      </Card>

      <Button
        label="내 주변 주차장 찾기"
        leading={<ParkingGlyph />}
        onPress={() => router.navigate('/parking-lots')}
      />

      {!permitted ? (
        <BottomBanner
          message="주차 위치와 연결 상태를 확인하려면 위치 ‘항상 허용’과 근처 기기 권한을 확인해 주세요"
          actionLabel="권한 설정"
          onAction={() => router.push('/settings/permissions')}
        />
      ) : !device.bluetoothEnabled ? (
        <BottomBanner
          message="휴대폰 블루투스가 꺼져 있어요. 켜야 주차를 감지할 수 있어요"
          actionLabel="블루투스 켜기"
          onAction={() => void nativeBluetooth.openSettings().catch(() => undefined)}
        />
      ) : null}
    </HomeMapSheet>
  );
}

function ProgressCard({ progress, onOpen }: { progress: ParkingProgress; onOpen: () => void }) {
  const copy = progressCopy(progress);
  return (
    <View style={styles.progress} accessibilityLiveRegion="polite">
      <View style={styles.progressHead}>
        <Icon name="navigate-circle" color={colors.primary} size="lg" />
        <View style={styles.flex}>
          <AppText variant="body" weight="bold">
            {copy.title}
          </AppText>
          <AppText variant="caption" tone="body">
            {copy.description}
          </AppText>
        </View>
      </View>
      <Button label={copy.action} size="md" onPress={onOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  parkedCar: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.ink,
  },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  vehicleTile: {
    width: 72,
    height: 48,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  vehicleImage: { width: 64, height: 22.4 },
  progress: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1.6,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  progressHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  recent: { paddingVertical: spacing.lg },
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recentFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  linkButton: { marginRight: -spacing.sm },
});
