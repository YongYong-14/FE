import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

import { colors, iconSize } from '@/shared/theme/tokens';

import { iconMap, type IconName } from './iconMap';
export type { IconName } from './iconMap';

interface IconProps {
  name: IconName;
  size?: keyof typeof iconSize | number;
  color?: string;
  /** 의미 있는 단독 아이콘일 때만 지정한다. 없으면 보조 기술에서 숨긴다. */
  label?: string;
  /** Free Regular를 지원하는 아이콘도 선택 상태에서는 Solid로 표시한다. */
  filled?: boolean;
}

/** 앱 공통 아이콘은 Font Awesome Free Classic으로 통일한다. */
export function Icon({ name, size = 'md', color = colors.ink, label, filled = false }: IconProps) {
  const pixel = typeof size === 'number' ? size : iconSize[size];
  const definition = iconMap[name];
  const brand = 'brand' in definition && definition.brand;
  const regular = !filled && 'regular' in definition && definition.regular;
  return (
    <FontAwesome6
      name={definition.name}
      {...(brand ? { brand: true } : regular ? { regular: true } : { solid: true })}
      size={pixel}
      color={color}
      accessible={Boolean(label)}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}
