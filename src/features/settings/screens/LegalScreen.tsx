import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { Screen } from '@/shared/components/Screen';
import { colors, radii, spacing } from '@/shared/theme/tokens';

const documents = [
  { doc: 'terms', title: '이용약관' },
  { doc: 'privacy', title: '개인정보 처리방침' },
  { doc: 'location', title: '위치기반서비스 이용약관' },
] as const;

/** 약관·정책 목록. 원문이 없으면 각 문서에서 "내용 준비 중"을 보여준다. */
export function LegalScreen() {
  const router = useRouter();
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.card}>
        {documents.map((item, index) => (
          <Pressable
            key={item.doc}
            onPress={() => router.push({ pathname: '/terms', params: { doc: item.doc } })}
            accessibilityRole="button"
            android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
            style={[styles.row, index < documents.length - 1 && styles.divider]}
          >
            <AppText variant="label" weight="bold" style={styles.flex}>
              {item.title}
            </AppText>
            <Icon name="chevron-forward" size="sm" color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.md, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: spacing.lg },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  flex: { flex: 1 },
});
