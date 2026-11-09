import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { colors, fonts } from '@/shared/theme/tokens';

const tabs: { name: string; title: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { name: 'home', title: '홈', icon: 'home-outline' },
  { name: 'map', title: '지도', icon: 'map-outline' },
  { name: 'parking-lots', title: '주변 주차장', icon: 'car-outline' },
  { name: 'history', title: '기록', icon: 'time-outline' },
  { name: 'mypage', title: '마이페이지', icon: 'person-outline' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 10 },
      }}
    >
      {tabs.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name={icon}
                color={typeof color === 'string' ? color : colors.muted}
                size={size}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
