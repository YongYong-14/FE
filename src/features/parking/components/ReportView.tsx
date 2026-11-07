import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Badge, type BadgeTone } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';
import { Card } from '@/shared/components/Surface';
import { colors, spacing } from '@/shared/theme/tokens';
import type { AnalysisStatus, ParkingRecord, ReportChart } from '@/shared/types/parking';

import { formatParkedAt } from '../utils/report';

export const statusTone: Record<AnalysisStatus, BadgeTone> = {
  'level-1': 'danger',
  'level-2': 'warning',
  'no-risk-found': 'success',
  'insufficient-data': 'neutral',
  failed: 'neutral',
};

const canRetry = (status: AnalysisStatus) => status === 'insufficient-data' || status === 'failed';

interface ReportViewProps {
  record: ParkingRecord;
  onFindParking: () => void;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
  reanalyzeError?: string | null;
}

/**
 * 분석 결과·기록 상세가 함께 쓰는 리포트 본문.
 * 저장 당시의 결과만 보여주고, 표시만으로 재분석하지 않는다.
 */
export function ReportView({
  record,
  onFindParking,
  onReanalyze,
  reanalyzing,
  reanalyzeError,
}: ReportViewProps) {
  const { report } = record;
  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <Badge label={report.badge} tone={statusTone[report.status]} dot />
        <AppText variant="display" weight="black" accessibilityRole="header">
          {report.headline}
        </AppText>
        <AppText variant="label" tone="secondary">
          {record.place.address} · {formatParkedAt(record.parkedAt)} 주차
        </AppText>
      </View>

      {report.summary ? (
        <Card>
          <AppText variant="body" tone="body">
            {report.summary}
          </AppText>
          {report.unavailable.length > 0 ? (
            <View style={styles.unavailable}>
              {report.unavailable.map((item) => (
                <View key={item} style={styles.unavailableRow}>
                  <AppText variant="label" tone="body" style={styles.flex}>
                    {item}
                  </AppText>
                  <AppText variant="label" weight="bold" tone="secondary">
                    미제공
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {canRetry(report.status) && onReanalyze ? (
        <View style={styles.retry}>
          <Button
            label="다시 분석하기"
            variant="outline"
            onPress={onReanalyze}
            loading={reanalyzing}
            accessibilityHint="같은 위치와 주차 시각으로 다시 분석해요"
          />
          {reanalyzeError ? (
            <AppText variant="caption" tone="danger" accessibilityRole="alert">
              {reanalyzeError}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {report.stats.length > 0 ? (
        <View style={styles.stats}>
          {report.stats.map((stat) => (
            <Card key={stat.label} style={styles.stat}>
              <AppText variant="caption" tone="secondary">
                {stat.label}
              </AppText>
              <AppText weight="black" style={styles.statValue}>
                {stat.value}
              </AppText>
            </Card>
          ))}
        </View>
      ) : null}

      {report.chart ? <HourlyChart chart={report.chart} /> : null}

      {report.evidence.length > 0 ? (
        <Card>
          <AppText variant="subtitle" weight="bold">
            판정 근거
          </AppText>
          {report.evidence.map((item) => (
            <View key={item.label} style={styles.evidenceRow}>
              <AppText variant="body" tone="body" style={styles.flex}>
                {item.label}
              </AppText>
              <AppText variant="body" weight="bold">
                {item.value}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}

      <AppText variant="micro" tone="secondary" style={styles.disclaimer}>
        {report.isExampleData ? '시연용 예시 데이터예요. ' : ''}공공데이터를 바탕으로 한 참고
        정보이며, 법적 판단이 아니에요.
      </AppText>

      <Button
        label="근처 주차장 보기"
        onPress={onFindParking}
        leading={<ParkingGlyph />}
        accessibilityLabel="근처 주차장 보기"
      />
    </View>
  );
}

export function ParkingGlyph() {
  return (
    <View style={styles.glyph}>
      <AppText variant="label" weight="black">
        P
      </AppText>
    </View>
  );
}

function HourlyChart({ chart }: { chart: ReportChart }) {
  const hours = ['0시', '6시', '12시', '18시', '24시'];
  return (
    <Card style={styles.chartCard}>
      <View style={styles.chartHead}>
        <AppText variant="subtitle" weight="bold" style={styles.flex}>
          {chart.title}
        </AppText>
        <AppText variant="micro" tone="secondary">
          {chart.caption}
        </AppText>
      </View>
      <View
        style={styles.bars}
        accessible
        accessibilityLabel={`시간대별 신고 그래프. ${chart.peakLabel}에 가장 많아요.`}
      >
        {chart.bars.map((value, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: `${Math.max(4, value * 100)}%`,
                backgroundColor: index === chart.peakIndex ? colors.warning : colors.line,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.axis} importantForAccessibility="no-hide-descendants">
        {hours.map((hour) => (
          <AppText key={hour} variant="micro" tone="secondary">
            {hour}
          </AppText>
        ))}
      </View>
      <AppText variant="label" tone="body">
        {chart.caption.split(' · ')[0]}{' '}
        <AppText variant="label" weight="bold" style={{ color: colors.warningText }}>
          {chart.peakLabel}
        </AppText>
        에 신고가 가장 많아요
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  header: { gap: spacing.sm + 2, paddingHorizontal: spacing.xs, paddingBottom: spacing.sm },
  flex: { flex: 1 },
  unavailable: { gap: spacing.xs, marginTop: spacing.xs },
  unavailableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  retry: { gap: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm + 2 },
  stat: { flex: 1, gap: spacing.xs },
  statValue: { fontSize: 28, lineHeight: 38, letterSpacing: -1 },
  chartCard: { gap: spacing.md + 2 },
  chartHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 110 },
  bar: { flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing.xs },
  evidenceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  disclaimer: { paddingHorizontal: spacing.xs },
  glyph: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: colors.parking,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
