import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ParkingLotSort } from '../utils/sortParkingLots';
import { AppText } from '@/shared/components/AppText';
import { Icon } from '@/shared/components/Icon';
import { colors, radii, shadows, spacing, touchTarget } from '@/shared/theme/tokens';

const options: { value: ParkingLotSort; label: string }[] = [
  { value: 'distance', label: '가까운 순' },
  { value: 'free-first', label: '무료 우선' },
];

interface Anchor {
  right: number;
  bottom: number;
}

export function ParkingLotSortDropdown({
  value,
  onChange,
}: {
  value: ParkingLotSort;
  onChange: (value: ParkingLotSort) => void;
}) {
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const label = options.find((option) => option.value === value)?.label ?? '가까운 순';
  const menuWidth = Math.min(
    width - insets.left - insets.right - spacing.xl * 2,
    Math.max(160, 160 * fontScale),
  );
  const rowHeight = Math.max(touchTarget, 20 * fontScale + spacing.lg * 2);
  const menuHeight = options.length * rowHeight + spacing.xs * 2;
  const left = Math.max(
    insets.left + spacing.xl,
    Math.min((anchor?.right ?? width) - menuWidth, width - insets.right - menuWidth - spacing.xl),
  );
  const top = Math.max(
    insets.top + spacing.sm,
    Math.min(anchor?.bottom ?? 0, height - insets.bottom - menuHeight - spacing.sm),
  );
  const close = () => setAnchor(null);

  return (
    <>
      <Pressable
        ref={trigger}
        onPress={() => {
          trigger.current?.measureInWindow((x, y, w, h) => {
            setAnchor({ right: x + w, bottom: y + h + spacing.xs });
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={`주차장 정렬, ${label}`}
        accessibilityHint="정렬 기준을 선택해요"
        accessibilityState={{ expanded: anchor !== null }}
        style={styles.trigger}
      >
        <AppText variant="caption" tone="secondary">
          {label}
        </AppText>
        <Icon
          name={anchor ? 'chevron-up' : 'chevron-down'}
          size="sm"
          color={colors.textSecondary}
        />
      </Pressable>

      <Modal
        visible={anchor !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={close}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessible={false}
            importantForAccessibility="no"
          />
          <View
            style={[styles.menu, { top, left, width: menuWidth }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="주차장 정렬 기준"
            accessibilityViewIsModal
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    close();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[styles.option, { minHeight: rowHeight }, selected && styles.selected]}
                >
                  <AppText
                    variant="caption"
                    weight={selected ? 'bold' : 'regular'}
                    tone={selected ? 'primary' : 'default'}
                    style={styles.label}
                  >
                    {option.label}
                  </AppText>
                  {selected ? <Icon name="checkmark" size="md" color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: touchTarget,
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    flexShrink: 0,
  },
  overlay: { flex: 1 },
  menu: {
    position: 'absolute',
    padding: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    boxShadow: shadows.floating,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: radii.xs,
  },
  selected: { backgroundColor: colors.primarySoft },
  label: { flex: 1 },
});
