import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { InfoRow } from '@/shared/components/InfoRow';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import type { ParkingLot, ParkingLotType } from '@/shared/types/map';
import { hoursLabel } from '@/shared/utils/hours';
import { parkingFeeDetails, parkingFeeSummary } from '../utils/parkingLotDetails';

const typeLabel: Record<ParkingLotType, string> = {
  public: '공영',
  private: '민영',
  attached: '부설',
  unknown: '구분 정보 없음',
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="caption" tone="secondary" style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText variant="caption" weight="bold" style={styles.detailValue}>
        {value}
      </AppText>
    </View>
  );
}

/** 요약을 누를 때만 상세를 펼친다. 공유·길안내는 별도 버튼으로 동작한다. */
export function ParkingLotCard({
  lot,
  selected,
  expanded,
  last,
  onToggle,
  onShare,
  onRoute,
}: {
  lot: ParkingLot;
  selected: boolean;
  expanded: boolean;
  last: boolean;
  onToggle: () => void;
  onShare: () => void;
  onRoute: () => void;
}) {
  const feeSummary = parkingFeeSummary(lot);
  const fees = expanded ? parkingFeeDetails(lot) : [];
  const summary = `${typeLabel[lot.type]}, ${Math.round(lot.distanceMeters)}m, 요금정보: ${feeSummary}`;
  return (
    <View style={[styles.card, !last && styles.divider]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ selected, expanded }}
        aria-expanded={expanded}
        accessibilityLabel={`${lot.name}, ${summary}, ${expanded ? '상세 접기' : '상세 보기'}`}
        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
        style={styles.summary}
      >
        <View style={[styles.lotIcon, selected && styles.lotSelected]}>
          <Icon name="parking" size={22} color={colors.ink} filled />
        </View>
        <View style={styles.summaryTexts}>
          <AppText variant="body" weight="bold" numberOfLines={2}>
            {lot.name}
          </AppText>
          <InfoRow
            tone="body"
            items={[
              { icon: 'business-outline', text: typeLabel[lot.type] },
              {
                icon: 'navigate-outline',
                text: `${Math.round(lot.distanceMeters)}m`,
                accessibilityLabel: `직선 거리 ${Math.round(lot.distanceMeters)}m`,
              },
              {
                icon: 'card-outline',
                text: feeSummary,
                accessibilityLabel: `요금 정보 ${feeSummary}`,
              },
            ]}
          />
        </View>
        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size="md"
          color={colors.textSecondary}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.details}>
          <View style={styles.panel}>
            <AppText variant="label" weight="bold">
              요금 안내
            </AppText>
            {fees.length > 0 ? (
              fees.map((row, index) => <DetailRow key={`${row.label}-${index}`} {...row} />)
            ) : (
              <AppText variant="caption" tone="secondary">
                {lot.feeType === 'FREE' ? '무료 주차장이에요.' : '상세 요금 정보가 없어요.'}
              </AppText>
            )}
          </View>
          <View style={styles.panel}>
            <AppText variant="label" weight="bold">
              이용 정보
            </AppText>
            <DetailRow label="운영시간" value={hoursLabel(lot.hours)} />
            <DetailRow
              label="운영 상태"
              value={lot.isOpen === null ? '정보 없음' : lot.isOpen ? '운영 중' : '운영 종료'}
            />
            <DetailRow
              label="주차 면수"
              value={lot.capacity === null ? '정보 없음' : `${lot.capacity}면`}
            />
            <DetailRow label="주소" value={lot.address || '주소 정보 없음'} />
          </View>
          <View style={styles.actions}>
            <Button
              label="공유"
              variant="outline"
              size="md"
              onPress={onShare}
              accessibilityLabel={`${lot.name} 공유`}
              leading={<Icon name="share-outline" size="md" />}
              style={styles.action}
            />
            <Button
              label="길안내"
              size="md"
              onPress={onRoute}
              accessibilityLabel={`${lot.name} 길안내`}
              style={styles.action}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.xs },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 88,
    paddingVertical: spacing.md,
  },
  lotIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.parkingSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotSelected: { backgroundColor: colors.parking },
  summaryTexts: { flex: 1, minWidth: 0, gap: spacing.xs },
  details: { gap: spacing.md, paddingBottom: spacing.lg },
  panel: {
    padding: spacing.lg,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.md,
  },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  detailLabel: { width: 92 },
  detailValue: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
