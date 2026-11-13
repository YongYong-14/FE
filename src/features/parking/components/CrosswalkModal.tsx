import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppModal } from '@/shared/components/AppModal';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { IconTile } from '@/shared/components/Surface';
import { colors, spacing } from '@/shared/theme/tokens';
import type { CrosswalkAnswer } from '@/shared/types/parking';

/**
 * 횡단보도 확인. 바깥 터치·뒤로 가기로 닫히지 않고, 응답 전에는 분석하지 않는다.
 * 위치 수정으로 돌아가는 버튼은 두지 않는다.
 */
export function CrosswalkModal({
  visible,
  address,
  onAnswer,
}: {
  visible: boolean;
  address: string;
  onAnswer: (answer: CrosswalkAnswer) => void;
}) {
  const [answered, setAnswered] = useState(false);

  function answer(value: CrosswalkAnswer) {
    if (answered) return;
    setAnswered(true);
    onAnswer(value);
  }

  return (
    <AppModal visible={visible} placement="bottom">
      <IconTile name="walk" background={colors.primaryTint} color={colors.primary} size={48} />
      <View style={styles.texts}>
        <AppText variant="heading" weight="bold">
          주차하신 곳이 횡단보도 위 또는 횡단보도에서 10m 이내인가요?
        </AppText>
        <AppText variant="caption" tone="secondary">
          {address}
        </AppText>
      </View>
      <View style={styles.actions}>
        <Button
          label="아니요"
          variant="neutral"
          onPress={() => answer('no')}
          disabled={answered}
          style={styles.flex}
        />
        <Button label="예" onPress={() => answer('yes')} disabled={answered} style={styles.flex} />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  texts: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.sm },
  flex: { flex: 1 },
});
