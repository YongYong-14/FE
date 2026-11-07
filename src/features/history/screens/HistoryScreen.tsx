import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatParkedAt, statusTone, useParking } from '@/features/parking';
import { AppText } from '@/shared/components/AppText';
import { Badge } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { StateView } from '@/shared/components/StateView';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import {
  analysisStatusLabel,
  type AnalysisStatus,
  type ParkingRecord,
} from '@/shared/types/parking';

type Filter = 'all' | AnalysisStatus;

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'level-1', label: '1단계' },
  { value: 'level-2', label: '2단계' },
  { value: 'no-risk-found', label: '확인된 위험 없음' },
  { value: 'insufficient-data', label: '정보 부족' },
  { value: 'failed', label: '분석 실패' },
];

function RecordCard({ record, onPress }: { record: ParkingRecord; onPress: () => void }) {
  const label = analysisStatusLabel[record.status];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatParkedAt(record.parkedAt)}, ${record.place.address}, ${label}`}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <AppText variant="micro" tone="secondary" style={styles.flex}>
          {formatParkedAt(record.parkedAt)}
        </AppText>
        <Badge label={label} tone={statusTone[record.status]} dot size="sm" />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.flex}>
          <AppText variant="body" weight="bold">
            {record.place.address}
          </AppText>
          <AppText variant="micro" tone="secondary">
            {record.report.headline}
          </AppText>
        </View>
        <Icon name="chevron-forward" color={colors.textSecondary} size="sm" />
      </View>
    </Pressable>
  );
}

/**
 * 기록 목록. 저장 당시 결과만 보여주며, 탭을 오가도 필터·스크롤 위치를 유지한다.
 * 재분석으로 상태가 바뀌면 현재 필터에 맞지 않는 기록은 목록에서 빠진다.
 */
export function HistoryScreen() {
  const router = useRouter();
  const { records, recordsError, refreshRecords, isRestoring } = useParking();
  const [filter, setFilter] = useState<Filter>('all');
  const visible = useMemo(
    () => (filter === 'all' ? records : records.filter((record) => record.status === filter)),
    [records, filter],
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} stickyHeaderIndices={[1]}>
        <AppText variant="title" weight="black" accessibilityRole="header" style={styles.title}>
          기록
        </AppText>
        <View style={styles.filterWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            accessibilityRole="radiogroup"
          >
            {filters.map((item) => {
              const selected = item.value === filter;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setFilter(item.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[styles.filter, selected && styles.filterSelected]}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    style={{ color: selected ? colors.inverse : colors.textBody }}
                  >
                    {item.label}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.list}>
          {isRestoring ? null : recordsError && records.length === 0 ? (
            <StateView
              tone="plain"
              icon="alert-circle-outline"
              title="기록을 불러오지 못했어요"
              description="저장된 기록은 지우지 않았어요. 다시 시도해 주세요."
              actions={
                <Button
                  label="다시 시도"
                  variant="outline"
                  size="md"
                  onPress={() => void refreshRecords()}
                />
              }
            />
          ) : records.length === 0 ? (
            <View style={styles.emptyCard}>
              <StateView
                tone="plain"
                icon="time-outline"
                title="아직 주차 기록이 없어요"
                description={'등록 차량 연결이 끊기면\n주차 기록이 자동으로 쌓여요.'}
              />
            </View>
          ) : visible.length === 0 ? (
            <View style={styles.emptyCard}>
              <StateView
                tone="plain"
                icon="filter-outline"
                title={`‘${filters.find((item) => item.value === filter)?.label}’ 기록이 없어요`}
                description="다른 조건을 골라 보세요."
                actions={
                  <Button
                    label="전체 보기"
                    variant="outline"
                    size="md"
                    onPress={() => setFilter('all')}
                  />
                }
              />
            </View>
          ) : (
            visible.map((record) => (
              <RecordCard
                key={record.id}
                record={record}
                onPress={() =>
                  router.push({ pathname: '/records/[recordId]', params: { recordId: record.id } })
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xxxl },
  title: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  filterWrap: { backgroundColor: colors.background, paddingVertical: spacing.md },
  filters: { gap: spacing.sm, paddingHorizontal: spacing.xl },
  filter: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  filterSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  list: { gap: spacing.sm + 2, paddingHorizontal: spacing.xl },
  card: {
    gap: 9,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emptyCard: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xxl,
  },
});
