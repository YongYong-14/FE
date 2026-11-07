import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { StateView } from '@/shared/components/StateView';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import type { AnalysisStatus } from '@/shared/types/parking';
import { markReportViewed } from '@/storage/surveys';

import { MapIllustration, ParkingMarker, RiskZone } from '@/shared/map/MapIllustration';
import { ReportView } from '../components/ReportView';
import { useParking } from '../state/ParkingProvider';

const MARKER = { left: '50%', top: '48%' } as const;

function ReportMap({ status, zoneLabel }: { status: AnalysisStatus; zoneLabel?: string }) {
  const zoneTone = status === 'level-1' ? 'danger' : status === 'level-2' ? 'warning' : null;
  return (
    <MapIllustration style={styles.map}>
      {zoneTone ? (
        <RiskZone left={MARKER.left} top={MARKER.top} size={144} tone={zoneTone} />
      ) : null}
      <ParkingMarker left={MARKER.left} top={MARKER.top} />
      {zoneTone && zoneLabel ? (
        <View style={styles.zoneLabel}>
          <AppText
            variant="micro"
            weight="bold"
            style={{ color: zoneTone === 'danger' ? colors.dangerText : colors.warningText }}
          >
            {zoneLabel}
          </AppText>
        </View>
      ) : null}
    </MapIllustration>
  );
}

/** 분석 결과·리포트. 기록 id로 저장된 결과를 보여준다. */
export function AnalysisResultScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams<{ recordId?: string }>();
  const { records, isRestoring, reanalyze, reanalyzingRecordId, recordsError, refreshRecords } =
    useParking();
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const record = records.find((item) => item.id === recordId);
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

  if (isRestoring) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!record) {
    return (
      <SafeAreaView style={styles.fallback}>
        <StateView
          icon="document-text-outline"
          title={recordsError ? '기록을 불러오지 못했어요' : '결과를 찾을 수 없어요'}
          description={
            recordsError
              ? '저장된 기록은 그대로 있어요. 다시 시도해 주세요.'
              : '홈에서 다시 확인해 주세요.'
          }
          actions={
            <>
              {recordsError ? (
                <Button label="다시 시도" onPress={() => void refreshRecords()} />
              ) : null}
              <Button label="홈으로" variant="ghost" onPress={() => router.replace('/home')} />
            </>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <ReportMap status={record.status} zoneLabel={record.report.zoneLabel} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
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
      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
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
  map: { height: 320 },
  zoneLabel: {
    position: 'absolute',
    left: '56%',
    top: '68%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.xs,
    backgroundColor: colors.surface,
  },
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
