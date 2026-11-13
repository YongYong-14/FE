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
  // 텍스트는 ink·textBody·textSecondary 세 단계만 쓴다. 흰 배경·회색 배경 모두 4.5:1 이상.
  textBody: '#555555',
  // 회색 배경(#f5f5f5) 위에서도 4.5:1을 넘도록 한 단계 어둡게 둔다.
  textSecondary: '#6b6b6b',
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
  parkingSoft: '#fff6d1',
  parkingLine: '#e0b000',
  bluetooth: '#2b8ae2',
  sage: '#6f8a72',
  kakao: '#fee500',

  // 지도 일러스트
  mapBase: '#f3f0ea',
  mapLevelOne: '#737373',
  mapBuilding: '#cfc8bc',
  mapLabel: '#8c8c8c',
  /** 서비스 지역(용인시) 밖을 덮는 반투명 회색. #RRGGBBAA */
  mapOutside: '#8c8c8c80',

  scrim: 'rgba(17, 17, 18, 0.48)',
  toast: '#191919',
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii = { xs: 8, sm: 12, md: 14, lg: 24, sheet: 18, pill: 999 } as const;

export const fonts = {
  regular: 'Pretendard-Regular',
  bold: 'Pretendard-Bold',
  black: 'Pretendard-Black',
} as const;

/** 자간 -2%와 150~170% 범위의 줄간격을 글자 크기에 맞게 계산한다. */
export function textMetrics(fontSize: number, lineHeightRatio = 1.6) {
  return {
    fontSize,
    letterSpacing: Number((-0.02 * fontSize).toFixed(3)),
    lineHeight: Number((fontSize * lineHeightRatio).toFixed(3)),
  };
}

/** Android 최소 터치 영역(48dp). */
export const touchTarget = 48;

export const iconSize = { sm: 16, md: 20, lg: 24 } as const;

export const shadows = {
  raised: '0px 1px 3px rgba(0, 0, 0, 0.12)',
  floating: '0px 4px 8px rgba(0, 0, 0, 0.10)',
  sheet: '0px -6px 12px rgba(0, 0, 0, 0.10)',
  pin: '0px 3px 4px rgba(0, 0, 0, 0.25)',
} as const;
