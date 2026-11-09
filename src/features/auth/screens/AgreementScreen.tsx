import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { describeError } from '@/services';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { Screen } from '@/shared/components/Screen';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { missingAgreementsOf, type AgreementType } from '@/shared/types/session';

import { useSession } from '../state/SessionProvider';

const documents: Record<AgreementType, { title: string; doc: string; description: string }> = {
  TERMS: { title: '이용약관', doc: 'terms', description: '서비스 이용 조건' },
  PRIVACY: {
    title: '개인정보 처리방침',
    doc: 'privacy',
    description: '카카오 계정 정보와 차량 블루투스 주소 처리',
  },
  LOCATION_SERVICE: {
    title: '위치기반서비스 이용약관',
    doc: 'location',
    description: '주차 위치 판정과 주변 주차장 찾기에 위치를 써요',
  },
};

function CheckRow({
  checked,
  title,
  description,
  onToggle,
  onOpen,
}: {
  checked: boolean;
  title: string;
  description?: string;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={`${title}${description ? `, ${description}` : ''}`}
        style={styles.check}
        hitSlop={6}
      >
        <Icon
          name={checked ? 'checkmark-circle' : 'ellipse-outline'}
          color={checked ? colors.primary : colors.line}
          size={26}
        />
        <View style={styles.flex}>
          <AppText variant="label" weight="bold">
            {title}
          </AppText>
          {description ? (
            <AppText variant="micro" tone="secondary">
              {description}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {onOpen ? (
        <Pressable
          onPress={onOpen}
          accessibilityRole="link"
          accessibilityLabel={`${title} 보기`}
          hitSlop={8}
        >
          <AppText variant="caption" weight="bold" tone="secondary" style={styles.link}>
            보기
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * 필수 약관 동의(로그인 직후 또는 서버가 위치 동의를 요구할 때).
 * 동의 기록은 서버(POST /me/agreements)에 남기고, 약관 원문 화면은 앱이 보여준다.
 */
export function AgreementScreen() {
  const router = useRouter();
  const { snapshot, agree, signOut, isSaving } = useSession();
  const missing = missingAgreementsOf(snapshot);
  const [checked, setChecked] = useState<AgreementType[]>([]);
  const { run, isRunning, error } = useAsyncAction((cause) =>
    describeError(cause, '동의를 저장하지 못했어요. 다시 시도해 주세요.'),
  );
  const allChecked = missing.length > 0 && missing.every((type) => checked.includes(type));
  const busy = isRunning || isSaving;

  function toggle(type: AgreementType) {
    setChecked((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );
  }

  return (
    <Screen
      background={colors.surface}
      contentStyle={styles.content}
      footer={
        <>
          {error ? <Notice title="동의를 저장하지 못했어요" description={error} /> : null}
          <Button
            label="동의하고 시작하기"
            disabled={!allChecked}
            loading={busy}
            onPress={() => void run(agree)}
          />
          <Button
            label="다른 계정으로 로그인"
            variant="ghost"
            size="md"
            disabled={busy}
            onPress={() => void run(signOut)}
          />
        </>
      }
    >
      <View style={styles.header}>
        <AppText variant="title" weight="black" accessibilityRole="header">
          서비스 이용을 위해{'\n'}약관에 동의해 주세요
        </AppText>
        <AppText variant="caption" tone="secondary">
          {missing.length === 1 && missing[0] === 'LOCATION_SERVICE'
            ? '주차 위치 판정과 주변 주차장 찾기에는 위치기반서비스 동의가 필요해요.'
            : '필수 약관에 모두 동의해야 이용할 수 있어요. 지도는 동의 없이도 볼 수 있어요.'}
        </AppText>
      </View>

      <View style={styles.card}>
        <CheckRow
          checked={allChecked}
          title="전체 동의"
          onToggle={() => setChecked(allChecked ? [] : [...missing])}
        />
        <View style={styles.divider} />
        {missing.map((type) => (
          <CheckRow
            key={type}
            checked={checked.includes(type)}
            title={`[필수] ${documents[type].title}`}
            description={documents[type].description}
            onToggle={() => toggle(type)}
            onOpen={() => router.push({ pathname: '/terms', params: { doc: documents[type].doc } })}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xxxl, gap: spacing.xl },
  header: { gap: spacing.sm },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  flex: { flex: 1, gap: 2 },
  link: { textDecorationLine: 'underline' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
