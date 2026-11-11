import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { isNativeDeviceMode, locationService, mapService } from '@/services';
import { currentDeviceCoordinate } from '@/services/device/location';
import type { Coordinate } from '@/shared/types/location';

/** 화면 진입·현재 위치 버튼에서 실제 GPS를 조회한다. 실패한 좌표를 데모로 대체하지 않는다. */
export function useDeviceLocation(enabled = true) {
  const [coordinate, setCoordinate] = useState<Coordinate | null>(() =>
    isNativeDeviceMode ? currentDeviceCoordinate() : mapService.currentLocation(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!isNativeDeviceMode) return mapService.currentLocation();
    const request = ++sequence.current;
    setLoading(true);
    try {
      const result = await locationService.locate(signal);
      if (signal?.aborted || request !== sequence.current) return null;
      if (result.kind === 'located') {
        setCoordinate(result.place.coordinate);
        setError(null);
        return result.place.coordinate;
      }
      setCoordinate(null);
      setError(result.reason);
    } catch {
      if (!signal?.aborted && request === sequence.current) {
        setCoordinate(null);
        setError('현재 위치를 받지 못했어요. 위치 권한과 GPS를 확인해 주세요.');
      }
    } finally {
      if (!signal?.aborted && request === sequence.current) setLoading(false);
    }
    return null;
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const controller = new AbortController();
      void refresh(controller.signal);
      return () => controller.abort();
    }, [enabled, refresh]),
  );
  return { coordinate, loading, error, refresh };
}
