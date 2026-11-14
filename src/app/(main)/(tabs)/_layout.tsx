import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/shared/components/AppText';
import { TabIcon, type TabIconName } from '@/shared/components/TabIcon';
import { colors } from '@/shared/theme/tokens';

const tabs: { name: string; title: string; icon: TabIconName }[] = [
  { name: 'home', title: '홈', icon: 'home' },
  { name: 'map', title: '지도', icon: 'map' },
  { name: 'parking-lots', title: '주변 주차장', icon: 'parking' },
  { name: 'history', title: '기록', icon: 'history' },
  { name: 'mypage', title: '마이페이지', icon: 'mypage' },
];

export default function TabLayout() {
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // 탭 전환은 살짝 밀리며 겹쳐 바뀐다. 보이지 않는 탭은 다시 그리지 않아 전환이 가벼워진다.
        animation: 'shift',
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          height: Math.round(70 * Math.max(1, fontScale)) + insets.bottom,
          paddingTop: 8,
          // 탭 화면은 하단 여백을 더하지 않고 GNB가 한 번만 처리한다.
          paddingBottom: insets.bottom,
        },
      }}
    >
      {tabs.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ focused }) => <TabIcon name={icon} focused={focused} />,
            tabBarLabel: ({ focused, color }) => (
              <AppText
                variant="micro"
                weight={focused ? 'bold' : 'regular'}
                style={{ fontSize: 11, color, textAlign: 'center' }}
              >
                {title}
              </AppText>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
