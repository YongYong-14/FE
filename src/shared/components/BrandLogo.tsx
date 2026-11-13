import { Image, StyleSheet, type StyleProp, type ImageStyle } from 'react-native';

export const BRAND_BACKGROUND = '#F9F7F2';

export function BrandLogo({
  width = 220,
  style,
}: {
  width?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={require('../../../assets/branding/logo.png')}
      resizeMode="contain"
      accessibilityLabel="세울까말까, 용인시 주차 정보"
      accessible
      style={[styles.logo, { width, height: (width * 980) / 886 }, style]}
    />
  );
}

const styles = StyleSheet.create({ logo: { maxWidth: '80%' } });
