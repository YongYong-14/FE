import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/shared/theme/tokens';

interface AppModalProps {
  visible: boolean;
  /** 지정하지 않으면 바깥 터치·Android 뒤로 가기로 닫히지 않는다. */
  onDismiss?: () => void;
  /** Android 뒤로 가기만 따로 처리할 때(바깥 터치로는 닫지 않음). */
  onBackPress?: () => void;
  placement?: 'center' | 'bottom';
}

/** 공통 모달 틀. 내용에 맞춰 높이를 정하고, 넘치면 스크롤한다. */
export function AppModal({
  visible,
  onDismiss,
  onBackPress,
  placement = 'center',
  children,
}: PropsWithChildren<AppModalProps>) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => (onBackPress ?? onDismiss)?.()}
    >
      <View style={[styles.root, placement === 'bottom' && styles.bottom]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          disabled={!onDismiss}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View
          style={[styles.card, placement === 'bottom' && styles.bottomCard]}
          accessibilityViewIsModal
        >
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  bottom: { justifyContent: 'flex-end', padding: 0 },
  card: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  bottomCard: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  content: { padding: spacing.xxl, gap: spacing.lg },
});
