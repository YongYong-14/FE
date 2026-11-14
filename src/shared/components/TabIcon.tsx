import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

import { colors, iconSize, radii } from '@/shared/theme/tokens';

/**
 * 하단 탭 전용 아이콘. 기본은 테두리만 있는 모양, 선택되면 같은 모양을 채운다.
 * Font Awesome Free에는 집·주차 아이콘의 테두리형이 없어 탭에서만 이 아이콘 묶음을 쓴다.
 */
const tabGlyphs = {
  home: { outline: 'home-outline', filled: 'home' },
  map: { outline: 'map-outline', filled: 'map' },
  parking: { outline: 'alpha-p-box-outline', filled: 'alpha-p-box' },
  history: { outline: 'clock-outline', filled: 'clock' },
  mypage: { outline: 'account-outline', filled: 'account' },
} as const;

export type TabIconName = keyof typeof tabGlyphs;

/** 탭 아이콘 글꼴. 앱 시작 때 미리 불러 첫 화면에서 빈 칸이 보이지 않게 한다. */
export const tabIconFont = MaterialCommunityIcons.font;

export function TabIcon({ name, focused }: { name: TabIconName; focused: boolean }) {
  return (
    <View style={[styles.container, focused && styles.active]}>
      <MaterialCommunityIcons
        name={tabGlyphs[name][focused ? 'filled' : 'outline']}
        size={iconSize.lg}
        color={focused ? colors.primary : colors.textSecondary}
        importantForAccessibility="no-hide-descendants"
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
