import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { IconButton } from '@/shared/components/IconButton';
import { Screen } from '@/shared/components/Screen';
import { StateView } from '@/shared/components/StateView';
import { colors, spacing } from '@/shared/theme/tokens';

/** 로그인 전 약관·개인정보 안내. 원문이 준비되기 전에는 본문을 임의로 쓰지 않는다. */
export function TermsScreen() {
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const title = doc === 'privacy' ? '개인정보 처리방침' : '이용약관';

  return (
    <Screen background={colors.surface} contentStyle={styles.content}>
      <View style={styles.nav}>
        <IconButton name="chevron-back" label="뒤로 가기" onPress={() => router.back()} />
        <AppText variant="subtitle" weight="bold" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      <StateView
        icon="document-text-outline"
        title="내용 준비 중"
        description="원문이 확정되면 이곳에 안내해요."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: -spacing.md },
});
