import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { InfoRow } from '@/shared/components/InfoRow';
import { Notice } from '@/shared/components/Notice';
import { SheetSurface } from '@/shared/components/Surface';
import { colors, radii, shadows, spacing } from '@/shared/theme/tokens';
import type { SelectedPlace } from '@/shared/types/location';

import { CrosswalkModal } from '../components/CrosswalkModal';
import { ParkingLocationMap } from '../components/ParkingLocationMap';
import { ManualPlacePicker } from '../components/ManualPlacePicker';
import { ManualConfirmHint, TimerGauge } from '../components/TimerGauge';
import { useParking } from '../state/ParkingProvider';
import { gpsOf } from '../types';

export function LocationConfirmScreen() {
  const router = useRouter();
  const parking = useParking();
  const { progress, lastCompleted, isRestoring, setLocationLookupPending, adjustPlace } = parking;
  const runIdRef = useRef<string | null>(null);
  const [selectionPending, setSelectionPending] = useState(false);
  const setLookupPending = useCallback(
    (pending: boolean) => {
      setSelectionPending(pending);
      setLocationLookupPending(pending);
    },
    [setLocationLookupPending],
  );
  const selectPlace = useCallback(
    (next: SelectedPlace) => {
      adjustPlace(next, 'pin');
    },
    [adjustPlace],
  );

  useEffect(() => {
    if (progress) runIdRef.current = progress.runId;
  }, [progress]);

  // 주차 추정 상태에서 들어오면 위치 조회를 시작한다(재진입 시 시간은 리셋하지 않음).
  useEffect(() => {
    if (progress?.phase === 'suspected') parking.startLocating();
  }, [progress?.phase, parking]);

  // 진행이 끝나면: 분석 완료 → 결과, 재연결 취소 등 → 홈.
  useEffect(() => {
    if (isRestoring || progress) return;
    if (lastCompleted && lastCompleted.runId === runIdRef.current) {
      router.replace({ pathname: '/parking/result', params: { recordId: lastCompleted.recordId } });
      return;
    }
    router.replace('/home');
  }, [progress, lastCompleted, isRestoring, router]);

  // 횡단보도 응답 대기·분석 중에는 Android 뒤로 가기를 막는다.
  const locked =
    progress?.phase === 'awaiting-crosswalk-answer' ||
    (progress?.phase === 'analyzing' && !parking.analysisError);
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => locked);
      return () => subscription.remove();
    }, [locked]),
  );

  const goHome = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, [router]);

  // 터치 중 타이머 정지·재개는 앱 전체를 감싼 ParkingTouchGuard가 처리한다.

  if (!progress) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const place =
    progress.phase === 'confirming-location' ||
    progress.phase === 'selecting-location-manually' ||
    progress.phase === 'awaiting-crosswalk-answer' ||
    progress.phase === 'analyzing' ||
    progress.phase === 'outside-region'
      ? progress.place
      : null;

  const showPin =
    place &&
    (progress.phase === 'confirming-location' ||
      progress.phase === 'selecting-location-manually' ||
      progress.phase === 'awaiting-crosswalk-answer');

  const accuracyLabel =
    progress.phase === 'confirming-location'
      ? `GPS 정확도 ±${progress.accuracyMeters}m`
      : progress.phase === 'selecting-location-manually'
        ? '위치 신호 없음'
        : progress.phase === 'locating' || progress.phase === 'suspected'
          ? '위치 확인 중'
          : null;

  return (
    <View style={styles.root}>
      <View style={styles.mapArea}>
        <ParkingLocationMap
          place={place}
          editable={Boolean(showPin) && !locked}
          gps={progress.phase === 'confirming-location' ? gpsOf(progress) : undefined}
          onSelect={selectPlace}
          onLookupPending={setLookupPending}
        />

        <SafeAreaView
          edges={['top', 'left', 'right']}
          style={styles.topBar}
          pointerEvents="box-none"
        >
          {locked ? null : (
            <IconButton name="chevron-back" label="홈으로 돌아가기" onPress={goHome} floating />
          )}
          {accuracyLabel ? (
            <View style={styles.pill}>
              <InfoRow
                items={[
                  { icon: 'locate', text: accuracyLabel },
                  ...(progress.phase === 'confirming-location' && progress.autoConfirm === false
                    ? [{ icon: 'hand-left-outline' as const, text: '직접 확정' }]
                    : []),
                ]}
              />
            </View>
          ) : null}
        </SafeAreaView>
      </View>

      <View style={styles.sheetWrap} pointerEvents="box-none">
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheetSafe}>
          <SheetSurface style={styles.sheet}>
            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              <SheetContent goHome={goHome} selectionPending={selectionPending} />
            </ScrollView>
          </SheetSurface>
        </SafeAreaView>
      </View>

      {progress.phase === 'awaiting-crosswalk-answer' ? (
        <CrosswalkModal
          key={progress.runId}
          visible={progress.phase === 'awaiting-crosswalk-answer'}
          address={place?.address ?? ''}
          onAnswer={parking.answerCrosswalk}
        />
      ) : null}
    </View>
  );
}

