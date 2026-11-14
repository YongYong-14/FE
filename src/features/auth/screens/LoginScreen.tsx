import { useRouter } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';

import { describeError, isApiError } from '@/services';

import { useSession } from '../state/SessionProvider';
import { AppText } from '@/shared/components/AppText';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { Button } from '@/shared/components/Button';
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
            leading={
              error ? undefined : (
                <Image
                  source={require('../../../../assets/auth/kakao-login-symbol.png')}
                  style={styles.kakaoSymbol}
                  resizeMode="contain"
                  accessible={false}
                  importantForAccessibility="no"
                />
              )
            }
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
        <BrandLogo />
        <View style={styles.texts}>
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
  hero: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.lg },
  texts: { alignItems: 'center', gap: spacing.md },
  center: { textAlign: 'center' },
  bottom: { gap: spacing.lg },
  kakaoSymbol: { width: 20, height: 20 },
  links: { paddingHorizontal: spacing.sm },
  link: { textDecorationLine: 'underline' },
});
