import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { useParking } from '../state/ParkingProvider';

/**
 * 앱 안 어느 화면에서든 터치·드래그 중에는 위치 선택 타이머를 멈추고,
 * 모든 손가락을 떼면 남은 시간부터 재개한다(02 §2·§4).
 * 터치 이벤트는 자식에서 위로 전달되므로 버튼·스크롤 동작을 막지 않는다.
 */
export function ParkingTouchGuard({ children }: PropsWithChildren) {
  const { notifyTouch } = useParking();

  function end(event: GestureResponderEvent) {
    if (event.nativeEvent.touches.length === 0) notifyTouch(false);
  }

  return (
    <View
      style={styles.fill}
      onTouchStart={() => notifyTouch(true)}
      onTouchEnd={end}
      onTouchCancel={() => notifyTouch(false)}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
