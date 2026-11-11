import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { describeError, isApiError, isApiMode } from '@/services';

import { useSession } from '../state/SessionProvider';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { Screen } from '@/shared/components/Screen';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors, spacing } from '@/shared/theme/tokens';

export function LoginScreen() {
  const router = useRouter();
  const { signIn, isSaving, sessionNotice, clearSessionNotice } = useSession();
  const { run, isRunning, error } = useAsyncAction((cause) =>
    describeError(cause, '네트워크 상태를 확인하고 다시 시도해 주세요.'),
  );
  const busy = isRunning || isSaving;

  return (
    <Screen
      background={colors.surface}
      spread
      contentStyle={styles.content}
      footer={
        <View style={styles.bottom}>
          {error ? (
            <Notice title="카카오 로그인에 실패했어요" description={error} />
          ) : sessionNotice ? (
            <Notice tone="info" title={sessionNotice} />
          ) : null}
          <Button
            label={error ? '다시 시도하기' : '카카오로 시작하기'}
            variant={error ? 'primary' : 'kakao'}
            leading={error ? undefined : <Icon name="chatbubble" color={colors.ink} size={18} />}
            onPress={() => {
              clearSessionNotice();
              void run(async () => {
                try {
                  await signIn();
                } catch (cause) {
                  if (!isApiError(cause, 'KAKAO_LOGIN_CANCELLED')) throw cause;
                }
              });
            }}
            loading={busy}
          />
          <AppText variant="micro" tone="secondary" style={styles.center}>
            {isApiMode
              ? '카카오 계정으로 로그인하고 서버에 연결해요.'
              : '데모 계정으로 시작해요. 실제 카카오 인증은 연결되지 않았어요.'}
          </AppText>
          <View style={styles.links}>
            <AppText variant="micro" tone="secondary" style={styles.center}>
              시작하면{' '}
              <AppText
                variant="micro"
                weight="bold"
                tone="body"
                style={styles.link}
                accessibilityRole="link"
                onPress={() => router.push('/terms')}
              >
                이용약관
              </AppText>
              {' 및 '}
              <AppText
                variant="micro"
                weight="bold"
                tone="body"
                style={styles.link}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/terms', params: { doc: 'privacy' } })}
              >
                개인정보 처리방침
              </AppText>
              에 동의하게 돼요.
            </AppText>
          </View>
        </View>
      }
    >
      <View style={styles.hero}>
        <View
          style={styles.logo}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon name="location-outline" color={colors.inverse} size={42} />
        </View>
        <View style={styles.texts}>
          <AppText
            variant="display"
            weight="black"
            style={styles.center}
            accessibilityRole="header"
          >
            세울까말까
          </AppText>
          <AppText variant="body" tone="secondary" style={styles.center}>
            차를 세운 자리가 주정차 위험 구역인지{'\n'}바로 확인해 드려요
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center' },
  hero: { alignItems: 'center', gap: spacing.xl, paddingTop: spacing.xxxl },
  logo: {
    width: 92,
    height: 92,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { alignItems: 'center', gap: spacing.sm + 2 },
  center: { textAlign: 'center' },
  bottom: { gap: spacing.md + 2 },
  links: { paddingHorizontal: spacing.sm },
  link: { textDecorationLine: 'underline' },
});
