import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/shared/theme/tokens';
import { Icon, type IconName } from './Icon';

/** 활성 탭은 채운 아이콘과 파란 배경으로 강조한다. */
export function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.container, focused && styles.active]}>
      <Icon
        name={name}
        filled={focused}
        size={22}
        color={focused ? colors.primary : colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 52,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  active: { backgroundColor: colors.primarySoft },
});
