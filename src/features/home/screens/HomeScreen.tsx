import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import {
  formatParkedAt,
  ParkingGlyph,
  statusTone,
  useParking,
  type ParkingProgress,
} from '@/features/parking';
import { AppText } from '@/shared/components/AppText';
import { Badge, type BadgeTone } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { MapIllustration, ParkingMarker, RiskZone } from '@/shared/map/MapIllustration';
import { IconButton } from '@/shared/components/IconButton';
import { BottomBanner, Notice } from '@/shared/components/Notice';
import { Card, IconTile, SheetSurface } from '@/shared/components/Surface';
import { colors, radii, shadows, spacing } from '@/shared/theme/tokens';
import { hasDetectionPermissions } from '@/shared/types/session';

const MARKER = { left: '60%', top: '40%' } as const;

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
  const { snapshot, updateDevice } = useSession();
  const { progress, records, recordsError, refreshRecords, cancelNotice, clearCancelNotice } =
    useParking();
  const { device, vehicle } = snapshot;
  const latest = records[0];
  const permitted = hasDetectionPermissions(device);

  useEffect(() => {
    if (!cancelNotice) return;
    const timeout = setTimeout(clearCancelNotice, 6000);
    return () => clearTimeout(timeout);
  }, [cancelNotice, clearCancelNotice]);

  const status = !permitted
    ? { title: '감지가 제한돼요', detail: '권한을 확인해 주세요', dot: colors.warning }
    : !device.bluetoothEnabled
      ? {
          title: '블루투스가 꺼져 있어요',
          detail: '켜야 감지할 수 있어요',
          dot: colors.warning,
        }
      : { title: '주차 감지 켜짐', detail: '연결 해제 시 위치 확인', dot: colors.primary };

  const connection: { label: string; tone: BadgeTone } = !device.bluetoothEnabled
    ? { label: '연결 안 됨', tone: 'neutral' }
    : device.vehicleConnected
      ? { label: '연결됨', tone: 'primary' }
      : { label: '연결 해제됨', tone: 'warning' };

  const zoneTone =
    latest?.status === 'level-1' ? 'danger' : latest?.status === 'level-2' ? 'warning' : null;

  return (
    <View style={styles.root}>
      <MapIllustration style={StyleSheet.absoluteFill}>
        {zoneTone ? (
          <RiskZone left={MARKER.left} top={MARKER.top} size={124} tone={zoneTone} />
        ) : null}
        {latest ? <ParkingMarker left={MARKER.left} top={MARKER.top} /> : null}
      </MapIllustration>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <View
          style={styles.statusPill}
          accessible
          accessibilityLabel={`${status.title}. ${status.detail}`}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: status.dot, boxShadow: `0 0 0 4px ${status.dot}2e` },
            ]}
          />
          <AppText variant="body" weight="bold" numberOfLines={1}>
            {status.title}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.flex}>
            {status.detail}
          </AppText>
        </View>
        <IconButton
          name="settings-outline"
          label="마이페이지 설정"
          onPress={() => router.navigate('/mypage')}
          floating
        />
      </SafeAreaView>

      <View style={styles.sheetWrap}>
        <SheetSurface style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
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
              <IconTile
                name="car-outline"
                background={colors.primaryTint}
                color={colors.primary}
                size={48}
              />
              <View style={styles.flex}>
                <AppText variant="caption" tone="secondary">
                  등록한 차량
                </AppText>
                <AppText variant="subtitle" weight="bold" numberOfLines={1}>
                  {vehicle?.name}
                </AppText>
              </View>
              <Badge label={connection.label} tone={connection.tone} />
            </View>

            {progress ? (
              <ProgressCard progress={progress} onOpen={() => router.push('/parking/confirm')} />
            ) : null}

            <Card tone="muted" style={styles.recent}>
              <View style={styles.recentHead}>
                <AppText variant="caption" weight="bold" tone="secondary">
                  최근 주차
                </AppText>
                {latest ? (
                  <Badge
                    label={latest.report.badge}
                    tone={statusTone[latest.status]}
                    dot
                    size="sm"
                  />
                ) : null}
              </View>
              {latest ? (
                <>
                  <AppText variant="subtitle" weight="bold">
                    {latest.place.address}
                  </AppText>
                  <View style={styles.recentFoot}>
                    <AppText variant="caption" tone="secondary" style={styles.flex}>
                      {formatParkedAt(latest.parkedAt)}
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
                message="위치 권한이 ‘항상 허용’이 아니거나 블루투스 권한이 없어서 앱을 닫으면 감지할 수 없어요"
                actionLabel="권한 설정"
                onAction={() => router.push('/settings/permissions')}
              />
            ) : !device.bluetoothEnabled ? (
              <BottomBanner
                message="휴대폰 블루투스가 꺼져 있어요. 켜야 주차를 감지할 수 있어요"
                actionLabel="블루투스 켜기"
                onAction={() => void updateDevice({ bluetoothEnabled: true })}
              />
            ) : null}
          </ScrollView>
        </SheetSurface>
      </View>
    </View>
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
  root: { flex: 1, backgroundColor: colors.mapBase },
  flex: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '64%' },
  sheet: { paddingBottom: 0, gap: spacing.sm },
  sheetContent: { gap: spacing.lg, paddingBottom: spacing.xl },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
