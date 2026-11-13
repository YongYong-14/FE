import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

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
      {/* Modal은 별도 네이티브 창이므로 이 창의 안전 영역을 다시 측정한다. */}
      <SafeAreaProvider>
        <ModalContent placement={placement} onDismiss={onDismiss}>
          {children}
        </ModalContent>
      </SafeAreaProvider>
    </Modal>
  );
}

function ModalContent({
  placement,
  onDismiss,
  children,
}: PropsWithChildren<Pick<AppModalProps, 'placement' | 'onDismiss'>>) {
  const insets = useSafeAreaInsets();
  const bottomSheet = placement === 'bottom';
  return (
    <View
      style={[
        styles.root,
        bottomSheet && styles.bottom,
        {
          paddingTop: insets.top + (bottomSheet ? spacing.sm : spacing.xl),
          paddingBottom: bottomSheet ? 0 : insets.bottom + spacing.xl,
          paddingLeft: bottomSheet ? 0 : insets.left + spacing.xl,
          paddingRight: bottomSheet ? 0 : insets.right + spacing.xl,
        },
      ]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        disabled={!onDismiss}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={[styles.card, bottomSheet && styles.bottomCard]} accessibilityViewIsModal>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            bottomSheet && {
              paddingBottom: spacing.xxl + insets.bottom,
              paddingLeft: spacing.xxl + insets.left,
              paddingRight: spacing.xxl + insets.right,
            },
          ]}
          bounces={false}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
  },
  bottom: { justifyContent: 'flex-end' },
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
