import { StyleSheet, View } from 'react-native';

import { BRAND_BACKGROUND, BrandLogo } from './BrandLogo';

/** 네이티브 스플래시 뒤의 글꼴·저장 정보 로딩도 같은 로고로 이어 준다. */
export function BrandSplash() {
  return (
    <View style={styles.screen}>
      <BrandLogo width={240} style={styles.logo} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { maxWidth: '70%' },
});
