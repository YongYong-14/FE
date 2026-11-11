import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth';
import { isNativeDeviceMode, nativeBluetooth } from './bluetooth';
import { locationPermission } from './location';

/** OS 이벤트는 Android 저장소에 보관하며, 앱 복귀 후 최신 이벤트만 소비한다. */
export function useVehicleBluetooth({
  ready,
  onDisconnect,
  onReconnect,
}: {
  ready: boolean;
  onDisconnect: (at: string, lastConnectedAt?: number) => Promise<void>;
  onReconnect: (at: string, stateOnly?: boolean) => Promise<void>;
}) {
  const { snapshot, isLoading, loadError, updateDevice } = useSession();
  const current = useRef(snapshot);
  const handlers = useRef({ onDisconnect, onReconnect });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    current.current = snapshot;
    handlers.current = { onDisconnect, onReconnect };
  });
  const userId = snapshot.user?.id;
  const vehicleId = snapshot.vehicle?.id;
  const address = snapshot.vehicle?.bluetoothAddress?.toUpperCase();
  const enabled = Boolean(userId && vehicleId && address && snapshot.onboardingCompleted);

  useEffect(() => {
    if (!isNativeDeviceMode || isLoading || loadError || !ready) return;
    let active = true;
    let queue = Promise.resolve();
    let subscription: { remove(): void } | undefined;
    const sync = () => {
      queue = queue
        .then(async () => {
          if (!active || AppState.currentState !== 'active') return;
          const [bluetoothPermission, location] = await Promise.all([
            nativeBluetooth.permission(),
            locationPermission(),
          ]);
          if (!active) return;
          const status =
            bluetoothPermission === 'granted'
              ? await nativeBluetooth.refresh()
              : await nativeBluetooth.snapshot();
          if (!active) return;
          const patch = {
            bluetoothPermission,
            locationPermission: location,
            bluetoothEnabled: status.enabled,
            vehicleConnected: status.connected === true,
            vehicleConnectionKnown: status.connected !== null,
          };
          const before = current.current.device;
          if (
            Object.entries(patch).some(
              ([key, value]) => before[key as keyof typeof patch] !== value,
            )
          )
            await updateDevice(patch);
          if (!active) return;
          const event = status.event;
          if (enabled && bluetoothPermission === 'granted' && event && event.address === address) {
            const at = new Date(event.at).toISOString();
            if (event.connected) await handlers.current.onReconnect(at);
            else await handlers.current.onDisconnect(at, event.lastConnectedAt);
            if (active) await nativeBluetooth.acknowledge(event.id);
          } else if (enabled && status.connected === true) {
            // 이미 연결된 기기를 등록하거나 앱을 다시 켠 경우에도 이전 진행을 정리한다.
            await handlers.current.onReconnect(new Date().toISOString(), true);
          }
          if (active) setError(null);
        })
        .catch((cause: unknown) => {
          if (active)
            setError(
              cause instanceof Error ? cause.message : '블루투스 연결 상태를 확인하지 못했어요.',
            );
        });
    };
    void nativeBluetooth
      .track(enabled ? address! : null, enabled ? `${userId}:${vehicleId}` : null)
      .then(() => {
        if (!active) return;
        subscription = nativeBluetooth.subscribe(sync);
        sync();
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '앱을 다시 빌드해 주세요.');
      });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    const interval = setInterval(sync, 3000);
    return () => {
      active = false;
      subscription?.remove();
      appState.remove();
      clearInterval(interval);
    };
  }, [address, enabled, isLoading, loadError, ready, updateDevice, userId, vehicleId]);
  return error;
}
