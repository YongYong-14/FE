import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { colors, iconSize } from '@/shared/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface IconProps {
  name: IconName;
  size?: keyof typeof iconSize | number;
  color?: string;
  /** 의미 있는 단독 아이콘일 때만 지정한다. 없으면 보조 기술에서 숨긴다. */
  label?: string;
}

/** 앱 전체에서 한 가지 아이콘 계열(Ionicons outline)만 사용한다. */
export function Icon({ name, size = 'md', color = colors.ink, label }: IconProps) {
  const pixel = typeof size === 'number' ? size : iconSize[size];
  return (
    <Ionicons
      name={name}
      size={pixel}
      color={color}
      accessible={Boolean(label)}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}
