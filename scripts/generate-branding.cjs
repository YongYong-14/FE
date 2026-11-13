/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'assets/branding');
const background = '#F9F7F2';
const options = {
  font: {
    loadSystemFonts: false,
    defaultFontFamily: 'Noto Sans KR',
    fontFiles: [
      path.join(
        root,
        'node_modules/@expo-google-fonts/noto-sans-kr/700Bold/NotoSansKR_700Bold.ttf',
      ),
      path.join(
        root,
        'node_modules/@expo-google-fonts/noto-sans-kr/900Black/NotoSansKR_900Black.ttf',
      ),
    ],
  },
};

// 원본 SVG는 그대로 보관한다. 렌더링에만 불필요한 메타데이터를 제외한다.
const read = (name) =>
  fs
    .readFileSync(path.join(destination, 'source', name), 'utf8')
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, '');
const inner = (svg) => svg.replace(/<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const square = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

function save(name, svg, width) {
  const renderer = new Resvg(svg, {
    ...options,
    ...(width ? { fitTo: { mode: 'width', value: width } } : {}),
  });
  const image = renderer.render();
  fs.writeFileSync(path.join(destination, name), image.asPng());
  process.stdout.write(`${name}: ${image.width}x${image.height}\n`);
}

/** 실제 알파 픽셀을 기준으로 중앙에 맞추고 Android의 원형 안전 영역 안에 넣는다. */
function fitInsideCircle(svg, radius) {
  const image = new Resvg(svg, options).render();
  const { width, height, pixels } = image;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[(y * width + x) * 4 + 3]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error('SVG artwork is empty');
  const centerX = (minX + maxX + 1) / 2;
  const centerY = (minY + maxY + 1) / 2;
  let extent = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pixels[(y * width + x) * 4 + 3])
        extent = Math.max(extent, Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY));
    }
  }
  const scale = radius / (extent + 2);
  return square(
    `<g transform="translate(512 512) scale(${scale}) translate(${-centerX} ${-centerY})">${inner(svg)}</g>`,
  );
}

const logo = read('seulkkamalkka_logo.svg');
const icon = read('seulkkamalkka_app_icon.svg');
const iconSymbol = icon.replace(/<rect\b[^>]*\bid="background"[^>]*\/>/, '');
const legacyScale = 1024 / 786;
const legacyIcon = square(
  `<rect width="1024" height="1024" fill="${background}"/><g transform="translate(0 ${(1024 - 734 * legacyScale) / 2}) scale(${legacyScale})">${inner(icon)}</g>`,
);

save('logo.png', logo, 1772);
save('app-icon.png', legacyIcon);
// 108dp 레이어의 중앙 66dp 안에 그림을 두고 런처가 배경에 마스크를 적용하게 한다.
save('adaptive-icon.png', fitInsideCircle(iconSymbol, 300));
// Expo의 240dp 이미지가 Android 12+의 192dp 원형 영역 안에 완전히 들어간다.
save('splash.png', fitInsideCircle(logo, 384));
save('favicon.png', legacyIcon, 256);
