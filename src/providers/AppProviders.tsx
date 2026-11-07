import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/features/auth';
import { ParkingProvider } from '@/features/parking';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        {/* 진행 중 주차 상태는 탭·화면 이동과 무관하게 하나만 유지한다. */}
        <ParkingProvider>{children}</ParkingProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
