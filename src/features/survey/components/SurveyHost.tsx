import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth';
import { formatParkedAt, statusTone, useParking } from '@/features/parking';
import { AppModal } from '@/shared/components/AppModal';
import { AppText } from '@/shared/components/AppText';
import { Badge } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import type { ParkingRecord } from '@/shared/types/parking';
import { loadSurveyStore, saveSurveyEntry, type SurveyAnswer } from '@/storage/surveys';

const answers: { value: SurveyAnswer; label: string }[] = [
  { value: 'enforced', label: '단속됨' },
  { value: 'not-enforced', label: '단속 안 됨' },
  { value: 'not-sure', label: '아직 확인하지 못함' },
];

function isRisk(record: ParkingRecord) {
  return record.status === 'level-1' || record.status === 'level-2';
}

/**
 * 재탑승 사후 설문.
 * 대상: 위험 리포트를 확인한 이전 주차 · 등록 차량 재연결 · 앱 이용 중 · 설문 설정 ON.
 * 응답·건너뛰기는 주차별로 보관해 같은 주차에 다시 묻지 않는다.
 * 위치 확인·분석이 진행 중이면 끝날 때까지 기다린다.
 */
export function SurveyHost() {
  const { snapshot } = useSession();
  const { reconnectEvent, records, progress } = useParking();
  const [target, setTarget] = useState<ParkingRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const { clearReconnectEvent } = useParking();

  // 재연결 이벤트는 한 번만 평가하고 비운다(재로그인으로 화면이 다시 붙어도 다시 묻지 않음).
  useEffect(() => {
    if (!reconnectEvent) return;
    if (!snapshot.surveyEnabled) {
      clearReconnectEvent();
      return;
    }
    let active = true;
    void loadSurveyStore()
      .then((store) => {
        if (!active) return;
        const candidate = records.find(
          (record) =>
            isRisk(record) &&
            store.viewedReports.includes(record.id) &&
            !store.entries[record.id] &&
            Date.parse(record.parkedAt) < Date.parse(reconnectEvent.at),
        );
        if (candidate) setTarget(candidate);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) clearReconnectEvent();
      });
    return () => {
      active = false;
    };
  }, [reconnectEvent, records, snapshot.surveyEnabled, clearReconnectEvent]);

  async function finish(entry: { answer?: SurveyAnswer; skipped?: boolean }) {
    if (!target || saving) return;
    setSaving(true);
    setError(false);
    try {
      await saveSurveyEntry(target.id, entry);
      setTarget(null);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const visible = Boolean(target && !progress && snapshot.surveyEnabled);

  return (
    <AppModal
      visible={visible}
      placement="bottom"
      onBackPress={() => void finish({ skipped: true })}
    >
      {target ? (
        <>
          <View style={styles.texts}>
            <AppText variant="caption" weight="bold" tone="primary">
              다시 타셨네요
            </AppText>
            <AppText variant="heading" weight="bold">
              이전 주차 위치에서 불법주정차 단속을 받으셨나요?
            </AppText>
          </View>
          <View style={styles.record}>
            <Badge label={target.report.badge} tone={statusTone[target.status]} dot size="sm" />
            <AppText variant="label" weight="bold">
              {target.place.address}
            </AppText>
            <AppText variant="micro" tone="secondary">
              {formatParkedAt(target.parkedAt)} 주차
            </AppText>
          </View>
          <View style={styles.answers}>
            {answers.map((item) => (
              <Button
                key={item.value}
                label={item.label}
                variant="outline"
                size="md"
                disabled={saving}
                onPress={() => void finish({ answer: item.value })}
              />
            ))}
          </View>
          {error ? (
            <AppText variant="caption" tone="danger" accessibilityRole="alert">
              응답을 저장하지 못했어요. 다시 시도해 주세요.
            </AppText>
          ) : null}
          <Button
            label="이번엔 건너뛸게요"
            variant="ghost"
            size="md"
            disabled={saving}
            onPress={() => void finish({ skipped: true })}
          />
          <AppText variant="micro" tone="secondary" style={styles.center}>
            응답은 이 기기에 보관돼요. 마이페이지에서 설문을 끌 수 있어요.
          </AppText>
        </>
      ) : null}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  texts: { gap: spacing.xs },
  record: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  answers: { gap: spacing.sm },
  center: { textAlign: 'center' },
});
