import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { StateView } from '@/shared/components/StateView';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { markReportViewed } from '@/storage/surveys';

import { CoordinateMap } from '@/shared/map/CoordinateMap';
import { ReportView } from '../components/ReportView';
import { useParking } from '../state/ParkingProvider';

type DetailState = 'idle' | 'loading' | 'not-found' | 'error';

/** 주소는 서버가 응답 뒤에 채우므로 상세를 한 번 더 읽는다(명세 4절). */
const ADDRESS_REFETCH_MS = 3000;

/**
 * 분석 결과·리포트(07 상세). 기록 id로 저장된 결과를 바로 보여주고,
 * 서버 연결 시 GET /parking-events/{id}로 근거·신고 집중 시간·주소를 채운다.
 */
export function AnalysisResultScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams<{ recordId?: string }>();
  const { records, isRestoring, reanalyze, reanalyzingRecordId, loadRecordDetail } = useParking();
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; state: DetailState } | null>(null);
  const requestKey = `${recordId ?? ''}:${detailKey}`;
  const detail: DetailState = loaded?.key === requestKey ? loaded.state : 'loading';
  const record = records.find((item) => item.id === recordId);

  useEffect(() => {
    if (!recordId) return;
    let active = true;
    let refetch: ReturnType<typeof setTimeout> | undefined;
    loadRecordDetail(recordId)
      .then((result) => {
        if (!active) return;
        setLoaded({ key: requestKey, state: result === 'not-found' ? 'not-found' : 'idle' });
        if (result === 'loaded') {
          refetch = setTimeout(() => {
            void loadRecordDetail(recordId).catch(() => undefined);
          }, ADDRESS_REFETCH_MS);
        }
      })
      .catch(() => {
        if (active) setLoaded({ key: requestKey, state: 'error' });
      });
    return () => {
      active = false;
      if (refetch) clearTimeout(refetch);
    };
  }, [recordId, loadRecordDetail, requestKey]);
  const viewedRiskId =
    record && (record.status === 'level-1' || record.status === 'level-2') ? record.id : null;

  // 위험 리포트를 확인한 주차만 재탑승 사후 설문 대상이 된다.
  useEffect(() => {
    if (viewedRiskId) void markReportViewed(viewedRiskId).catch(() => undefined);
  }, [viewedRiskId]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }

  if (isRestoring || (!record && detail === 'loading')) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!record) {
    const failed = detail === 'error';
    return (
      <SafeAreaView style={styles.fallback}>
        <StateView
          icon="document-text-outline"
          title={failed ? '기록을 불러오지 못했어요' : '결과를 찾을 수 없어요'}
          description={
            failed
              ? '저장된 기록은 그대로 있어요. 다시 시도해 주세요.'
              : '내 기록 목록에서 다시 확인해 주세요.'
          }
          actions={
            <>
              {failed ? (
                <Button label="다시 시도" onPress={() => setDetailKey((key) => key + 1)} />
              ) : null}
              <Button label="기록으로" variant="ghost" onPress={() => router.replace('/history')} />
            </>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <CoordinateMap coordinate={record.place.coordinate ?? null} style={styles.map} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
          <ReportView
            record={record}
            reanalyzing={reanalyzingRecordId === record.id}
            reanalyzeError={reanalyzeError}
            onReanalyze={() => {
              setReanalyzeError(null);
              void reanalyze(record.id).catch(() =>
                setReanalyzeError('다시 분석하지 못했어요. 기존 결과는 그대로 보관돼요.'),
              );
            }}
            onFindParking={() => router.navigate('/parking-lots')}
          />
        </SafeAreaView>
      </ScrollView>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.topBar} pointerEvents="box-none">
        <IconButton name="chevron-back" label="뒤로 가기" onPress={goBack} floating />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  fallback: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scroll: { flexGrow: 1 },
  map: { height: 320, minHeight: 320, flex: 0 },
  sheet: {
    flex: 1,
    marginTop: -40,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    backgroundColor: colors.background,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
