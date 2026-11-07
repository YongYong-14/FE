import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { colors, spacing } from '@/shared/theme/tokens';

import { LOCATION_TIMER_MS, type LocationTimer } from '../types';
import { remainingMs } from '../utils/timer';

/** 숫자·게이지는 상위 타이머 상태(deadline)에서 계산한다. 만료 판단은 하지 않는다. */
export function TimerGauge({ timer, onExtend }: { timer: LocationTimer; onExtend: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.mode !== 'running') return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [timer]);

  const left = remainingMs(timer, now);
  const seconds = Math.ceil(left / 1000);
  const ratio = left / LOCATION_TIMER_MS;
  const paused = timer.mode === 'paused';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <AppText variant="caption" tone="secondary" style={styles.flex}>
          {paused ? '조작 중에는 시간이 멈춰요' : '응답이 없으면 이 위치로 확정해요'}
        </AppText>
        <AppText
          variant="caption"
          weight="bold"
          tone="primary"
          accessibilityLabel={`남은 시간 ${seconds}초`}
          accessibilityLiveRegion="none"
        >
          {seconds}초
        </AppText>
        <Button
          label="시간 연장"
          variant="neutral"
          size="sm"
          onPress={onExtend}
          accessibilityHint="남은 시간을 15초로 되돌려요"
        />
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 15, now: seconds }}
      >
        <View style={[styles.fill, { width: `${Math.round(ratio * 1000) / 10}%` }]} />
      </View>
    </View>
  );
}

/** GPS 실패로 수동 지정할 때의 표시. 타이머는 꺼져 있다. */
export function ManualConfirmHint() {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <AppText variant="caption" tone="secondary" style={styles.flex}>
          직접 고른 위치로 판정해요
        </AppText>
        <AppText variant="caption" weight="bold" tone="primary">
          자동 확정 꺼짐
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.parking },
});