function SheetContent({
  goHome,
  selectionPending,
}: {
  goHome: () => void;
  selectionPending: boolean;
}) {
  const parking = useParking();
  const { progress } = parking;
  if (!progress) return null;

  switch (progress.phase) {
    case 'suspected':
    case 'locating':
      return (
        <View style={styles.loadingBlock} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <AppText variant="title" weight="black">
            위치를 확인하고 있어요
          </AppText>
          <AppText variant="body" tone="body">
            차량 연결이 끊긴 곳의 GPS 위치를 찾고 있어요. 지도가 나타나면 중앙 핀에 주차 위치를 맞춰
            주세요.
          </AppText>
        </View>
      );

    case 'outside-region':
      return (
        <View style={styles.block}>
          <View style={styles.texts}>
            <AppText variant="title" weight="black" accessibilityRole="header">
              용인시에서만 이용할 수 있어요
            </AppText>
            <AppText variant="body" tone="body">
              지원 지역이 아니라서 이 주차는 분석하거나 기록하지 않아요.
            </AppText>
            <AppText variant="caption" tone="secondary">
              확인된 위치: {progress.place.address}
            </AppText>
          </View>
          <View style={styles.actions}>
            <Button
              label="홈으로"
              variant="neutral"
              onPress={() => {
                parking.dismissOutsideRegion();
                goHome();
              }}
              style={styles.secondaryAction}
            />
            <Button
              label="다시 측정하기"
              onPress={parking.startLocating}
              style={styles.primaryAction}
            />
          </View>
        </View>
      );

    case 'confirming-location':
      return (
        <View style={styles.block}>
          <View style={styles.texts}>
            <AppText variant="title" weight="black" accessibilityRole="header">
              중앙 핀이 주차한 위치에 있나요?
            </AppText>
            <AppText variant="body" tone="body">
              {selectionPending
                ? '지도를 멈추면 중앙 위치의 주소를 확인해요.'
                : progress.place.address}
            </AppText>
            <AppText variant="caption" tone="secondary">
              지도를 움직여 중앙 핀에 주차한 위치를 맞춰 주세요.
            </AppText>
          </View>
          {progress.notice ? (
            <Notice
              tone="warning"
              title="위치를 다시 확인해 주세요"
              description={progress.notice}
            />
          ) : null}
          {progress.autoConfirm === false ? (
            // 정확도 15m 초과(50m 이하)는 자동 확정 없이 직접 확정한다(명세 8절 #2).
            <ManualConfirmHint
              message={`GPS 오차가 ±${progress.accuracyMeters}m라 직접 확인한 위치로 판정해요`}
            />
          ) : (
            <TimerGauge
              key={progress.timer.mode === 'running' ? progress.timer.deadline : 'paused'}
              timer={progress.timer}
              onExtend={parking.extendLocationTimer}
            />
          )}
          <View style={styles.actions}>
            <Button
              label="다시 측정하기"
              variant="neutral"
              onPress={parking.startLocating}
              style={styles.secondaryAction}
            />
            <Button
              label="이 위치가 맞아요"
              onPress={parking.confirmLocation}
              disabled={selectionPending}
              style={styles.primaryAction}
            />
          </View>
        </View>
      );

    case 'selecting-location-manually': {
      const outside = progress.place ? !progress.place.isSupportedRegion : false;
      return (
        <View style={styles.block}>
          <View style={styles.texts}>
            <AppText variant="title" weight="black" accessibilityRole="header">
              주차 위치를 직접 선택해 주세요
            </AppText>
            <AppText variant="body" tone="body">
              {progress.reason}. 주소를 검색한 뒤 지도를 움직여 중앙 핀에 주차한 위치를 맞춰 주세요.
            </AppText>
          </View>
          <ScrollView
            style={styles.pickerScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <ManualPlacePicker
              selectedId={progress.place?.id ?? null}
              onSelect={(place) => parking.adjustPlace(place, 'list')}
            />
          </ScrollView>
          {progress.notice ? (
            <Notice
              tone="warning"
              title="위치를 다시 확인해 주세요"
              description={progress.notice}
            />
          ) : null}
          {outside ? (
            <Notice
              tone="warning"
              title="용인시에서만 이용할 수 있어요"
              description="용인시 안의 위치를 골라 주세요."
            />
          ) : (
            <ManualConfirmHint />
          )}
          <View style={styles.actions}>
            <Button
              label="다시 측정하기"
              variant="neutral"
              onPress={parking.startLocating}
              style={styles.secondaryAction}
            />
            <Button
              label="이 위치가 맞아요"
              onPress={parking.confirmLocation}
              disabled={!progress.place || outside || selectionPending}
              style={styles.primaryAction}
            />
          </View>
        </View>
      );
    }

    case 'awaiting-crosswalk-answer':
      return (
        <View style={styles.texts}>
          <AppText variant="title" weight="black">
            위치를 확정했어요
          </AppText>
          <AppText variant="body" tone="body">
            {progress.place.address}
          </AppText>
          <AppText variant="caption" tone="secondary">
            질문에 답하면 분석을 시작해요.
          </AppText>
        </View>
      );

    case 'analyzing':
      if (parking.analysisError) {
        return <AnalysisErrorBlock goHome={goHome} />;
      }
      if (parking.analysisSaveError) {
        return (
          <View style={styles.block}>
            <Notice
              title="결과를 저장하지 못했어요"
              description="위치와 응답은 그대로 있어요. 다시 시도해 주세요."
            />
            <Button label="다시 시도" onPress={parking.retryAnalysis} />
          </View>
        );
      }
      return (
        <View style={styles.loadingBlock} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <AppText variant="title" weight="black">
            주차 위험을 분석하고 있어요
          </AppText>
          <AppText variant="body" tone="body">
            금지 구역과 신고 이력을 확인하는 중이에요. 잠시만 기다려 주세요.
          </AppText>
        </View>
      );
  }
}

/** 서버가 판정 요청을 저장하지 못했을 때. 다시 보내도 같은 요청 키라 중복 저장되지 않는다. */
function AnalysisErrorBlock({ goHome }: { goHome: () => void }) {
  const router = useRouter();
  const parking = useParking();
  const error = parking.analysisError;
  if (!error) return null;
  const title =
    error.kind === 'consent'
      ? '위치기반서비스 동의가 필요해요'
      : error.kind === 'vehicle'
        ? '등록된 차량을 찾지 못했어요'
        : error.kind === 'clock'
          ? '휴대폰 시간을 확인해 주세요'
          : '결과를 받지 못했어요';
  return (
    <View style={styles.block} accessibilityLiveRegion="polite">
      <Notice title={title} description={error.message} />
      <View style={styles.actions}>
        {error.kind === 'vehicle' ? (
          <Button
            label="차량 다시 등록"
            variant="neutral"
            onPress={() => router.push('/settings/vehicle')}
            style={styles.secondaryAction}
          />
        ) : (
          <Button
            label="홈으로"
            variant="neutral"
            onPress={goHome}
            style={styles.secondaryAction}
          />
        )}
        <Button label="다시 시도" onPress={parking.retryAnalysis} style={styles.primaryAction} />
      </View>
      <AppText variant="micro" tone="secondary">
        위치와 응답은 그대로 있어요. 다시 보내도 같은 주차로 한 번만 저장돼요.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapLand },
  mapArea: { flex: 1, minHeight: 260 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  pill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
  sheetWrap: { maxHeight: '62%', flexShrink: 1 },
  sheetSafe: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
  },
  sheet: { boxShadow: shadows.sheet, flexShrink: 1 },
  sheetScroll: { flexShrink: 1 },
  block: { gap: spacing.lg },
  texts: { gap: spacing.sm },
  loadingBlock: { gap: spacing.sm, alignItems: 'flex-start', paddingBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  secondaryAction: { flex: 1 },
  primaryAction: { flex: 1.6 },
  pickerScroll: { maxHeight: 240 },
});
