import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { useSession } from '@/features/auth';
import { vehicleService } from '@/services';
import { AppText } from '@/shared/components/AppText';
import { Button } from '@/shared/components/Button';
import { Screen } from '@/shared/components/Screen';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import type { RegisteredVehicle } from '@/shared/types/session';

export function VehicleRegistrationScreen({ onComplete }: { onComplete?: () => void }) {
  const { snapshot, registerVehicle, isSaving } = useSession();
  const [vehicles, setVehicles] = useState<RegisteredVehicle[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { run, isRunning, error } = useAsyncAction();

  async function load() {
    setIsLoading(true);
    setLoadError(false);
    try {
      setVehicles(await vehicleService.listVehicles());
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void vehicleService
      .listVehicles()
      .then((items) => {
        if (active) setVehicles(items);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Screen>
      <AppText variant="title" weight="black">
        {snapshot.vehicle ? '차량 변경' : '차량을 등록해 주세요'}
      </AppText>
      <AppText>내 차량으로 사용할 데모 기기 하나를 선택해 주세요.</AppText>
      {isLoading && <ActivityIndicator color={colors.primary} />}
      {vehicles.map((vehicle) => (
        <Pressable
          key={vehicle.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === vehicle.id }}
          disabled={isSaving}
          onPress={() => setSelected(vehicle.id)}
          style={[styles.row, selected === vehicle.id && styles.selected]}
        >
          <AppText weight="bold">{vehicle.name}</AppText>
        </Pressable>
      ))}
      {!isLoading && vehicles.length === 0 && <AppText>등록할 기기가 없어요.</AppText>}
      {loadError && <Button secondary label="다시 찾기" onPress={() => void load()} />}
      <Button
        label={snapshot.vehicle ? '변경하기' : '등록하고 시작하기'}
        disabled={!selected || isLoading}
        loading={isRunning || isSaving}
        onPress={() =>
          void run(async () => {
            const vehicle = vehicles.find((item) => item.id === selected);
            if (!vehicle) return;
            await registerVehicle(vehicle);
            onComplete?.();
          })
        }
      />
      {error && <AppText accessibilityRole="alert">{error}</AppText>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selected: { borderColor: colors.primary, borderWidth: 2 },
});
