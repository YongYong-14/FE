import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { IconButton } from '@/shared/components/IconButton';
import { Notice } from '@/shared/components/Notice';
import { SheetSurface } from '@/shared/components/Surface';
import { colors, radii, shadows, spacing } from '@/shared/theme/tokens';
import type { SelectedPlace } from '@/shared/types/location';

import { CrosswalkModal } from '../components/CrosswalkModal';
import { DraggablePin } from '../components/DraggablePin';
import { ManualPlacePicker } from '../components/ManualPlacePicker';
import { MapIllustration } from '@/shared/map/MapIllustration';
import { ManualConfirmHint, TimerGauge } from '../components/TimerGauge';
import { useParking } from '../state/ParkingProvider';

const PIN_LEFT = '43%';
const PIN_TOP = '36%';
const ADJUSTED_SUFFIX = ' 부근 (핀으로 보정)';

/** 핀 이동량을 예시 좌표·주소로 바꾼다(시연용 근사). */
function adjustedPlace(place: SelectedPlace, dx: number, dy: number): SelectedPlace {
  const baseAddress = place.address.replace(ADJUSTED_SUFFIX, '');
  return {
    ...place,
    address: `${baseAddress}${ADJUSTED_SUFFIX}`,
    coordinate: {
      latitude: place.coordinate.latitude - dy * 0.00001,
      longitude: place.coordinate.longitude + dx * 0.00001,
    },
  };
}

export function LocationConfirmScreen() {
  const router = useRouter();
  const parking = useParking();
  const { progress, lastCompleted, isRestoring } = parking;
  const runIdRef = useRef<string | null>(null);
  const originRef = useRef<SelectedPlace | null>(null);

  const currentPlace = progress && 'place' in progress ? progress.place : null;
  useEffect(() => {
    if (progress) runIdRef.current = progress.runId;
    // 핀 보정 전 원래 위치를 기준점으로 기억한다(보정이 누적되지 않도록).
    if (currentPlace && !currentPlace.address.endsWith(ADJUSTED_SUFFIX)) {
      originRef.current = currentPlace;
    }
  }, [progress, currentPlace]);

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
  const locked = progress?.phase === 'awaiting-crosswalk-answer' || progress?.phase === 'analyzing';
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
      <MapIllustration style={StyleSheet.absoluteFill}>
        {showPin && place ? (
          <DraggablePin
            key={`${progress.runId}-${place.id}`}
            left={PIN_LEFT}
            top={PIN_TOP}
            hint={
              progress.phase === 'selecting-location-manually'
                ? '핀을 주차한 건물 입구로 옮겨 주세요'
                : '핀을 끌어서 위치를 맞춰요'
            }
            disabled={progress.phase === 'awaiting-crosswalk-answer'}
            onDrop={(dx, dy) => {
              const origin = originRef.current?.id === place.id ? originRef.current : place;
              parking.adjustPlace(adjustedPlace(origin, dx, dy));
            }}
          />
        ) : null}
      </MapIllustration>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        {locked ? null : (
          <IconButton name="chevron-back" label="홈으로 돌아가기" onPress={goHome} floating />
        )}
        {accuracyLabel ? (
          <View style={styles.pill}>
            <Icon name="locate" size="sm" color={colors.primary} />
            <AppText variant="caption" weight="bold">
              {accuracyLabel}
            </AppText>
          </View>
        ) : null}
      </SafeAreaView>

      <View style={styles.sheetWrap} pointerEvents="box-none">
        <SafeAreaView edges={['bottom']} style={styles.sheetSafe}>
          <SheetSurface style={styles.sheet}>
            <SheetContent goHome={goHome} />
          </SheetSurface>
        </SafeAreaView>
      </View>

      <CrosswalkModal
        key={progress.runId}
        visible={progress.phase === 'awaiting-crosswalk-answer'}
        address={place?.address ?? ''}
        onAnswer={parking.answerCrosswalk}
      />
    </View>
  );
}

function SheetContent({ goHome }: { goHome: () => void }) {
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
            차량 연결이 끊긴 곳을 찾는 중이에요. 확인되면 15초 안에 위치를 맞출 수 있어요.
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
              이 위치에 주차하셨나요?
            </AppText>
            <AppText variant="body" tone="body">
              {progress.place.address}
            </AppText>
          </View>
          <TimerGauge
            key={progress.timer.mode === 'running' ? progress.timer.deadline : 'paused'}
            timer={progress.timer}
            onExtend={parking.extendLocationTimer}
          />
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
              주차한 위치를 골라 주세요
            </AppText>
            <AppText variant="body" tone="body">
              {progress.reason}. 목록에서 직접 고르면 그 위치로 판정해요.
            </AppText>
          </View>
          <ScrollView
            style={styles.pickerScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <ManualPlacePicker
              selectedId={progress.place?.id ?? null}
              onSelect={parking.adjustPlace}
            />
          </ScrollView>
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
              disabled={!progress.place || outside}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapLand },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '72%' },
  sheetSafe: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
  },
  sheet: { boxShadow: shadows.sheet },
  block: { gap: spacing.lg },
  texts: { gap: spacing.xs + 2 },
  loadingBlock: { gap: spacing.sm, alignItems: 'flex-start', paddingBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm + 2 },
  secondaryAction: { flex: 1 },
  primaryAction: { flex: 1.6 },
  pickerScroll: { maxHeight: 240 },
});
