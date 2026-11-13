import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/shared/theme/tokens';
import { AppText, type TextTone, type TextVariant } from './AppText';
import { Icon, type IconName } from './Icon';

export interface InfoItem {
  icon: IconName;
  text: string;
  accessibilityLabel?: string;
}

/** 구분 문자 대신 의미 있는 아이콘과 텍스트를 묶는다. 좁은 폭에서는 항목 단위로 줄바꿈한다. */
export function InfoRow({
  items,
  variant = 'caption',
  tone = 'secondary',
  style,
}: {
  items: InfoItem[];
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      {items.map((item, index) => (
        <View
          key={`${item.icon}-${index}`}
          style={styles.item}
          accessible
          accessibilityLabel={item.accessibilityLabel ?? item.text}
        >
          <Icon
            name={item.icon}
            size={variant === 'micro' ? 14 : 16}
            color={
              tone === 'primary'
                ? colors.primary
                : tone === 'danger'
                  ? colors.danger
                  : colors.textSecondary
            }
          />
          <AppText variant={variant} tone={tone} style={styles.text}>
            {item.text}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
    flexShrink: 1,
  },
  text: { flexShrink: 1 },
});
