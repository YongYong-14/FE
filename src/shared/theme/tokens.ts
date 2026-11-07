// Figma 디자인 토큰(197:4342)과 화면별 사용 색을 의미 단위로 정리한 값.
// 화면 코드에서는 hex 값을 직접 쓰지 않고 이 토큰을 사용한다.

export const palette = {
  ink: '#191919',
  primary: '#1f63e0',
  danger: '#e03131',
  warning: '#f76707',
  parking: '#ffd43b',
  mapLand: '#e9e4da',
  park: '#dcefd3',
  road: '#fff2c2',
  background: '#f5f5f5',
  surface: '#ffffff',
  line: '#d4d4d4',
} as const;

export const colors = {
  ...palette,
  // 텍스트 단계 — 흰 배경 대비 4.5:1 이상을 유지한다.
  textBody: '#555555',
  textSecondary: '#737373',
  muted: '#616161',
  inverse: '#ffffff',

  // 표면과 강조
  surfaceMuted: '#f5f5f5',
  track: '#ebebeb',
  primarySoft: '#e8efff',
  primaryTint: '#eaf1fe',
  dangerSoft: '#fff0f0',
  dangerText: '#c92a2a',
  warningSoft: '#fff1e6',
  warningText: '#c2410c',
  successSoft: '#e9f7ef',
  successText: '#1b7a43',
  neutralSoft: '#efefef',
  neutralText: '#4d4d4d',
  bluetooth: '#2b8ae2',
  sage: '#6f8a72',
  kakao: '#fee500',

  // 지도 일러스트
  mapBase: '#f3f0ea',
  mapBuilding: '#cfc8bc',
  mapLabel: '#8c8c8c',

  scrim: 'rgba(17, 17, 18, 0.48)',
  toast: '#191919',
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii = { xs: 8, sm: 12, md: 14, lg: 24, sheet: 18, pill: 999 } as const;

export const fonts = {
  regular: 'NotoSansKR_400Regular',
  bold: 'NotoSansKR_700Bold',
  black: 'NotoSansKR_900Black',
} as const;

/** Android 최소 터치 영역(48dp). */
export const touchTarget = 48;

export const iconSize = { sm: 16, md: 20, lg: 24 } as const;

export const shadows = {
  floating: '0px 4px 8px rgba(0, 0, 0, 0.10)',
  sheet: '0px -6px 12px rgba(0, 0, 0, 0.10)',
  pin: '0px 3px 4px rgba(0, 0, 0, 0.25)',
} as const;
