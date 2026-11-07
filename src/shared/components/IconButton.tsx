import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, shadows, touchTarget } from '@/shared/theme/tokens';

interface IconButtonProps {
  name: IconName;
  label: string;
  onPress: () => void;
  /** 지도 위에 떠 있는 둥근 버튼. */
  floating?: boolean;
}

/** 아이콘만 있는 버튼. 접근성 이름을 반드시 받는다. */
export function IconButton({ name, label, onPress, floating }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
      style={({ pressed }) => [
        styles.base,
        floating && styles.floating,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Icon name={name} size={22} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floating: { backgroundColor: colors.surface, boxShadow: shadows.floating },
});
